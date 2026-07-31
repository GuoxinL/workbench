import { afterEach, describe, expect, it, vi } from 'vitest'
import { githubRequest, GithubError } from '../client'
import type { Config } from '@/types'

const config: Config = {
  enabled: true,
  repo: 'u/r',
  branch: 'main',
  path: 'data',
  token: 't',
  poll: 20000,
  apiBase: 'https://api.example.com',
}

describe('githubRequest', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('成功：优先取响应体 data.sha 作为乐观锁 sha（etag 带引号不可用），且带鉴权头', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: any) => {
        expect(url).toContain('/repos/u/r/contents/x?ref=main')
        expect(init.headers.Authorization).toBe('Bearer t')
        return new Response(JSON.stringify({ ok: 1, sha: 'deadbeef' }), {
          status: 200,
          headers: { etag: '"wrapped-etag"' },
        })
      }),
    )
    const r = await githubRequest('x', {}, config)
    expect(r.status).toBe(200)
    expect(r.data).toEqual({ ok: 1, sha: 'deadbeef' })
    expect(r.sha).toBe('deadbeef')
  })

  it('成功且无 data.sha 时回退到 x-github-sha 头', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200, headers: { 'x-github-sha': 'fallback' } })),
    )
    const r = await githubRequest('x', {}, config)
    expect(r.sha).toBe('fallback')
  })

  it('401 → token 错误（S13）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Bad' }), { status: 401 })))
    await expect(githubRequest('x', {}, config)).rejects.toMatchObject({ code: 'token', status: 401 })
  })

  it('404 → notfound（S13）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    await expect(githubRequest('x', {}, config)).rejects.toMatchObject({ code: 'notfound' })
  })

  it('网络 TypeError → net=true（S14）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('failed')
    }))
    const e = await githubRequest('x', {}, config).catch((err) => err)
    expect(e).toBeInstanceOf(GithubError)
    expect((e as GithubError).net).toBe(true)
    expect((e as GithubError).code).toBe('network')
  })

  it('AbortError（超时）→ network（S12）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('aborted', 'AbortError')
      }),
    )
    const e = await githubRequest('x', {}, config).catch((err) => err)
    expect((e as GithubError).net).toBe(true)
  })
})
