// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { Config } from '@/types'
import type { ImageStore } from '@/services/db'
import {
  createImageCloudLayer,
  createGitImageCloudLayer,
  createLocalImageCloudLayer,
  extractDataImages,
  extractImageKeys,
  isManagedImageKey,
} from '../index'

function makeBlob(content = 'x'): Blob {
  return new Blob([content], { type: 'image/png' })
}

function fakeImageStore(): ImageStore & { map: Map<string, Blob> } {
  const map = new Map<string, Blob>()
  return {
    map,
    put: vi.fn(async (k: string, b: Blob) => void map.set(k, b)),
    get: vi.fn(async (k: string) => map.get(k) ?? null),
    delete: vi.fn(async (k: string) => void map.delete(k)),
  }
}

const incomplete: Config = { enabled: false, repo: '', branch: 'main', path: '', token: '', poll: 20000, apiBase: 'https://api.github.com' }
const complete: Config = { ...incomplete, enabled: true, repo: 'u/r', token: 't' }

describe('图片抽取工具', () => {
  it('extractDataImages 只抓内嵌 data: 图，并给出扩展名', () => {
    const c = '前![](data:image/png;base64,AAA) 中![alt](data:image/jpeg;base64,BBB) 普通[链接](images/x.png)'
    const imgs = extractDataImages(c)
    expect(imgs).toHaveLength(2)
    expect(imgs[0].ext).toBe('png')
    expect(imgs[1].ext).toBe('jpg')
  })

  it('extractImageKeys 抓所有图片引用', () => {
    const c = '![](local-img:abc) 和 ![](images/hash.png) 和 ![](data:image/png;base64,AAA) 和 ![](https://e/x.png)'
    expect(extractImageKeys(c)).toEqual(['local-img:abc', 'images/hash.png', 'data:image/png;base64,AAA', 'https://e/x.png'])
  })

  it('isManagedImageKey 排除站内页面链接', () => {
    expect(isManagedImageKey('local-img:1')).toBe(true)
    expect(isManagedImageKey('images/1.png')).toBe(true)
    expect(isManagedImageKey('https://e/x.png')).toBe(true)
    expect(isManagedImageKey('./page')).toBe(false)
    expect(isManagedImageKey('[[双链]]')).toBe(false)
  })
})

describe('本地图云层（极简模式）', () => {
  it('put 写入 IDB 并返回 local-img:<sha> 幂等 key；get 可取回', async () => {
    const store = fakeImageStore()
    const cloud = createLocalImageCloudLayer(store)
    const b = makeBlob('hello')
    const k1 = await cloud.put(b)
    expect(k1.startsWith('local-img:')).toBe(true)
    // 相同内容 → 相同 key（幂等，避免重复粘贴堆孤儿）
    const k3 = await cloud.put(b)
    expect(k3).toBe(k1)
    expect(store.map.get(k1)).toBe(b)
  })

  it('resolve 把 key 解析为 object URL，缺失返回空串', async () => {
    const store = fakeImageStore()
    const cloud = createLocalImageCloudLayer(store)
    const k = await cloud.put(makeBlob('x'))
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:abc')
    expect(await cloud.resolve(k)).toBe('blob:abc')
    expect(await cloud.resolve('local-img:missing')).toBe('')
    create.mockRestore()
  })

  it('delete 移除 IDB 中的图', async () => {
    const store = fakeImageStore()
    const cloud = createLocalImageCloudLayer(store)
    const k = await cloud.put(makeBlob('x'))
    await cloud.delete(k)
    expect(store.map.has(k)).toBe(false)
  })
})

describe('git 图云层（同步模式）', () => {
  it('put 委托 pushImage 并返回其 key；delete 委托 deleteImage；resolve 组装 raw 直链', async () => {
    const pushImage = vi.fn(async () => 'images/abc.png')
    const deleteImage = vi.fn(async () => {})
    const cloud = createGitImageCloudLayer({ pushImage, deleteImage }, () => complete)

    const k = await cloud.put(makeBlob())
    expect(k).toBe('images/abc.png')
    expect(pushImage).toHaveBeenCalledTimes(1)

    await cloud.delete('images/abc.png')
    expect(deleteImage).toHaveBeenCalledWith('images/abc.png', complete)

    expect(await cloud.resolve('images/abc.png')).toBe('https://raw.githubusercontent.com/u/r/main/images/abc.png')
  })
})

describe('图云层工厂（按 config 路由）', () => {
  it('配置不完整 → 本地分支；完整 → git 分支', async () => {
    let cfg: Config = incomplete
    const store = fakeImageStore()
    const pushImage = vi.fn(async () => 'images/g.png')
    const cloud = createImageCloudLayer({ imageStore: store, gitContents: { pushImage, deleteImage: vi.fn() }, getConfig: () => cfg })

    const kLocal = await cloud.put(makeBlob('a'))
    expect(kLocal.startsWith('local-img:')).toBe(true)
    expect(pushImage).not.toHaveBeenCalled()

    cfg = complete
    const kGit = await cloud.put(makeBlob('b'))
    expect(kGit).toBe('images/g.png')
    expect(pushImage).toHaveBeenCalledTimes(1)
  })
})
