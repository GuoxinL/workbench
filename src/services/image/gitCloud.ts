import type { Config } from '@/types'
import type { ImageCloudLayer } from './cloud'

/** git 图云层依赖的远端原语（由 github/contents 注入，便于单测时替换为替身）。 */
export interface GitImageContents {
  /** 把图片推到 git `images/<sha>.<ext>`，返回引用 key `images/<sha>.<ext>` */
  pushImage(blob: Blob, config: Config): Promise<string>
  /** 从 git 删除一张图（文件不存在时静默） */
  deleteImage(key: string, config: Config): Promise<void>
}

/**
 * 同步模式（已填 GitHub）图云层：默认走 git `images/<sha>.<ext>`（§6），零额外依赖。
 * resolve 组装 raw.githubusercontent 直链，文章正文以 `![](images/<sha>)` 引用。
 * 外部对象存储图云为后续实现，届时仅替换本文件内部，其余层不变。
 */
export function createGitImageCloudLayer(contents: GitImageContents, getConfig: () => Config): ImageCloudLayer {
  return {
    async put(blob: Blob) {
      return contents.pushImage(blob, getConfig())
    },
    async delete(key: string) {
      await contents.deleteImage(key, getConfig())
    },
    async resolve(key: string) {
      const c = getConfig()
      const ref = c.branch || 'main'
      return `https://raw.githubusercontent.com/${c.repo}/${ref}/${key}`
    },
  }
}
