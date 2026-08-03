import type { Config } from '@/types'
import type { ImageStore } from '@/services/db'
import { isConfigComplete } from '@/services/github/diagnose'
import type { ImageCloudLayer } from './cloud'
import { createLocalImageCloudLayer } from './localCloud'
import { createGitImageCloudLayer, type GitImageContents } from './gitCloud'

export type { ImageCloudLayer, DataImageMatch } from './cloud'
export { createLocalImageCloudLayer, createGitImageCloudLayer }
export { extractDataImages, extractImageKeys, isManagedImageKey } from './cloud'

export interface ImageCloudDeps {
  /** 本地 IndexedDB images store（极简模式承载） */
  imageStore: ImageStore
  /** git 图片推送原语（注入以便单测替换） */
  gitContents: GitImageContents
  /** 取当前配置：决定是否走 git 分支（isConfigComplete） */
  getConfig: () => Config
}

/**
 * 图云层工厂：按「是否配置 GitHub」在本地 / git 两支之间路由（§6）。
 * 每次调用都按最新 config 实时判定，用户中途填好配置即从极简无缝切到同步模式。
 */
export function createImageCloudLayer(deps: ImageCloudDeps): ImageCloudLayer {
  const { imageStore, gitContents, getConfig } = deps
  const local = createLocalImageCloudLayer(imageStore)
  const git = createGitImageCloudLayer(gitContents, getConfig)
  const active = () => (isConfigComplete(getConfig()) ? git : local)
  return {
    put: (blob) => active().put(blob),
    delete: (key) => active().delete(key),
    resolve: (key) => active().resolve(key),
  }
}
