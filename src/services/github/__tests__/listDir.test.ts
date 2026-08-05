import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchIndex, listDir } from '../listDir'
import type { Config } from '@/types'

const config: Config = {
  enabled: true,
  repo: 'u/r',
  branch: 'main',
  path: '',
  token: 't',
  poll: 20000,
  apiBase: 'https://x',
}

describe('listDir / fetchIndex', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('listDir 把目录数组投影为 {path,sha}，忽略子目录（images/）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/contents/kb')) {
          return new Response(
            JSON.stringify([
              { name: 'a.md', path: 'kb/a.md', sha: 'sha-a', type: 'file' },
              { name: 'b.md', path: 'kb/b.md', sha: 'sha-b', type: 'file' },
              { name: 'images', path: 'kb/images', sha: 'ignored', type: 'dir' },
            ]),
            { status: 200 },
          )
        }
        return new Response('', { status: 404 })
      }),
    )
    const entries = await listDir('kb', config)
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.name).sort()).toEqual(['a.md', 'b.md'])
    expect(entries.every((e) => e.type === 'file')).toBe(true)
  })

  it('listDir 目录不存在（404）→ 空数组（首次同步）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    expect(await listDir('kb', config)).toEqual([])
  })

  it('fetchIndex 现拉 kb/ + todos/，按 id→sha 投影，不含正文', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url)
        if (url.includes('/contents/kb')) {
          return new Response(
            JSON.stringify([
              { name: 'a.md', path: 'kb/a.md', sha: 'sha-a', type: 'file' },
              { name: 'c.md', path: 'kb/c.md', sha: 'sha-c', type: 'file' },
            ]),
            { status: 200 },
          )
        }
        if (url.includes('/contents/todos')) {
          return new Response(
            JSON.stringify([{ name: 't1.json', path: 'todos/t1.json', sha: 'sha-t1', type: 'file' }]),
            { status: 200 },
          )
        }
        return new Response('', { status: 404 })
      }),
    )
    const idx = await fetchIndex(config)
    expect(idx.articles).toEqual({ a: 'sha-a', c: 'sha-c' })
    expect(idx.todos).toEqual({ t1: 'sha-t1' })
    // 只列目录（内容为数组），不触碰任何正文文件
    expect(urls.every((u) => !u.includes('.md"') && !u.includes('.json"'))).toBe(true)
    expect(urls.filter((u) => u.includes('contents/kb') || u.includes('contents/todos')).length).toBe(2)
  })
})
