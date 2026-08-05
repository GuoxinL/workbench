import type { Article, Config, SyncPhase, Todo } from '@/types'
import { mergeArticles, mergeTodos } from '@/services/sync/merge'
import { gitBlobSha } from '@/services/github/blobSha'
import type { RemoteIndex } from '@/services/github/listDir'
import { serializeArticle, serializeTodo, type PushInput, type PushResult } from '@/services/github/contents'
import { isConfigComplete } from '@/services/github/diagnose'
import { planSync, type SyncItem } from '@/services/sync/diff'

/** 本地数据适配器：引擎通过它与 Pinia store 解耦（便于单测）。 */
export interface SyncAdapter {
  getConfig(): Config
  isEnabled(): boolean
  getLocalArticles(): Article[]
  /** 本地基线（path → blob sha）；替代旧的单值 manifestSha（守红线 4，仅经 data.ts 读写） */
  getSyncState(): Record<string, string>
  setSyncState(state: Record<string, string>): void
  applyRemote(articles: Article[]): void
  setPhase(p: SyncPhase, errorMsg?: string): void
  /** 远端删除成功后，从本地移除墓碑实体（彻底清理软删除，避免反复尝试 DELETE） */
  purgeLocal(id: string, kind: 'article' | 'todo'): void
  /** 本地待办（P1 ④）；未实现时本轮不同步待办，保持纯文章同步的旧行为 */
  getLocalTodos?(): Todo[]
  /** 待办合并结果写回本地（与 applyRemote 对称，可选） */
  applyRemoteTodos?(todos: Todo[]): void
  /** 本轮回填传输计数（供 PC 状态指示器展示「↑2 ↓1」），可选 */
  setSyncMeta?(info: { pulled: number; pushedN: number; deleted: number }): void
}

export interface ContentsApi {
  /** 现拉目录树索引（id → blob sha），替代旧中央 manifest.json */
  fetchIndex(config: Config): Promise<RemoteIndex>
  /** 按 id 差分拉取文章正文 */
  fetchArticles(ids: string[], config: Config): Promise<Article[]>
  /** 按 id 差分拉取待办 */
  fetchTodos(ids: string[], config: Config): Promise<Todo[]>
  pushRemote(input: PushInput, config: Config): Promise<PushResult>
}

export interface SyncOutcome {
  ok: boolean
  merged: boolean
  pushed: boolean
  /** 本轮回填的远端条数（pull） */
  pulled: number
  /** 本轮回填/推送到远端的条数（push + conflict 合并） */
  pushedN: number
  /** 本轮回填删除的远端条数 */
  deleted: number
}

export interface SyncEngine {
  /** 防抖推送（S3，1.5s） */
  schedulePush(): void
  /** 同步（手动或非静默）；返回统一结构（S7 改进点） */
  sync(manual?: boolean): Promise<SyncOutcome>
  /** 定时拉取（S4） */
  startPolling(): void
  stopPolling(): void
}

const PUSH_DEBOUNCE = 1500
const MAX_RETRY = 3
const RETRY_BACKOFF = 350
const MIN_POLL = 5000
const MAX_POLL = 300000

const KB = (id: string) => `kb/${id}.md`
const TD = (id: string) => `todos/${id}.json`

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function hidden(): boolean {
  return typeof document !== 'undefined' && document.hidden
}

/** path → sha 基线投影成「id → sha」（按 collections 分别处理）。 */
function pickBase(base: Record<string, string>, kind: 'kb' | 'todos'): Record<string, string> {
  const prefix = kind === 'kb' ? 'kb/' : 'todos/'
  const suffix = kind === 'kb' ? '.md' : '.json'
  const out: Record<string, string> = {}
  for (const [path, sha] of Object.entries(base)) {
    if (path.startsWith(prefix) && path.endsWith(suffix)) {
      out[path.slice(prefix.length, -suffix.length)] = sha
    }
  }
  return out
}

function okOutcome(over: Partial<SyncOutcome> = {}): SyncOutcome {
  return { ok: true, merged: false, pushed: false, pulled: 0, pushedN: 0, deleted: 0, ...over }
}

/**
 * 同步引擎编排（对应 S1–S22，§3.3.2）。
 * 必须保留的踩坑行为：并发排队（S11）、冲突重试最多 3 次（S10）。
 *
 * 索引驱动 + 每文件 sha 判定（替代旧 manifest.json 中央索引）：
 * 1. 现拉目录树索引（id → sha）；2. 本地算每篇 git blob sha；3. 三态判定（矩阵 A–G）；
 * 4. 按 id 差分 GET/PULL、PUT/PUSH、DELETE；5. 每成功一次更新本地基线并落盘。
 */
export function createSyncEngine(adapter: SyncAdapter, contents: ContentsApi): SyncEngine {
  let pushTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let inFlight: Promise<SyncOutcome> | null = null

  async function doSync(): Promise<SyncOutcome> {
    if (!adapter.isEnabled()) {
      adapter.setPhase('off')
      return okOutcome()
    }
    // 已启用但配置不完整：不发请求，保持本地模式，避免空 repo 触发 404 / 误报「同步失败」
    if (!isConfigComplete(adapter.getConfig())) {
      adapter.setPhase('off')
      return okOutcome()
    }
    adapter.setPhase('syncing')
    try {
      let attempt = 0
      // 冲突重试循环（S10）
      while (true) {
        const config = adapter.getConfig()
        // 1. 现拉目录树索引（替代读 manifest.json）
        const tree: RemoteIndex = await contents.fetchIndex(config)
        const base = adapter.getSyncState()

        const localArticles = adapter.getLocalArticles()
        const localTodos = adapter.getLocalTodos?.() ?? []

        // 2. 本地算每篇 git blob sha
        const aLocal: SyncItem[] = await Promise.all(
          localArticles.map(async (a) => ({
            id: a.id,
            deleted: a.deleted,
            localSha: await gitBlobSha(serializeArticle(a)),
          })),
        )
        const tLocal: SyncItem[] = await Promise.all(
          localTodos.map(async (t) => ({
            id: t.id,
            deleted: t.deleted,
            localSha: await gitBlobSha(serializeTodo(t)),
          })),
        )

        // 3. 三态判定（矩阵 A–G）
        const aPlan = planSync(aLocal, tree.articles, pickBase(base, 'kb'))
        const tPlan = planSync(tLocal, tree.todos, pickBase(base, 'todos'))

        // 4a. 全无差异 → 静默 uptodate（不写远端、不弹提示，只刷「上次检查时间」）
        const aWork =
          aPlan.pull.length + aPlan.push.length + aPlan.del.length + aPlan.conflicts.length
        const tWork =
          tPlan.pull.length + tPlan.push.length + tPlan.del.length + tPlan.conflicts.length
        if (aWork === 0 && tWork === 0) {
          adapter.setPhase('uptodate')
          return okOutcome()
        }

        // 4b. PULL：拉取远端较新/仅远端有的正文，LWW 合并进本地
        const pulledArticles = aPlan.pull.length ? await contents.fetchArticles(aPlan.pull, config) : []
        const pulledTodos = tPlan.pull.length ? await contents.fetchTodos(tPlan.pull, config) : []
        if (pulledArticles.length) adapter.applyRemote(pulledArticles)
        if (pulledTodos.length) adapter.applyRemoteTodos?.(pulledTodos)

        // 4c. CONFLICT：GET 远端 → 按 updatedAt LWW 合并 → 合并结果纳入推送
        let mergedArticles: Article[] = []
        let mergedTodos: Todo[] = []
        if (aPlan.conflicts.length) {
          const remote = await contents.fetchArticles(aPlan.conflicts, config)
          mergedArticles = mergeArticles(
            localArticles.filter((a) => aPlan.conflicts.includes(a.id)),
            remote,
          ).items
          if (mergedArticles.length) adapter.applyRemote(mergedArticles)
        }
        if (tPlan.conflicts.length) {
          const remote = await contents.fetchTodos(tPlan.conflicts, config)
          mergedTodos = mergeTodos(
            localTodos.filter((t) => tPlan.conflicts.includes(t.id)),
            remote,
          ).items
          if (mergedTodos.length) adapter.applyRemoteTodos?.(mergedTodos)
        }

        // 应用 pull/merge 后重新读取本地（作为推送正文源）
        const finalArticles = adapter.getLocalArticles()
        const finalTodos = adapter.getLocalTodos?.() ?? []

        const pushIds = [...aPlan.push, ...aPlan.conflicts]
        const todoPushIds = [...tPlan.push, ...tPlan.conflicts]
        const delIds = aPlan.del
        const todoDelIds = tPlan.del

        // 乐观锁：刚拉到的目录树 sha
        const treeShaByPath: Record<string, string> = {}
        for (const [id, sha] of Object.entries(tree.articles)) treeShaByPath[KB(id)] = sha
        for (const [id, sha] of Object.entries(tree.todos)) treeShaByPath[TD(id)] = sha

        const pushInput: PushInput = {
          articles: finalArticles,
          pushIds,
          todos: finalTodos,
          todoPushIds,
          delIds,
          todoDelIds,
          treeShaByPath,
        }
        const result: PushResult = await contents.pushRemote(pushInput, config)

        if (result.conflictSlug) {
          attempt++
          if (attempt >= MAX_RETRY) {
            // Bug #3 修复：冲突重试耗尽时透传具体错误，给用户可诊断线索
            adapter.setPhase('error', `推送冲突，已重试 ${MAX_RETRY} 次：${result.conflictSlug}`)
            return {
              ok: false,
              merged: mergedArticles.length > 0 || mergedTodos.length > 0,
              pushed: false,
              pulled: pulledArticles.length + pulledTodos.length,
              pushedN: 0,
              deleted: 0,
            }
          }
          await sleep(RETRY_BACKOFF * attempt)
          continue
        }

        // 5. 成功：更新本地基线（path → 新 sha），删除项移除基线条目
        const newBase = { ...base }
        for (const [path, sha] of Object.entries(result.shaByPath)) newBase[path] = sha
        for (const path of result.deletedPaths) delete newBase[path]
        adapter.setSyncState(newBase)

        // 远端删除成功 → 清理本地墓碑实体
        for (const path of result.deletedPaths) {
          const m = path.match(/^kb\/(.+)\.md$/)
          if (m) adapter.purgeLocal(m[1], 'article')
          const t = path.match(/^todos\/(.+)\.json$/)
          if (t) adapter.purgeLocal(t[1], 'todo')
        }

        const pulledN = pulledArticles.length + pulledTodos.length
        const pushedN = Object.keys(result.shaByPath).length
        const deletedN = result.deletedPaths.length
        adapter.setSyncMeta?.({ pulled: pulledN, pushedN, deleted: deletedN })
        adapter.setPhase('ok')
        return okOutcome({
          merged: pulledN > 0 || mergedArticles.length > 0 || mergedTodos.length > 0,
          pushed: pushedN > 0 || deletedN > 0,
          pulled: pulledN,
          pushedN,
          deleted: deletedN,
        })
      }
    } catch (e) {
      // Bug #3 修复：捕获详细错误，避免「同步失败」裸 chip；strip 堆栈只留 message
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      adapter.setPhase('error', msg)
      return { ok: false, merged: false, pushed: false, pulled: 0, pushedN: 0, deleted: 0 }
    }
  }

  function sync(manual = false): Promise<SyncOutcome> {
    void manual
    // 并发排队：复用进行中的 Promise，而非"忙就返回 false"（commit 81429d7）
    if (inFlight) return inFlight
    inFlight = doSync().finally(() => {
      inFlight = null
    })
    return inFlight
  }

  function schedulePush() {
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(() => {
      sync(false)
    }, PUSH_DEBOUNCE)
  }

  function startPolling() {
    const ms = Math.min(MAX_POLL, Math.max(MIN_POLL, adapter.getConfig().poll))
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = setInterval(() => {
      if (hidden()) return // document.hidden 时跳过（S4）
      sync(false)
    }, ms)
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  return { schedulePush, sync, startPolling, stopPolling }
}
