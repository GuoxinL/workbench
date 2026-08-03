/**
 * paste-image 上传分支测试（P2 ⑥ 接入编辑器）。
 * canvas 在 jsdom 不可用，故 mock `@/lib/image` 的 compressImageBlob，聚焦
 * 「上传拿 key / 无上传 → data URI 回退 / 上传失败 → data URI 回退」三条分支。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// 构造 1x1 伪图片 Blob 供 blobToDataUri 走真实 FileReader 路径
function fakeBlob(type = 'image/png') {
  return new Blob(['\x89PNG\r\n\x1a\n'], { type })
}
function fakeFile() {
  return new File([fakeBlob()], 'pic.png', { type: 'image/png' })
}

vi.mock('@/lib/image', async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>
  return {
    ...real,
    // 跳过真实 canvas 压缩，直接返回原 Blob
    compressImageBlob: vi.fn(async (b: Blob) => b),
  }
})

import { toSrc } from '../paste-image'
import { blobToDataUri } from '@/lib/image'

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('toSrc（粘贴图片上传分支）', () => {
  it('有上传函数 → 返回 key，且上传收到压缩后的 Blob', async () => {
    const upload = vi.fn<(blob: Blob) => Promise<string>>(async () => 'images/ab12.jpg')
    const src = await toSrc(fakeFile(), upload)
    expect(src).toBe('images/ab12.jpg')
    expect(upload).toHaveBeenCalledTimes(1)
    // 上传入参应为 Blob（压缩产物）
    expect(upload.mock.calls[0][0]).toBeInstanceOf(Blob)
  })

  it('无上传函数 → 回退内嵌 data URI', async () => {
    const src = await toSrc(fakeFile(), undefined)
    expect(src.startsWith('data:image/')).toBe(true)
    expect(src).toBe(await blobToDataUri(fakeBlob()))
  })

  it('上传抛错 → 回退内嵌 data URI（编辑器不破图）', async () => {
    const upload = vi.fn<(blob: Blob) => Promise<string>>(async () => {
      throw new Error('上传失败')
    })
    const src = await toSrc(fakeFile(), upload)
    expect(src.startsWith('data:image/')).toBe(true)
  })
})
