import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchArticles, fetchTodos, pushRemote, serializeArticle, serializeTodo } from '../contents'
import { fetchIndex } from '../listDir'
import type { Article, Config, Todo } from '@/types'

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

describe('contents（目录树索引 + 每文件 sha 推送）', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetchArticles 按 id 拉取并解析 frontmatter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('kb/1.md')) return new Response(JSON.stringify({ content: b64('---\ntitle: "A"\n---\n正文'), sha: 'as' }), { status: 200, headers: { etag: 'as' } })
        return new Response('', { status: 404 })
      }),
    )
    const articles = await fetchArticles(['1'], config)
    expect(articles).toHaveLength(1)
    expect(articles[0].title).toBe('A')
    expect(articles[0].content).toBe('正文')
  })

  it('fetchTodos 读取 todos/<id>.json 并经 Zod 校验组装', async () => {
    const todo: Todo = {
      id: 't1', title: '待办甲', desc: '', color: 'blue', status: 'todo',
      due: '', time: 5, articleId: '', createdAt: 1, updatedAt: 100, deleted: false,
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('todos/t1.json')) return new Response(JSON.stringify({ content: b64(JSON.stringify(todo)), sha: 'ts' }), { status: 200, headers: { etag: 'ts' } })
        return new Response('', { status: 404 })
      }),
    )
    const todos = await fetchTodos(['t1'], config)
    expect(todos).toHaveLength(1)
    expect(todos[0].title).toBe('待办甲')
  })

  it('fetchTodos 丢弃校验不过的远端待办，不影响整轮同步', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('todos/t1.json')) return new Response(JSON.stringify({ content: b64('{"id":"t1"}'), sha: 'ts' }), { status: 200, headers: { etag: 'ts' } })
        return new Response('', { status: 404 })
      }),
    )
    const todos = await fetchTodos(['t1'], config)
    expect(todos).toHaveLength(0)
  })

  it('fetchIndex 现拉 kb/ + todos/ 目录树索引（替代 manifest.json）', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url)
        if (url.includes('/contents/kb')) return new Response(JSON.stringify([{ name: 'a.md', path: 'kb/a.md', sha: 'sa', type: 'file' }]), { status: 200 })
        if (url.includes('/contents/todos')) return new Response(JSON.stringify([{ name: 't1.json', path: 'todos/t1.json', sha: 'st', type: 'file' }]), { status: 200 })
        return new Response('', { status: 404 })
      }),
    )
    const r = await fetchIndex(config)
    expect(r.articles).toEqual({ a: 'sa' })
    expect(r.todos).toEqual({ t1: 'st' })
    // 只列目录，不触碰任何正文文件
    expect(urls.some((u) => u.includes('kb/a.md'))).toBe(false)
  })

  it('pushRemote 逐文件 PUT + 返回 shaByPath，且不再写 manifest.json', async () => {
    const puts: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: any) => {
        if (init && init.method === 'PUT') puts.push(url)
        return new Response(JSON.stringify({ content: b64('x'), sha: 'new' }), { status: 200, headers: { etag: 'new' } })
      }),
    )
    const articles: Article[] = [
      { id: '1', title: 'A', content: '正文', fromTodo: '', tags: ['x'], createdAt: 1, updatedAt: 100, deleted: false },
    ]
    const r = await pushRemote({ articles, pushIds: ['1'], delIds: [], treeShaByPath: {} }, config)
    expect(r.conflictSlug).toBeNull()
    expect(puts.some((u) => u.includes('kb/1.md'))).toBe(true)
    expect(puts.some((u) => u.includes('manifest.json'))).toBe(false)
    expect(r.shaByPath['kb/1.md']).toBe('new')
  })

  it('pushRemote 更新已存在文件时携带远端 blob sha 作乐观锁（修复 GitHub 422）', async () => {
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
    const r = await pushRemote(
      { articles, pushIds: ['1'], delIds: [], treeShaByPath: { 'kb/1.md': 'REMOTE_SHA_A' } },
      config,
    )
    expect(r.conflictSlug).toBeNull()
    const filePut = bodies.find((b) => b.message === 'update A')
    expect(filePut).toBeTruthy()
    expect(filePut.sha).toBe('REMOTE_SHA_A')
  })

  it('pushRemote 只 PUT pushIds 命中的文件（差分推送，未命中不写）', async () => {
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
    await pushRemote(
      { articles, pushIds: ['ahead'], delIds: [], treeShaByPath: { 'kb/ahead.md': 'a', 'kb/same.md': 's' } },
      config,
    )
    expect(puts.filter((u) => u.includes('kb/'))).toEqual([expect.stringContaining('kb/ahead.md')])
  })

  it('pushRemote 删除远端墓碑（delIds + treeSha 锁），不写该文件正文', async () => {
    const methods: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: any) => {
        if (init?.method) methods.push(init.method)
        return new Response('ok', { status: 200 })
      }),
    )
    const r = await pushRemote({ articles: [], pushIds: [], delIds: ['old'], treeShaByPath: { 'kb/old.md': 'OLD_SHA' } }, config)
    expect(methods).toContain('DELETE')
    expect(methods).not.toContain('PUT')
    expect(r.deletedPaths).toEqual(['kb/old.md'])
  })

  it('pushRemote 写 todos/<id>.json 并填 shaByPath', async () => {
    const puts: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        puts.push(url)
        return new Response(JSON.stringify({ content: b64('x'), sha: 'new' }), { status: 200, headers: { etag: 'new' } })
      }),
    )
    const todo: Todo = {
      id: 't1', title: '待办甲', desc: '', color: 'blue', status: 'todo',
      due: '', time: 5, articleId: '', createdAt: 1, updatedAt: 100, deleted: false,
    }
    const r = await pushRemote({ articles: [], pushIds: [], todos: [todo], todoPushIds: ['t1'], delIds: [], treeShaByPath: {} }, config)
    expect(r.conflictSlug).toBeNull()
    expect(puts.some((u) => u.includes('todos/t1.json'))).toBe(true)
    expect(r.shaByPath['todos/t1.json']).toBe('new')
  })

  it('pushRemote 遇 409 → 返回 conflictSlug（冲突重试由引擎处理）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: any) => {
        if (init && init.method === 'PUT') return new Response(JSON.stringify({ message: 'Conflict' }), { status: 409 })
        return new Response(JSON.stringify({ content: b64('x'), sha: 'new' }), { status: 200 })
      }),
    )
    const articles: Article[] = [
      { id: '1', title: 'A', content: '', fromTodo: '', tags: [], createdAt: 1, updatedAt: 1, deleted: false },
    ]
    const r = await pushRemote(
      { articles, pushIds: ['1'], delIds: [], treeShaByPath: { 'kb/1.md': 'STALE' } },
      config,
    )
    expect(r.conflictSlug).toBe('kb/1.md')
  })

  it('pushRemote 遇非 409 的 sha 冲突文案（如 "is at X but expected Y"）→ 仍返回 conflictSlug 自愈', async () => {
    // 线上实测：GitHub/代理对版本冲突可能返回非 409 状态 + "is at … but expected …" 文案，
    // 旧逻辑会裸抛 GithubError 导致「同步失败」且无法重试。硬化后应视为可重试冲突。
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: any) => {
        if (init && init.method === 'PUT')
          return new Response(
            JSON.stringify({ message: 'is at abc123 but expected def456' }),
            { status: 423 },
          )
        return new Response(JSON.stringify({ content: b64('x'), sha: 'new' }), { status: 200 })
      }),
    )
    const articles: Article[] = [
      { id: '1', title: 'A', content: '', fromTodo: '', tags: [], createdAt: 1, updatedAt: 1, deleted: false },
    ]
    const r = await pushRemote(
      { articles, pushIds: ['1'], delIds: [], treeShaByPath: { 'kb/1.md': 'STALE' } },
      config,
    )
    expect(r.conflictSlug).toBe('kb/1.md')
  })

  it('serializeArticle/Todo 与 git blob sha 一致性（本地判定基石）', async () => {
    const a: Article = { id: '1', title: 'A', content: 'c', fromTodo: '', tags: [], createdAt: 1, updatedAt: 1, deleted: false }
    const t: Todo = { id: 't1', title: 'T', desc: '', color: 'blue', status: 'todo', due: '', time: 1, articleId: '', createdAt: 1, updatedAt: 1, deleted: false }
    // 两次序列化结果一致 ⇒ 本地重算 sha 与远端基线 sha 可稳定比较
    expect(serializeArticle(a)).toBe(serializeArticle(a))
    expect(serializeTodo(t)).toBe(serializeTodo(t))
  })
})
