// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '@/types'
import { pushImage, deleteImage } from '../contents'
import { putFileBase64, getFile, deleteFile } from '../repoFile'

vi.mock('../repoFile', () => ({
  ConflictError: class ConflictError extends Error {},
  deleteFile: vi.fn(),
  getFile: vi.fn(),
  putFile: vi.fn(),
  putFileBase64: vi.fn(async () => 'returned-sha'),
}))

const config: Config = { enabled: true, repo: 'u/r', branch: 'main', path: '', token: 't', poll: 20000, apiBase: 'https://api.github.com' }

describe('git 图片推送（P2 ⑥ 同步模式）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(getFile as any).mockResolvedValue({ sha: 's' })
  })

  it('pushImage 以内容 hash 作为 key，并以 base64 直传（不二次编码）', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })
    const key = await pushImage(blob, config)

    expect(key).toMatch(/^images\/[a-f0-9]{64}\.png$/)
    const call = (putFileBase64 as any).mock.calls[0]
    // 路径 = images/<hash>.png；二进制经 base64 直传，未对 base64 再编码
    expect(call[0]).toBe(`images/${key.split('/')[1]}`)
    expect(call[3]).toBe(config)
  })

  it('pushImage 按 mime 推导扩展名（jpeg → jpg）', async () => {
    const blob = new Blob([new Uint8Array([9])], { type: 'image/jpeg' })
    const key = await pushImage(blob, config)
    expect(key).toMatch(/\.jpg$/)
  })

  it('deleteImage 仅对 images/ 前缀生效：先取 sha 再删；文件不存在则静默', async () => {
    await deleteImage('images/x.png', config)
    expect(getFile).toHaveBeenCalledWith('images/x.png', config)
    expect(deleteFile).toHaveBeenCalledWith('images/x.png', 's', config, expect.any(String))

    ;(getFile as any).mockResolvedValue(null)
    ;(deleteFile as any).mockClear()
    await deleteImage('images/y.png', config)
    expect(deleteFile).not.toHaveBeenCalled()

    // 非图片 key 直接忽略，不发起任何请求
    ;(getFile as any).mockClear()
    await deleteImage('kb/1.md', config)
    expect(getFile).not.toHaveBeenCalled()
  })
})
