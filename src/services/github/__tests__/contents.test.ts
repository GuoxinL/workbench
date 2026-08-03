import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchArticles, fetchManifest, fetchTodos, pushRemote } from '../contents'
import type { Article, Config, Manifest, ManifestEntry, Todo } from '@/types'

const config: Config = {
  enabled: true,
  repo: 'u/r',
  branch: 'main',
  path: '',
  token: 't',
  poll: 20000,
  apiBase: 'https://x',
}

function b64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function entry(id: string, updatedAt: number, over: Partial<ManifestEntry> = {}): ManifestEntry {
  return { id, title: id, updatedAt, deleted: false, sha: `${id}-sha`, ...over }
}

describe('contents', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetchArticles 按 id 拉取并解析 frontmatter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('kb/1.md')) return new Response(JSON.stringify({ content: b64('---\ntitle: "A"\n---\n正文'), sha: 'as' }), { status: 200, headers: { etag: 'as' } })
        return new Response('', { status: 404 })
      }),
    )
    const index = { '1': { id: '1', title: 'A', updatedAt: 100, deleted: false, sha: 's' } }
    const articles = await fetchArticles(['1'], index, config)
    expect(articles).toHaveLength(1)
    expect(articles[0].title).toBe('A')
    expect(articles[0].content).toBe('正文')
  })

  it('fetchManifest 只读索引，一次请求且不触碰任何正文（P2 ⑤）', async () => {
    const m: Manifest = {
      version: 1,
      updatedAt: 1,
      articles: { '1': entry('1', 100), '2': entry('2', 200) },
      todos: { t1: entry('t1', 300) },
    }
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url)
        if (url.includes('manifest.json')) return new Response(JSON.stringify({ content: b64(JSON.stringify(m)), sha: 'ms' }), { status: 200, headers: { etag: 'ms' } })
        return new Response('', { status: 404 })
      }),
    )
    const r = await fetchManifest(config)
    expect(r?.sha).toBe('ms')
    expect(Object.keys(r!.manifest.articles)).toHaveLength(2)
    expect(urls).toHaveLength(1)
    expect(urls.some((u) => u.includes('kb/'))).toBe(false)
  })

  it('fetchArticles 跳过墓碑条目，不发正文请求（P2 ⑤）', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url)
        return new Response('', { status: 404 })
      }),
    )
    const index = { gone: entry('gone', 100, { deleted: true }) }
    const articles = await fetchArticles(['gone'], index, config)
    expect(articles).toHaveLength(0)
    expect(urls).toHaveLength(0)
  })

  it('pushRemote 逐文件 PUT + 更新 manifest', async () => {
    const puts: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        puts.push(url)
        return new Response(JSON.stringify({ content: b64('x'), sha: 'new' }), { status: 200, headers: { etag: 'new' } })
      }),
    )
    const articles: Article[] = [
      { id: '1', title: 'A', content: '正文', fromTodo: '', tags: ['x'], createdAt: 1, updatedAt: 100, deleted: false },
    ]
    const r = await pushRemote({ articles, manifestSha: undefined }, config)
    expect(r.conflictSlug).toBeNull()
    expect(puts.some((u) => u.includes('kb/1.md'))).toBe(true)
    expect(puts.some((u) => u.includes('manifest.json'))).toBe(true)
    expect(r.manifest.articles['1'].sha).toBe('new')
  })

  it('pushRemote 更新已存在文件时携带远端 blob sha（修复 GitHub 422）', async () => {
    const bodies: any[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: any) => {
        if (init && init.method === 'PUT') bodies.push(JSON.parse(init.body))
        return new Response(JSON.stringify({ content: b64('x'), sha: 'new' }), { status: 200, headers: { etag: 'new' } })
      }),
    )
    const articles: Article[] = [
      { id: '1', title: 'A', content: '正文', fromTodo: '', tags: [], createdAt: 1, updatedAt: 100, deleted: false },
    ]
    const baseManifest: Manifest = {
      version: 1,
      updatedAt: 1,
      articles: { '1': entry('1', 1, { sha: 'REMOTE_SHA_A' }) },
      todos: {},
    }
    const r = await pushRemote({ articles, manifestSha: undefined, baseManifest }, config)
    expect(r.conflictSlug).toBeNull()
    const filePut = bodies.find((b) => b.message === 'update A')
    expect(filePut).toBeTruthy()
    expect(filePut.sha).toBe('REMOTE_SHA_A')
  })

  // ── P2 ⑤ 差分推送 ────────────────────────────────────
  it('pushRemote 只 PUT articleIds 命中的文件（P2 ⑤）', async () => {
    const puts: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: any) => {
        if (init && init.method === 'PUT') puts.push(url)
        return new Response(JSON.stringify({ content: b64('x'), sha: 'new' }), { status: 200, headers: { etag: 'new' } })
      }),
    )
    const articles: Article[] = [
      { id: 'ahead', title: '改过', content: '', fromTodo: '', tags: [], createdAt: 1, updatedAt: 999, deleted: false },
      { id: 'same', title: '没改', content: '', fromTodo: '', tags: [], createdAt: 1, updatedAt: 50, deleted: false },
    ]
    const baseManifest: Manifest = {
      version: 1,
      updatedAt: 1,
      articles: { ahead: entry('ahead', 1), same: entry('same', 50) },
      todos: {},
    }
    const r = await pushRemote({ articles, articleIds: ['ahead'], baseManifest, manifestSha: 'ms' }, config)
    expect(puts.filter((u) => u.includes('kb/'))).toEqual([expect.stringContaining('kb/ahead.md')])
    // 未推送的条目原样保留远端索引（含其 sha），不会被洗成空串
    expect(r.manifest.articles['same'].sha).toBe('same-sha')
    expect(r.manifest.articles['ahead'].updatedAt).toBe(999)
  })

  it('pushRemote 不用本地陈旧副本复活远端墓碑（P2 ⑤）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ content: b64('x'), sha: 'new' }), { status: 200, headers: { etag: 'new' } })),
    )
    // 本地还留着 old 的存活旧副本，但远端已是更新的墓碑 → old 不在推送集合内
    const articles: Article[] = [
      { id: 'old', title: '本地旧的', content: '', fromTodo: '', tags: [], createdAt: 1, updatedAt: 1, deleted: false },
      { id: 'new1', title: '新的', content: '', fromTodo: '', tags: [], createdAt: 1, updatedAt: 9, deleted: false },
    ]
    const baseManifest: Manifest = {
      version: 1,
      updatedAt: 1,
      articles: { old: entry('old', 999, { deleted: true }) },
      todos: {},
    }
    const r = await pushRemote({ articles, articleIds: ['new1'], baseManifest, manifestSha: 'ms' }, config)
    expect(r.manifest.articles['old'].deleted).toBe(true)
    expect(r.manifest.articles['old'].updatedAt).toBe(999)
  })

  // ── P1 ④ 待办远端单文件化（todos/<id>.json + manifest.todos） ──
  const todo: Todo = {
    id: 't1',
    title: '待办甲',
    desc: '',
    color: 'blue',
    status: 'todo',
    due: '',
    time: 5,
    articleId: '',
    createdAt: 1,
    updatedAt: 100,
    deleted: false,
  }

  it('fetchTodos 读取 todos/<id>.json 并经 Zod 校验组装（P1 ④）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('todos/t1.json')) return new Response(JSON.stringify({ content: b64(JSON.stringify(todo)), sha: 'ts' }), { status: 200, headers: { etag: 'ts' } })
        return new Response('', { status: 404 })
      }),
    )
    const index = { t1: { id: 't1', title: '待办甲', updatedAt: 100, deleted: false, sha: 'ts' } }
    const todos = await fetchTodos(['t1'], index, config)
    expect(todos).toHaveLength(1)
    expect(todos[0].title).toBe('待办甲')
  })

  it('fetchTodos 丢弃校验不过的远端待办，不影响整轮同步（P1 ④）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('todos/t1.json')) return new Response(JSON.stringify({ content: b64('{"id":"t1"}'), sha: 'ts' }), { status: 200, headers: { etag: 'ts' } })
        return new Response('', { status: 404 })
      }),
    )
    const index = { t1: { id: 't1', title: '脏数据', updatedAt: 100, deleted: false, sha: 'ts' } }
    const todos = await fetchTodos(['t1'], index, config)
    expect(todos).toHaveLength(0)
  })

  it('pushRemote 写 todos/<id>.json 并填 manifest.todos（P1 ④）', async () => {
    const puts: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        puts.push(url)
        return new Response(JSON.stringify({ content: b64('x'), sha: 'new' }), { status: 200, headers: { etag: 'new' } })
      }),
    )
    const r = await pushRemote({ articles: [], todos: [todo], manifestSha: undefined }, config)
    expect(r.conflictSlug).toBeNull()
    expect(puts.some((u) => u.includes('todos/t1.json'))).toBe(true)
    expect(r.manifest.todos?.['t1'].sha).toBe('new')
    expect(r.manifest.todos?.['t1'].updatedAt).toBe(100)
  })
})
