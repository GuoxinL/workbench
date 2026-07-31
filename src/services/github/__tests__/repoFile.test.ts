import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFile, putFile, ConflictError } from '../repoFile'
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

function b64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

describe('repoFile 单文件 I/O', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('getFile 解码 unicode base64', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ content: b64('hello 世界'), sha: 's1' }), { status: 200 })),
    )
    const f = await getFile('kb/a.md', config)
    expect(f).toEqual({ content: 'hello 世界', sha: 's1' })
  })

  it('getFile 404 → null（不抛错）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    expect(await getFile('kb/a.md', config)).toBeNull()
  })

  it('putFile 发送 base64 + sha + message', async () => {
    let sent: any
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: any) => {
        sent = JSON.parse(init.body)
        return new Response(JSON.stringify({ content: b64('x'), sha: 'new' }), { status: 200, headers: { etag: 'new' } })
      }),
    )
    const sha = await putFile('kb/a.md', '内容', 'old', config, 'msg')
    expect(sha).toBe('new')
    expect(sent.sha).toBe('old')
    expect(sent.content).toBe(b64('内容'))
    expect(sent.message).toBe('msg')
  })

  it('putFile 409 → ConflictError（S10）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'c' }), { status: 409 })))
    await expect(putFile('kb/a.md', 'x', 'old', config, 'm')).rejects.toBeInstanceOf(ConflictError)
  })
})
