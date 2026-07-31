import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRemote, pushRemote } from '../contents'
import type { Article, Config, Manifest } from '@/types'

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

describe('contents', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetchRemote 组装文章（manifest + frontmatter 解析）', async () => {
    const m: Manifest = {
      version: 1,
      updatedAt: 1,
      articles: { '1': { id: '1', title: 'A', updatedAt: 100, deleted: false, sha: 's' } },
      todosSha: '',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('manifest.json')) return new Response(JSON.stringify({ content: b64(JSON.stringify(m)), sha: 'ms' }), { status: 200, headers: { etag: 'ms' } })
        if (url.includes('kb/1.md')) return new Response(JSON.stringify({ content: b64('---\ntitle: "A"\n---\n正文'), sha: 'as' }), { status: 200, headers: { etag: 'as' } })
        return new Response('', { status: 404 })
      }),
    )
    const snap = await fetchRemote(config)
    expect(snap?.articles).toHaveLength(1)
    expect(snap?.articles[0].title).toBe('A')
    expect(snap?.articles[0].content).toBe('正文')
    expect(snap?.manifestSha).toBe('ms')
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
    const r = await pushRemote({ articles, manifestSha: undefined, remoteShas: { '1': 'REMOTE_SHA_A' } }, config)
    expect(r.conflictSlug).toBeNull()
    const filePut = bodies.find((b) => b.message === 'update A')
    expect(filePut).toBeTruthy()
    expect(filePut.sha).toBe('REMOTE_SHA_A')
  })
})
