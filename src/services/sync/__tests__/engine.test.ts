import { describe, expect, it, vi } from 'vitest'
import { createSyncEngine, type SyncAdapter, type ContentsApi } from '../engine'
import type { Article, Config, Manifest, SyncPhase } from '@/types'
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

describe('createSyncEngine', () => {
  it('未启用 → off 且不拉取（S22）', async () => {
    const adapter = makeAdapter({ isEnabled: () => false })
    const contents = { fetchRemote: vi.fn(), pushRemote: vi.fn() } as any
    const e = createSyncEngine(adapter, contents)
    const r = await e.sync()
    expect(r).toEqual({ ok: true, merged: false, pushed: false })
    expect((adapter as any).phases).toContain('off')
    expect(contents.fetchRemote).not.toHaveBeenCalled()
  })

  it('冲突重试：第 1 次冲突后成功（S10）', async () => {
    const adapter = makeAdapter({ getLocalArticles: () => [localArticle] })
    let calls = 0
    const contents: ContentsApi = {
      fetchRemote: vi.fn(async () => null),
      pushRemote: vi.fn(async () => {
        calls++
        if (calls === 1) return { manifest: emptyManifest(), conflictSlug: 'a', manifestSha: 'x' }
        return { manifest: emptyManifest(), conflictSlug: null, manifestSha: 'x' }
      }),
    }
    const e = createSyncEngine(adapter, contents)
    const r = await e.sync()
    expect(calls).toBe(2)
    expect(r.ok).toBe(true)
  })

  it('并发排队：两次 sync 复用同一 Promise（S11）', async () => {
    let fetchCount = 0
    const adapter = makeAdapter()
    const contents: ContentsApi = {
      fetchRemote: vi.fn(async () => {
        fetchCount++
        return null
      }),
      pushRemote: vi.fn(async () => ({ manifest: emptyManifest(), conflictSlug: null, manifestSha: 'x' })),
    }
    const e = createSyncEngine(adapter, contents)
    const [a, b] = await Promise.all([e.sync(), e.sync()])
    expect(fetchCount).toBe(1)
    expect(a).toBe(b)
  })

  it('超过最大重试 → error（S10）', async () => {
    const adapter = makeAdapter({ getLocalArticles: () => [localArticle] })
    const contents: ContentsApi = {
      fetchRemote: vi.fn(async () => null),
      pushRemote: vi.fn(async () => ({ manifest: emptyManifest(), conflictSlug: 'a', manifestSha: 'x' })),
    }
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
    const contents: ContentsApi = {
      fetchRemote: vi.fn(async () => ({
        manifest: emptyManifest(),
        manifestSha: remoteSha,
        articles: [],
      })),
      pushRemote: vi.fn(async () => ({ manifest: emptyManifest(), conflictSlug: null, manifestSha: remoteSha })),
    }
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
    const contents: ContentsApi = {
      fetchRemote: vi.fn(async () => null),
      pushRemote: vi.fn(async () => ({ manifest: emptyManifest(), conflictSlug: null, manifestSha: 'new' })),
    }
    const e = createSyncEngine(adapter, contents)
    await e.sync()
    expect((contents.pushRemote as any).mock.calls[0][0].manifestSha).toBeUndefined()
  })
})
