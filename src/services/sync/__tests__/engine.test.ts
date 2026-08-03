import { describe, expect, it, vi } from 'vitest'
import { createSyncEngine, type SyncAdapter, type ContentsApi } from '../engine'
import type { Article, Config, Manifest, ManifestEntry, SyncPhase, Todo } from '@/types'
import { emptyManifest } from '@/services/github/manifest'

const config: Config = {
  enabled: true,
  repo: 'u/r',
  branch: 'main',
  path: '',
  token: 't',
  poll: 20000,
  apiBase: 'https://x',
}

function makeAdapter(over: Partial<SyncAdapter> = {}): SyncAdapter & { phases: SyncPhase[]; applied: unknown[] } {
  const obj: any = {
    phases: [] as SyncPhase[],
    applied: [] as unknown[],
    getConfig: () => config,
    isEnabled: () => true,
    getLocalArticles: () => [],
    getLocalManifestSha: () => undefined,
    applyRemote: (a: Article[], m: Manifest) => obj.applied.push([a, m]),
    setPhase: (p: SyncPhase) => obj.phases.push(p),
  }
  return Object.assign(obj, over)
}

/** 默认「远端空、推送成功」的 ContentsApi 替身；按需覆盖单个方法。 */
function makeContents(over: Partial<ContentsApi> = {}): ContentsApi {
  return {
    fetchManifest: vi.fn(async () => null),
    fetchArticles: vi.fn(async () => []),
    fetchTodos: vi.fn(async () => []),
    pushRemote: vi.fn(async () => ({ manifest: emptyManifest(), conflictSlug: null, manifestSha: 'x' })),
    ...over,
  }
}

function entry(id: string, updatedAt: number, over: Partial<ManifestEntry> = {}): ManifestEntry {
  return { id, title: id, updatedAt, deleted: false, sha: `${id}-sha`, ...over }
}

const localArticle: Article = {
  id: '1',
  title: 'A',
  content: '',
  fromTodo: '',
  tags: [],
  createdAt: 1,
  updatedAt: 1,
  deleted: false,
}

const localTodo: Todo = {
  id: 't1',
  title: '本地',
  desc: '',
  color: 'blue',
  status: 'todo',
  due: '',
  time: 1,
  articleId: '',
  createdAt: 1,
  updatedAt: 1,
  deleted: false,
}

describe('createSyncEngine', () => {
  it('未启用 → off 且不拉取（S22）', async () => {
    const adapter = makeAdapter({ isEnabled: () => false })
    const contents = makeContents()
    const e = createSyncEngine(adapter, contents)
    const r = await e.sync()
    expect(r).toEqual({ ok: true, merged: false, pushed: false })
    expect((adapter as any).phases).toContain('off')
    expect(contents.fetchManifest).not.toHaveBeenCalled()
  })

  it('冲突重试：第 1 次冲突后成功（S10）', async () => {
    const adapter = makeAdapter({ getLocalArticles: () => [localArticle] })
    let calls = 0
    const contents = makeContents({
      pushRemote: vi.fn(async () => {
        calls++
        if (calls === 1) return { manifest: emptyManifest(), conflictSlug: 'a', manifestSha: 'x' }
        return { manifest: emptyManifest(), conflictSlug: null, manifestSha: 'x' }
      }),
    })
    const e = createSyncEngine(adapter, contents)
    const r = await e.sync()
    expect(calls).toBe(2)
    expect(r.ok).toBe(true)
  })

  it('并发排队：两次 sync 复用同一 Promise（S11）', async () => {
    let fetchCount = 0
    const adapter = makeAdapter()
    const contents = makeContents({
      fetchManifest: vi.fn(async () => {
        fetchCount++
        return null
      }),
    })
    const e = createSyncEngine(adapter, contents)
    const [a, b] = await Promise.all([e.sync(), e.sync()])
    expect(fetchCount).toBe(1)
    expect(a).toBe(b)
  })

  it('超过最大重试 → error（S10）', async () => {
    const adapter = makeAdapter({ getLocalArticles: () => [localArticle] })
    const contents = makeContents({
      pushRemote: vi.fn(async () => ({ manifest: emptyManifest(), conflictSlug: 'a', manifestSha: 'x' })),
    })
    const e = createSyncEngine(adapter, contents)
    const r = await e.sync()
    expect(r.ok).toBe(false)
    expect((adapter as any).phases).toContain('error')
  })

  it('推送以刚拉取的远端 manifest sha 为乐观锁基准，而非本地陈旧 sha（S10 修复）', async () => {
    const adapter = makeAdapter({
      getLocalArticles: () => [localArticle],
      getLocalManifestSha: () => 'STALE_LOCAL_SHA',
    })
    const remoteSha = 'REMOTE_SHA_abc'
    const contents = makeContents({
      fetchManifest: vi.fn(async () => ({ manifest: emptyManifest(), sha: remoteSha })),
      pushRemote: vi.fn(async () => ({ manifest: emptyManifest(), conflictSlug: null, manifestSha: remoteSha })),
    })
    const e = createSyncEngine(adapter, contents)
    await e.sync()
    expect((contents.pushRemote as any).mock.calls[0][0].manifestSha).toBe(remoteSha)
    expect((contents.pushRemote as any).mock.calls[0][0].manifestSha).not.toBe('STALE_LOCAL_SHA')
  })

  it('远端无 manifest（首次同步）时以 undefined 推送，不依赖本地 sha', async () => {
    const adapter = makeAdapter({
      getLocalArticles: () => [localArticle],
      getLocalManifestSha: () => 'SOME_LOCAL_SHA',
    })
    const contents = makeContents()
    const e = createSyncEngine(adapter, contents)
    await e.sync()
    expect((contents.pushRemote as any).mock.calls[0][0].manifestSha).toBeUndefined()
  })

  it('待办与文章同轮 LWW 合并并一起推送（P1 ④）', async () => {
    const remoteTodo: Todo = { ...localTodo, title: '远端更新', updatedAt: 999 }
    const appliedTodos: Todo[][] = []
    const adapter = makeAdapter({
      getLocalArticles: () => [localArticle],
      getLocalTodos: () => [localTodo],
      applyRemoteTodos: (t: Todo[]) => appliedTodos.push(t),
    })
    const manifest: Manifest = { ...emptyManifest(), todos: { t1: entry('t1', 999) } }
    const contents = makeContents({
      fetchManifest: vi.fn(async () => ({ manifest, sha: 'ms' })),
      fetchTodos: vi.fn(async () => [remoteTodo]),
      pushRemote: vi.fn(async () => ({ manifest: emptyManifest(), conflictSlug: null, manifestSha: 'ms2' })),
    })
    const e = createSyncEngine(adapter, contents)
    const r = await e.sync()
    // 远端 updatedAt 更大 → 远端胜出，并写回本地
    expect(appliedTodos[0][0].title).toBe('远端更新')
    expect(r.merged).toBe(true)
    const pushArg = (contents.pushRemote as any).mock.calls[0][0]
    expect(pushArg.todos[0].title).toBe('远端更新')
    // 待办本地不领先 → 不在差分推送集合内
    expect(pushArg.todoIds).toEqual([])
    expect(pushArg.articleIds).toEqual(['1'])
  })

  it('适配器未实现 getLocalTodos 时退化为纯文章同步（向后兼容）', async () => {
    const adapter = makeAdapter({ getLocalArticles: () => [localArticle] })
    const contents = makeContents()
    const e = createSyncEngine(adapter, contents)
    await e.sync()
    expect((contents.pushRemote as any).mock.calls[0][0].todos).toBeUndefined()
    expect(contents.fetchTodos).not.toHaveBeenCalled()
  })

  // ── P2 ⑤ 索引驱动 ────────────────────────────────────
  it('只 GET 索引判定有差异的文件，未变更的不拉正文（P2 ⑤）', async () => {
    const stale: Article = { ...localArticle, id: 'old', updatedAt: 1 }
    const same: Article = { ...localArticle, id: 'same', updatedAt: 50 }
    const adapter = makeAdapter({ getLocalArticles: () => [stale, same] })
    const manifest: Manifest = {
      ...emptyManifest(),
      articles: {
        old: entry('old', 999), // 远端更新 → 需拉
        same: entry('same', 50), // 完全一致 → 不拉
        fresh: entry('fresh', 5), // 本地没有 → 需拉
      },
    }
    const contents = makeContents({ fetchManifest: vi.fn(async () => ({ manifest, sha: 'ms' })) })
    const e = createSyncEngine(adapter, contents)
    await e.sync()
    const ids = (contents.fetchArticles as any).mock.calls[0][0] as string[]
    expect([...ids].sort()).toEqual(['fresh', 'old'])
    expect(ids).not.toContain('same')
  })

  it('本地无领先变更时整轮不写远端，避免轮询刷空提交（P2 ⑤）', async () => {
    const same: Article = { ...localArticle, id: 'same', updatedAt: 50 }
    const adapter = makeAdapter({ getLocalArticles: () => [same] })
    const manifest: Manifest = { ...emptyManifest(), articles: { same: entry('same', 50) } }
    const contents = makeContents({ fetchManifest: vi.fn(async () => ({ manifest, sha: 'ms' })) })
    const e = createSyncEngine(adapter, contents)
    const r = await e.sync()
    expect(contents.pushRemote).not.toHaveBeenCalled()
    expect(r).toEqual({ ok: true, merged: false, pushed: false })
    expect((adapter as any).phases).toContain('ok')
  })

  it('差分推送只带本地领先的 id，并把远端索引作为基线传下去（P2 ⑤）', async () => {
    const ahead: Article = { ...localArticle, id: 'ahead', updatedAt: 999 }
    const same: Article = { ...localArticle, id: 'same', updatedAt: 50 }
    const adapter = makeAdapter({ getLocalArticles: () => [ahead, same] })
    const manifest: Manifest = {
      ...emptyManifest(),
      articles: { ahead: entry('ahead', 1), same: entry('same', 50) },
    }
    const contents = makeContents({ fetchManifest: vi.fn(async () => ({ manifest, sha: 'ms' })) })
    const e = createSyncEngine(adapter, contents)
    await e.sync()
    const pushArg = (contents.pushRemote as any).mock.calls[0][0]
    expect(pushArg.articleIds).toEqual(['ahead'])
    expect(pushArg.baseManifest).toBe(manifest)
    // 全量实体仍要传，供 pushRemote 取正文
    expect(pushArg.articles).toHaveLength(2)
  })

  it('远端墓碑不触发正文 GET（删除只靠索引传播，P2 ⑤）', async () => {
    const adapter = makeAdapter({ getLocalArticles: () => [] })
    const manifest: Manifest = {
      ...emptyManifest(),
      articles: { gone: entry('gone', 999, { deleted: true }) },
    }
    const contents = makeContents({
      fetchManifest: vi.fn(async () => ({ manifest, sha: 'ms' })),
      // 真实 fetchArticles 会跳过墓碑条目，这里断言引擎不因此产生推送
      fetchArticles: vi.fn(async () => []),
    })
    const e = createSyncEngine(adapter, contents)
    const r = await e.sync()
    expect(contents.pushRemote).not.toHaveBeenCalled()
    expect(r.ok).toBe(true)
  })
})
