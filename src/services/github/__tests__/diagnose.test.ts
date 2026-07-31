import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runDiagnose, testConnection, isConfigComplete } from '@/services/github/diagnose'
import type { Config } from '@/types'

const cfg: Config = {
  enabled: true,
  repo: 'o/r',
  branch: 'main',
  path: '',
  token: 't',
  poll: 20,
  apiBase: 'https://api.github.com',
}

function mockFetch(handler: (url: string) => Response) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => handler(url)))
}

beforeEach(() => vi.unstubAllGlobals())

describe('diagnose（S17/S18）', () => {
  it('全绿：连接成功 + push 权限 + manifest 尚未创建', async () => {
    mockFetch((url) => {
      if (url.includes('manifest.json')) return new Response('', { status: 404 })
      if (url.startsWith('https://api.github.com/repos/o/r')) {
        return new Response(JSON.stringify({ permissions: { push: true } }), { status: 200 })
      }
      return new Response('', { status: 404 })
    })
    const steps = await runDiagnose(cfg)
    expect(steps).toHaveLength(5)
    expect(steps.every((s) => s.ok)).toBe(true)
  })

  it('令牌失效：中断于「令牌有效性」步骤', async () => {
    mockFetch(() => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 }))
    const steps = await runDiagnose(cfg)
    expect(steps[0].ok).toBe(true) // 配置检查通过
    expect(steps.find((s) => s.name === '令牌有效性')?.ok).toBe(false)
  })

  it('测试连接：配置不完整时返回 config 错误且不发起任何网络请求', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const incomplete: Config = { enabled: true, repo: '', branch: 'main', path: '', token: '', poll: 20, apiBase: 'https://api.github.com' }
    const r = await testConnection(incomplete)
    expect(r.ok).toBe(false)
    expect(r.code).toBe('config')
    expect(fetchMock).not.toHaveBeenCalled() // 不应发 GET /repos/ 导致 404
  })

  it('isConfigComplete：owner/repo 缺斜杠或缺失令牌均判为不完整；apiBase 可选', () => {
    expect(isConfigComplete({ ...cfg, repo: 'GuoxinL/workbench-data' })).toBe(true)
    expect(isConfigComplete({ ...cfg, repo: 'workbench-data' })).toBe(false) // 缺 owner
    expect(isConfigComplete({ ...cfg, token: '' })).toBe(false)
    expect(isConfigComplete({ ...cfg, apiBase: '' })).toBe(true) // apiBase 可选，缺省默认官方 API
  })

  it('测试连接：apiBase 为空时以官方 API 为默认，仍发起连通校验而非报配置不完整', async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      new Response(JSON.stringify({ permissions: { push: true } }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const r = await testConnection({ ...cfg, apiBase: '' })
    expect(fetchMock).toHaveBeenCalled()
    expect(fetchMock.mock.calls[0][0]).toContain('https://api.github.com/repos/o/r')
    expect(r.ok).toBe(true)
  })

  it('测试连接：诊断请求 URL 不带尾斜杠（匹配代理白名单，避免 403→网络错误）', async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      new Response(JSON.stringify({ permissions: { push: true } }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await testConnection({ ...cfg, apiBase: 'https://wb-proxy.workers.dev' })
    const called = fetchMock.mock.calls[0][0] as string
    expect(called).toBe('https://wb-proxy.workers.dev/repos/o/r')
    expect(called.endsWith('/')).toBe(false)
  })

  it('网络错误：未配置代理时提示填中转地址', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const r = await testConnection({ ...cfg, apiBase: '' })
    expect(r.ok).toBe(false)
    expect(r.code).toBe('network')
    expect(r.message).toContain('中转地址')
  })

  it('网络错误：已配置代理时提示检查代理地址/白名单', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const r = await testConnection({ ...cfg, apiBase: 'https://wb-proxy.workers.dev' })
    expect(r.code).toBe('network')
    expect(r.message).toContain('代理')
  })

  it('网络错误：超时（AbortError）给出超时提示', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const e = new Error('aborted')
        e.name = 'AbortError'
        throw e
      }),
    )
    const r = await testConnection(cfg)
    expect(r.code).toBe('network')
    expect(r.message).toContain('超时')
  })
})
