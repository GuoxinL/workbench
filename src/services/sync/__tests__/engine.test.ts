import { describe, expect, it, vi } from 'vitest'
import { createSyncEngine, type SyncAdapter, type ContentsApi } from '../engine'
import type { PushResult } from '@/services/github/contents'
import type { Article, Config, SyncPhase, Todo } from '@/types'
import { gitBlobSha } from '@/services/github/blobSha'
import { serializeArticle } from '@/services/github/contents'

const config: Config = {
  enabled: true,
  repo: 'u/r',
  branch: 'main',
  path: '',
  token: 't',
  poll: 20000,
  apiBase: 'https://x',
}

function makeAdapter(over: Partial<SyncAdapter> = {}): SyncAdapter & {
  phases: SyncPhase[]
  applied: unknown[]
  syncStates: Record<string, string>[]
  purged: string[]
} {
  const obj: any = {
    phases: [] as SyncPhase[],
    applied: [] as unknown[],
    syncStates: [] as Record<string, string>[],
    purged: [] as string[],
    getConfig: () => config,
    isEnabled: () => true,
    getLocalArticles: () => [],
    getSyncState: () => ({}),
    setSyncState: (m: Record<string, string>) => obj.syncStates.push(m),
    applyRemote: (a: Article[]) => obj.applied.push(a),
    setPhase: (p: SyncPhase) => obj.phases.push(p),
    purgeLocal: (id: string) => obj.purged.push(id),
  }
  return Object.assign(obj, over)
}

/** 默认「远端空、推送成功」的 ContentsApi 替身；按需覆盖单个方法。 */
function makeContents(over: Partial<ContentsApi> = {}): ContentsApi {
  return {
    fetchIndex: vi.fn(async () => ({ articles: {}, todos: {} })),
    fetchArticles: vi.fn(async () => []),
    fetchTodos: vi.fn(async () => []),
    pushRemote: vi.fn(async (): Promise<PushResult> => ({ conflictSlug: null, shaByPath: {}, deletedPaths: [] })),
    ...over,
  }
}

const localArticle: Article = {
  id: '1', title: 'A', content: '', fromTodo: '', tags: [], createdAt: 1, updatedAt: 1, deleted: false,
}

const localTodo: Todo = {
  id: 't1', title: '本地', desc: '', color: 'blue', status: 'todo',
  due: '', time: 1, articleId: '', createdAt: 1, updatedAt: 1, deleted: false,
}

describe('createSyncEngine（目录树索引 + 每文件 blob sha）', () => {
  it('未启用 → off 且不拉取', async () => {
    const adapter = makeAdapter({ isEnabled: () => false })
    const contents = makeContents()
    const e = createSyncEngine(adapter, contents)
    const r = await e.sync()
    expect(r).toEqual({ ok: true, merged: false, pushed: false, pulled: 0, pushedN: 0, deleted: 0 })
    expect((adapter as any).phases).toContain('off')
    expect(contents.fetchIndex).not.toHaveBeenCalled()
  })

  it('冲突重试：第 1 次冲突后成功（S10）', async () => {
    const adapter = makeAdapter({ getLocalArticles: () => [localArticle] })
    let calls = 0
    const contents = makeContents({
      pushRemote: vi.fn(async (): Promise<PushResult> => {
        calls++
        if (calls === 1) return { conflictSlug: 'kb/1.md', shaByPath: {}, deletedPaths: [] }
        return { conflictSlug: null, shaByPath: { 'kb/1.md': 'new' }, deletedPaths: [] }
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
      fetchIndex: vi.fn(async () => {
        fetchCount++
        return { articles: {}, todos: {} }
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
      pushRemote: vi.fn(async (): Promise<PushResult> => ({ conflictSlug: 'kb/1.md', shaByPath: {}, deletedPaths: [] })),
    })
    const e = createSyncEngine(adapter, contents)
    const r = await e.sync()
    expect(r.ok).toBe(false)
    expect((adapter as any).phases).toContain('error')
  })

  it('推送以刚拉取的目录树 sha 作乐观锁基准', async () => {
    const adapter = makeAdapter({ getLocalArticles: () => [localArticle] })
    const remoteSha = 'REMOTE_SHA_abc'
    const contents = makeContents({
      fetchIndex: vi.fn(async () => ({ articles: { '1': remoteSha }, todos: {} })),
      fetchArticles: vi.fn(async () => [localArticle]),
      pushRemote: vi.fn(async (): Promise<PushResult> => ({ conflictSlug: null, shaByPath: { 'kb/1.md': 'new' }, deletedPaths: [] })),
    })
    const e = createSyncEngine(adapter, contents)
    await e.sync()
    const arg = (contents.pushRemote as any).mock.calls[0][0]
    expect(arg.treeShaByPath['kb/1.md']).toBe(remoteSha)
  })

  it('首轮（远端空索引）本地文件按新建推送，treeSha 锁为 undefined', async () => {
    const adapter = makeAdapter({ getLocalArticles: () => [localArticle] })
    const contents = makeContents()
    const e = createSyncEngine(adapter, contents)
    await e.sync()
    const arg = (contents.pushRemote as any).mock.calls[0][0]
    expect(arg.treeShaByPath['kb/1.md']).toBeUndefined()
    expect(arg.pushIds).toEqual(['1'])
  })

  it('待办与文章同轮 LWW 合并并一起推送（冲突合并语义）', async () => {
    const remoteTodo: Todo = { ...localTodo, title: '远端更新', updatedAt: 999 }
    const appliedTodos: Todo[][] = []
    const adapter = makeAdapter({
      getLocalArticles: () => [localArticle],
      getLocalTodos: () => [localTodo],
      applyRemoteTodos: (t: Todo[]) => appliedTodos.push(t),
    })
    const contents = makeContents({
      fetchIndex: vi.fn(async () => ({ articles: {}, todos: { t1: 'ts' } })),
      fetchTodos: vi.fn(async () => [remoteTodo]),
      pushRemote: vi.fn(async (): Promise<PushResult> => ({ conflictSlug: null, shaByPath: { 'kb/1.md': 'n', 'todos/t1.json': 'nt' }, deletedPaths: [] })),
    })
    const e = createSyncEngine(adapter, contents)
    const r = await e.sync()
    // 远端 updatedAt 更大 → 远端胜出，并写回本地
    expect(appliedTodos[0][0].title).toBe('远端更新')
    expect(r.merged).toBe(true)
    const arg = (contents.pushRemote as any).mock.calls[0][0]
    expect(arg.todoPushIds).toContain('t1')
    expect(arg.pushIds).toEqual(['1'])
  })

  it('适配器未实现 getLocalTodos 时退化为纯文章同步（向后兼容）', async () => {
    const adapter = makeAdapter({ getLocalArticles: () => [localArticle] })
    const contents = makeContents()
    const e = createSyncEngine(adapter, contents)
    await e.sync()
    expect((contents.pushRemote as any).mock.calls[0][0].todoPushIds).toEqual([])
    expect(contents.fetchTodos).not.toHaveBeenCalled()
  })

  it('只 GET 索引判定有差异的文件（P2 ⑤ → 目录树索引），未变更的不拉正文', async () => {
    const stale: Article = { ...localArticle, id: 'old', updatedAt: 1 }
    const same: Article = { ...localArticle, id: 'same', updatedAt: 50 }
    const lshOld = await gitBlobSha(serializeArticle(stale))
    const lshSame = await gitBlobSha(serializeArticle(same))
    const adapter = makeAdapter({ getLocalArticles: () => [stale, same] })
    const contents = makeContents({
      fetchIndex: vi.fn(async () => ({
        articles: { old: 'remote-other', same: lshSame, fresh: 'fresh-sha' },
        todos: {},
      })),
    })
    ;(adapter as any).getSyncState = () => ({ 'kb/old.md': lshOld, 'kb/same.md': lshSame })
    ;(adapter as any).setSyncState = () => {}
    const e = createSyncEngine(adapter, contents)
    await e.sync()
    const ids = (contents.fetchArticles as any).mock.calls[0][0] as string[]
    expect([...ids].sort()).toEqual(['fresh', 'old'])
    expect(ids).not.toContain('same')
  })

  it('sha 全一致 → 静默 uptodate，整轮不写远端（替代旧 ok 短路）', async () => {
    const same: Article = { ...localArticle, id: 'same', updatedAt: 50 }
    const lshSame = await gitBlobSha(serializeArticle(same))
    const adapter = makeAdapter({ getLocalArticles: () => [same] })
    const contents = makeContents({
      fetchIndex: vi.fn(async () => ({ articles: { same: lshSame }, todos: {} })),
    })
    ;(adapter as any).getSyncState = () => ({ 'kb/same.md': lshSame })
    ;(adapter as any).setSyncState = () => {}
    const e = createSyncEngine(adapter, contents)
    const r = await e.sync()
    expect(contents.pushRemote).not.toHaveBeenCalled()
    expect(r).toEqual({ ok: true, merged: false, pushed: false, pulled: 0, pushedN: 0, deleted: 0 })
    expect((adapter as any).phases).toContain('uptodate')
  })

  it('本地领先的 id 进入 pushIds，并以远端树 sha 作锁', async () => {
    const ahead: Article = { ...localArticle, id: 'ahead', updatedAt: 999, content: 'changed' }
    const same: Article = { ...localArticle, id: 'same', updatedAt: 50, content: 'same' }
    const lshSame = await gitBlobSha(serializeArticle(same))
    const adapter = makeAdapter({ getLocalArticles: () => [ahead, same] })
    const contents = makeContents({
      fetchIndex: vi.fn(async () => ({ articles: { ahead: 'BASE_SHA', same: lshSame }, todos: {} })),
    })
    ;(adapter as any).getSyncState = () => ({ 'kb/ahead.md': 'BASE_SHA', 'kb/same.md': lshSame })
    ;(adapter as any).setSyncState = () => {}
    const e = createSyncEngine(adapter, contents)
    await e.sync()
    const arg = (contents.pushRemote as any).mock.calls[0][0]
    expect(arg.pushIds).toEqual(['ahead'])
    expect(arg.treeShaByPath['kb/ahead.md']).toBe('BASE_SHA')
    expect(arg.articles).toHaveLength(2)
  })

  it('本地软删除且远端有 → 发 DELETE 并清理本地墓碑（替代旧 manifest 墓碑传播）', async () => {
    const gone: Article = { ...localArticle, id: 'gone', deleted: true }
    const adapter = makeAdapter({ getLocalArticles: () => [gone] })
    const contents = makeContents({
      fetchIndex: vi.fn(async () => ({ articles: { gone: 'GONE_SHA' }, todos: {} })),
      pushRemote: vi.fn(async (input: any): Promise<PushResult> => ({
        conflictSlug: null,
        shaByPath: {},
        deletedPaths: input.delIds.map((id: string) => `kb/${id}.md`),
      })),
    })
    const e = createSyncEngine(adapter, contents)
    const r = await e.sync()
    const arg = (contents.pushRemote as any).mock.calls[0][0]
    expect(arg.delIds).toEqual(['gone'])
    expect(arg.pushIds).toEqual([])
    expect((adapter as any).purged).toContain('gone')
    expect(r.deleted).toBe(1)
    expect((adapter as any).phases).toContain('ok')
  })

  it('发生 PULL 时 applyRemote 合并而非整体替换，本地独有文章不丢失（数据丢失 bug 回归）', async () => {
    // 本地有 [localOnly(仅本地), remote(远端有更新)]；远端只拉取 remote 这一篇。
    // 若 applyRemote 整体替换，localOnly 会被静默抹除。正确实现应按 id 合并保留。
    const localOnly: Article = { ...localArticle, id: 'localOnly', title: '本地独有' }
    const remote: Article = { ...localArticle, id: 'remote', title: '远端更新', updatedAt: 100, content: 'r' }
    const lsh = await gitBlobSha(serializeArticle(remote))
    const articles: Article[] = [localOnly, remote]
    const adapter = makeAdapter({
      getLocalArticles: () => articles,
      applyRemote: (incoming: Article[]) => {
        const map = new Map(articles.map((x) => [x.id, x]))
        for (const a of incoming) map.set(a.id, a)
        articles.length = 0
        articles.push(...map.values())
      },
      getSyncState: () => ({ 'kb/remote.md': lsh }),
      setSyncState: () => {},
    })
    const contents = makeContents({
      fetchIndex: vi.fn(async () => ({ articles: { remote: 'REMOTE_SHA_DIFF' }, todos: {} })),
      fetchArticles: vi.fn(async () => [remote]),
      pushRemote: vi.fn(async (): Promise<PushResult> => ({ conflictSlug: null, shaByPath: {}, deletedPaths: [] })),
    })
    const e = createSyncEngine(adapter, contents)
    await e.sync()
    const ids = articles.map((a) => a.id)
    expect(ids).toContain('localOnly')
    expect(ids).toContain('remote')
  })
})
