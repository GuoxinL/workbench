import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import worker from '../cloudflare-worker.js'

/** 构造一个带 Origin 的请求（模拟浏览器跨域调用 Worker）。 */
function makeReq(url: string, init: RequestInit = {}, origin = 'http://127.0.0.1:8000') {
  const headers = new Headers(init.headers)
  headers.set('Origin', origin)
  return new Request(url, { ...init, headers })
}

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => vi.unstubAllGlobals())

describe('Cloudflare Worker 代理（S13 来源/CORS 修复）', () => {
  it('本地来源调用：透传到 api.github.com 且正确回显 CORS Origin', async () => {
    const upstream = vi.fn(async (target: string) =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ETag: 'abc' },
      }),
    )
    vi.stubGlobal('fetch', upstream)

    const res = await worker.fetch(makeReq('https://wb-proxy.workers.dev/repos/o/r'))
    expect(res.status).toBe(200)
    // 关键：本地开发来源必须被放行，否则浏览器 CORS 吞错 → 表现为「网络错误」
    expect(res.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:8000')
    // 透传路径正确
    expect(upstream.mock.calls[0][0]).toBe('https://api.github.com/repos/o/r')
    expect(await res.json()).toEqual({ ok: true })
  })

  it('任意 GitHub Pages 来源同样被放行', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    const res = await worker.fetch(
      makeReq('https://wb-proxy.workers.dev/repos/o/r', {}, 'https://someuser.github.io'),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://someuser.github.io')
  })

  it('OPTIONS 预检返回 204 且带 CORS 头', async () => {
    const res = await worker.fetch(
      makeReq('https://wb-proxy.workers.dev/repos/o/r', { method: 'OPTIONS' }),
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:8000')
    expect(res.headers.get('access-control-allow-methods')).toContain('PUT')
  })

  it('白名单之外的接口（如 /user）返回 403', async () => {
    const res = await worker.fetch(makeReq('https://wb-proxy.workers.dev/user'))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.message).toContain('白名单')
  })

  it('上游不可达（fetch 抛错）返回 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connect ECONNREFUSED') }))
    const res = await worker.fetch(makeReq('https://wb-proxy.workers.dev/repos/o/r'))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.message).toContain('中转')
  })

  it('contents 路径（同步读写）透传并放行', async () => {
    const upstream = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', upstream)
    const res = await worker.fetch(
      makeReq('https://wb-proxy.workers.dev/repos/o/r/contents/kb/foo.md?ref=main', { method: 'PUT' }),
    )
    expect(res.status).toBe(200)
    expect(upstream.mock.calls[0][0]).toBe('https://api.github.com/repos/o/r/contents/kb/foo.md?ref=main')
  })
})
