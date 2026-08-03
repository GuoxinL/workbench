import type { ImageStore } from '@/services/db'
import type { ImageCloudLayer } from './cloud'
import { sha256Hex } from './hash'

/**
 * 极简模式（未填 GitHub）图云层：把图片写入本地 IndexedDB `images` store（需求驱动的默认主存储，§7.1）。
 * key 由 blob 内容 hash 决定（幂等），文章以 `local-img:<sha>` 引用；resolve 时读回 blob 生成 object URL。
 */
export function createLocalImageCloudLayer(store: ImageStore): ImageCloudLayer {
  return {
    async put(blob: Blob) {
      const buf = await blob.arrayBuffer()
      const key = `local-img:${await sha256Hex(buf)}`
      await store.put(key, blob)
      return key
    },
    async delete(key: string) {
      await store.delete(key)
    },
    async resolve(key: string) {
      const blob = await store.get(key)
      if (!blob) return ''
      return URL.createObjectURL(blob)
    },
  }
}
