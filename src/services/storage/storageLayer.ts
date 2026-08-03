import type { Article, Todo } from '@/types'
import type { DataLayer } from '@/services/db'
import type { ImageCloudLayer } from '@/services/image'
import { extractDataImages, extractImageKeys, isManagedImageKey } from '@/services/image'

/**
 * StorageLayer（设计文档 §3.1 / P1 ③）——视图与底层存储之间的唯一可写入口。
 *
 * 把「本地 IndexedDB（立即落盘）」与「远端 GitHub（后台异步同步）」收敛成统一接口，
 * Todo 与 Article 共用同一条双写路径；调用方（store）不直接碰 `wb.*` 或 GitHub API（红线 4）。
 *
 * 双写语义（local-first）：任一 Save / Delete 方法 =
 *   ① 立即写本地 DataLayer（毫秒级、离线可用） + ② 触发同步引擎 push（防抖、异步、可失败降级）
 * 即「所有数据先写本地，再由同步引擎异步推远端」。store 的 mutator 仍保持同步返回实体，
 * 只是把写穿透 + 触发同步收口到这里，以 `void storage.SaveTodo(...)` 之类的调用触发。
 *
 * 图片协调（P2 ⑥ §6）：Save* 内部对正文做图云层协调——
 *   1) 把内嵌 `data:` 临时图上传替换为引用 key（幂等，避免 base64 落库膨胀）；
 *   2) 对比正文新旧图片引用，删掉被丢弃的 key（孤儿回收）。
 * Delete* 仅置墓碑（软删 + 后续 GC，符合 §6 git 软删约定），不直接删图，避免误删被多实体共享的图。
 */
export interface StorageLayer {
  /** 新增 / 更新 / 软删待办：本地落盘 + 触发远端同步 */
  SaveTodo(t: Todo): Promise<void>
  /** 新增 / 更新 / 软删文章：本地落盘 + 触发远端同步 */
  SaveArticle(a: Article): Promise<void>
  /** 按页列出待办（走本地 DataLayer 索引，避免全量遍历） */
  ListTodo(page: number, size: number): Promise<{ items: Todo[]; total: number }>
  /** 按页列出文章（走本地 DataLayer 索引） */
  ListArticle(page: number, size: number): Promise<{ items: Article[]; total: number }>
  /** 软删待办（墓碑，待同步传播）：本地置 tombstone + 触发远端同步 */
  DeleteTodo(id: string): Promise<void>
  /** 软删文章（墓碑，待同步传播）：本地置 tombstone + 触发远端同步 */
  DeleteArticle(id: string): Promise<void>
}

export function createStorageLayer(
  dataLayer: DataLayer,
  schedulePush: () => void,
  cloud: ImageCloudLayer,
): StorageLayer {
  /** 触发远端同步；未配置 GitHub 时引擎自行置 off，零网络（§7.3 不变量） */
  const push = () => {
    try {
      schedulePush()
    } catch {
      /* 同步引擎异常不应阻断本地写入 */
    }
  }

  /**
   * 图片协调：上传内嵌 data: 图 → 替换为 key；删除被丢弃的图片引用。
   * 失败一律静默降级（保留原串或跳过回收），绝不阻断实体保存。
   */
  async function reconcileImages(newContent: string, oldContent: string): Promise<string> {
    let content = newContent
    for (const di of extractDataImages(content)) {
      try {
        const blob = dataUrlToBlob(di.url)
        const key = await cloud.put(blob)
        content = content.split(di.full).join(`![](${key})`)
      } catch {
        /* 上传失败：保留原 data: 串，至少内容不丢 */
      }
    }
    const oldKeys = extractImageKeys(oldContent).filter(isManagedImageKey)
    const newKeys = extractImageKeys(content).filter(isManagedImageKey)
    const removed = oldKeys.filter((k) => !newKeys.includes(k))
    for (const k of removed) {
      try {
        await cloud.delete(k)
      } catch {
        /* 回收失败静默 */
      }
    }
    return content
  }

  return {
    async SaveTodo(t) {
      let desc = t.desc
      try {
        const old = await dataLayer.getTodo(t.id)
        desc = await reconcileImages(t.desc, old?.desc ?? '')
      } catch {
        /* 协调失败不阻断保存 */
      }
      // 不 await：store 的 mutator 需同步返回实体；写穿透失败静默降级（本地 wb.data.v1 仍已落盘）
      void dataLayer.saveTodo({ ...t, desc }).catch(() => {})
      push()
    },
    async SaveArticle(a) {
      let content = a.content
      try {
        const old = await dataLayer.getArticle(a.id)
        content = await reconcileImages(a.content, old?.content ?? '')
      } catch {
        /* 协调失败不阻断保存 */
      }
      void dataLayer.saveArticle({ ...a, content }).catch(() => {})
      push()
    },
    async DeleteTodo(id) {
      try {
        const t = await dataLayer.getTodo(id)
        if (t) await dataLayer.saveTodo({ ...t, deleted: true, updatedAt: Date.now() })
      } catch {
        /* 本地不可用时静默降级（与 DataLayer 写穿透一致） */
      }
      push()
    },
    async DeleteArticle(id) {
      try {
        const a = await dataLayer.getArticle(id)
        if (a) await dataLayer.saveArticle({ ...a, deleted: true, updatedAt: Date.now() })
      } catch {
        /* 本地不可用时静默降级 */
      }
      push()
    },
    ListTodo(page, size) {
      return dataLayer.listTodo(page, size)
    },
    ListArticle(page, size) {
      return dataLayer.listArticle(page, size)
    },
  }
}

/** 把 `data:image/<mime>;base64,<bytes>` 还原为 Blob（粘贴图片落库用）。 */
function dataUrlToBlob(url: string): Blob {
  const m = url.match(/^data:([^;]+);base64,(.*)$/s)
  if (!m) throw new Error('非法的 data URL')
  const mime = m[1]
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
