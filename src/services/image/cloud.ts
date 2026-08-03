/**
 * ImageCloudLayer（设计文档 §6）——存储层与具体图床之间的**唯一隔离面**。
 * 只暴露三个原语，不向上暴露到 StorageLayer 实体接口之上：
 *
 *  - `put(blob)`   上传一张图，返回可引用 key（git 模式为 `images/<sha>`，极简模式为 `local-img:<sha>`）
 *  - `delete(key)` 回收一张图（删除实体 / 正文去掉引用时调用）
 *  - `resolve(key)` 把 key 解析为可直接塞进 `<img src>` 的 URL（本地为 object URL，git 为 raw 链接）
 *
 * 图片存储按是否配置 GitHub 分两支（§6）：
 *  - 极简模式（未填 GitHub）：`put` 降级写入本地 IndexedDB `images` store。
 *  - 同步模式（已填 GitHub）：`put` 走 git `images/<sha>.<ext>`，返回 `images/<sha>` 引用。
 * 外部对象存储图云为后续实现，仅替换 `put`/`resolve` 内部，其余层不变。
 */

export interface ImageCloudLayer {
  /** 上传一张图，返回可引用 key（git 模式为 images/HASH，极简模式为 local-img:ID） */
  put(blob: Blob): Promise<string>
  /** 回收一张图（删除实体 / 正文去掉引用时调用） */
  delete(key: string): Promise<void>
  /** 把 key 解析为可直接用于 `<img src>` 的 URL（本地为 object URL，git 为 raw 链接） */
  resolve(key: string): Promise<string>
}

/** 正文里内嵌的 data: 图片（通常是粘贴/拖拽进编辑器的临时 base64）。 */
export interface DataImageMatch {
  /** 完整匹配串，如 `![](data:image/png;base64,xxxx)` */
  full: string
  /** data URL 本身 */
  url: string
  /** 文件扩展名（jpeg → jpg） */
  ext: string
}

// 只匹配真正的 data: 图片内嵌（含 mime 与 base64），排除普通链接
const DATA_IMAGE_RE = /!\[[^\]]*\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[^)\s]+)\)/g
// 所有 `![](<ref>)` 图片引用（含 local-img: / images/ / data: / http(s)://）
const IMAGE_REF_RE = /!\[[^\]]*\]\(([^)\s]+)\)/g

/** 抽取正文里内嵌的 `data:` 图片（通常是粘贴进正文、尚未上传的临时 base64）。 */
export function extractDataImages(content: string): DataImageMatch[] {
  const out: DataImageMatch[] = []
  for (const m of content.matchAll(DATA_IMAGE_RE)) {
    const url = m[1]
    const raw = url.match(/data:image\/([a-zA-Z0-9.+-]+)/)?.[1] ?? 'png'
    out.push({ full: m[0], url, ext: raw.toLowerCase() === 'jpeg' ? 'jpg' : raw.toLowerCase() })
  }
  return out
}

/** 抽取正文里所有图片引用（local-img: / images/ / data: / http(s):// 等）。 */
export function extractImageKeys(content: string): string[] {
  const out: string[] = []
  for (const m of content.matchAll(IMAGE_REF_RE)) out.push(m[1])
  return out
}

/** 判断一个引用串是否为「本层管理的图片 key」（排除纯文本或站内页面链接，避免误删）。 */
export function isManagedImageKey(url: string): boolean {
  return /^(local-img:|images\/|data:image\/|https?:\/\/)/.test(url)
}
