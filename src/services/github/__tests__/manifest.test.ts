import { afterEach, describe, expect, it, vi } from 'vitest'
import { diffManifests, emptyManifest, indexFromArticles, getManifest } from '../manifest'
import type { Article, Config, Manifest } from '@/types'

function b64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

const notes: Article[] = [
  { id: '1', title: 'A', content: '', fromTodo: '', tags: [], createdAt: 1, updatedAt: 100, deleted: false },
  { id: '2', title: 'B', content: '', fromTodo: '', tags: [], createdAt: 2, updatedAt: 200, deleted: false },
]

describe('manifest 纯函数', () => {
  it('indexFromArticles 按 slug 建索引', () => {
    const idx = indexFromArticles(notes)
    expect(Object.keys(idx).sort()).toEqual(['a', 'b'])
    expect(idx.a.updatedAt).toBe(100)
  })

  it('diffManifests 识别 pull / push（per-file LWW 调度）', () => {
    const local = emptyManifest()
    const remote = emptyManifest()
    local.articles = {
      a: { id: '1', title: 'A', updatedAt: 100, deleted: false, sha: '' },
      c: { id: '3', title: 'C', updatedAt: 300, deleted: false, sha: '' }, // 本地更新 → push
    }
    remote.articles = {
      a: { id: '1', title: 'A', updatedAt: 150, deleted: false, sha: '' }, // 远端更新 → pull
      b: { id: '2', title: 'B', updatedAt: 200, deleted: false, sha: '' }, // 本地缺失 → pull
    }
    const d = diffManifests(local, remote)
    expect(d.pull.sort()).toEqual(['a', 'b'])
    expect(d.push).toEqual(['c'])
  })
})

describe('getManifest', () => {
  afterEach(() => vi.unstubAllGlobals())
  const cfg: Config = { enabled: true, repo: 'u/r', branch: 'main', path: '', token: 't', poll: 20000, apiBase: 'https://x' }

  it('读取并解析 manifest.json', async () => {
    const m: Manifest = {
      version: 1,
      updatedAt: 1,
      articles: { a: { id: '1', title: 'A', updatedAt: 1, deleted: false, sha: 's' } },
      todosSha: '',
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ content: b64(JSON.stringify(m)), sha: 'ms' }), { status: 200, headers: { etag: 'ms' } })))
    const r = await getManifest(cfg)
    expect(r?.sha).toBe('ms')
    expect(r?.manifest.articles.a.id).toBe('1')
  })

  it('不存在 → null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    expect(await getManifest(cfg)).toBeNull()
  })
})
