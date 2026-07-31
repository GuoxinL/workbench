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

  it('isConfigComplete：owner/repo 缺斜杠或缺失令牌均判为不完整', () => {
    expect(isConfigComplete({ ...cfg, repo: 'GuoxinL/workbench-data' })).toBe(true)
    expect(isConfigComplete({ ...cfg, repo: 'workbench-data' })).toBe(false) // 缺 owner
    expect(isConfigComplete({ ...cfg, token: '' })).toBe(false)
    expect(isConfigComplete({ ...cfg, apiBase: '' })).toBe(false)
  })
})
