import type { Article, Config, Manifest, ManifestEntry, SyncPhase, Todo } from '@/types'
import { mergeArticles, mergeTodos } from '@/services/sync/merge'
import { emptyManifest, planDiff } from '@/services/github/manifest'
import { isConfigComplete } from '@/services/github/diagnose'

/** 本地数据适配器：引擎通过它与 Pinia store 解耦（便于单测）。 */
export interface SyncAdapter {
  getConfig(): Config
  isEnabled(): boolean
  getLocalArticles(): Article[]
  getLocalManifestSha(): string | undefined
  applyRemote(articles: Article[], manifest: Manifest): void
  setPhase(p: SyncPhase): void
  /** 推送成功后回填 manifest.json 的 sha（维护乐观锁，可选） */
  setManifestSha?(sha: string): void
  /** 本地待办（P1 ④）；未实现时本轮不同步待办，保持纯文章同步的旧行为 */
  getLocalTodos?(): Todo[]
  /** 待办合并结果写回本地（与 applyRemote 对称，可选） */
  applyRemoteTodos?(todos: Todo[], manifest: Manifest): void
}

export interface ContentsApi {
  /** 只取轻量索引（不含正文），索引驱动同步的入口 */
  fetchManifest(config: Config): Promise<{ manifest: Manifest; sha: string } | null>
  /** 按 id 差分拉取文章正文 */
  fetchArticles(ids: string[], index: Record<string, ManifestEntry>, config: Config): Promise<Article[]>
  /** 按 id 差分拉取待办 */
  fetchTodos(ids: string[], index: Record<string, ManifestEntry>, config: Config): Promise<Todo[]>
  pushRemote(
    input: {
      articles: Article[]
      manifestSha: string | undefined
      articleIds?: string[]
      todos?: Todo[]
      todoIds?: string[]
      baseManifest?: Manifest
    },
    config: Config,
  ): Promise<{ manifest: Manifest; conflictSlug: string | null; manifestSha: string }>
}

export interface SyncOutcome {
  ok: boolean
  merged: boolean
  pushed: boolean
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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function hidden(): boolean {
  return typeof document !== 'undefined' && document.hidden
}

/**
 * 同步引擎编排（对应 S1–S22，§3.3.2）。
 * 必须保留的踩坑行为：并发排队（S11）、空同步返回真值（S11）、冲突重试最多 3 次（S10）。
 */
export function createSyncEngine(adapter: SyncAdapter, contents: ContentsApi): SyncEngine {
  let pushTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let inFlight: Promise<SyncOutcome> | null = null

  async function doSync(): Promise<SyncOutcome> {
    if (!adapter.isEnabled()) {
      adapter.setPhase('off')
      return { ok: true, merged: false, pushed: false }
    }
    // 已启用但配置不完整：不发请求，保持本地模式，避免空 repo 触发 404 / 误报「同步失败」
    if (!isConfigComplete(adapter.getConfig())) {
      adapter.setPhase('off')
      return { ok: true, merged: false, pushed: false }
    }
    adapter.setPhase('syncing')
    try {
      let attempt = 0
      // 冲突重试循环（S10）
      while (true) {
        const config = adapter.getConfig()
        // 索引驱动（P2 ⑤）：一次轻量 GET 拿 manifest，再据差异按 id 差分拉取正文
        const remote = await contents.fetchManifest(config)
        const manifest = remote?.manifest ?? emptyManifest()

        const local = adapter.getLocalArticles()
        const aPlan = planDiff(local, manifest.articles)
        const pulled = aPlan.pull.length ? await contents.fetchArticles(aPlan.pull, manifest.articles, config) : []
        const merged = mergeArticles(local, pulled)
        // 合并结果写回本地（mergeInto 的 LWW 语义）
        adapter.applyRemote(merged.items, manifest)

        // 待办与文章同轮合并（P1 ④）：适配器未实现 getLocalTodos 时退化为纯文章同步
        const localTodos = adapter.getLocalTodos?.() ?? null
        const tPlan = localTodos ? planDiff(localTodos, manifest.todos) : null
        let mergedTodos: { items: Todo[]; changed: boolean } | null = null
        if (localTodos && tPlan) {
          const pulledTodos = tPlan.pull.length
            ? await contents.fetchTodos(tPlan.pull, manifest.todos ?? {}, config)
            : []
          mergedTodos = mergeTodos(localTodos, pulledTodos)
          adapter.applyRemoteTodos?.(mergedTodos.items, manifest)
        }

        const changed = merged.changed || Boolean(mergedTodos?.changed)
        // 本地无领先变更时整轮不写远端。否则每次轮询都会重写 manifest.json（其 updatedAt 每次都变）
        // 从而给数据仓库刷出一串空提交。
        if (aPlan.push.length === 0 && (tPlan?.push.length ?? 0) === 0) {
          adapter.setPhase('ok')
          if (remote) adapter.setManifestSha?.(remote.sha)
          return { ok: true, merged: changed, pushed: false }
        }

        const pushResult = await contents.pushRemote(
          // 必须用刚拉取到的远端 manifest sha 作为乐观锁基准，而非本地陈旧 sha；
          // 否则远端已被改动时会被 GitHub 409 拒绝，且冲突重试循环每次重拉后仍用旧 sha → 死循环 → 同步失败
          {
            articles: merged.items,
            articleIds: aPlan.push,
            manifestSha: remote ? remote.sha : undefined,
            todos: mergedTodos ? mergedTodos.items : undefined,
            todoIds: tPlan ? tPlan.push : undefined,
            baseManifest: manifest,
          },
          config,
        )
        if (pushResult.conflictSlug) {
          attempt++
          if (attempt >= MAX_RETRY) {
            adapter.setPhase('error')
            return { ok: false, merged: changed, pushed: false }
          }
          await sleep(RETRY_BACKOFF * attempt)
          continue
        }
        adapter.setPhase('ok')
        adapter.setManifestSha?.(pushResult.manifestSha)
        return { ok: true, merged: changed, pushed: true }
      }
    } catch {
      adapter.setPhase('error')
      return { ok: false, merged: false, pushed: false }
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
