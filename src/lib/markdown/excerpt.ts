/**
 * 从正文提取纯文本摘要（去除常见 markdown 语法标记），最多 maxLen 字符。
 * 不依赖 marked 渲染器，轻量正则截取，适合卡片预览。
 */
export function extractExcerpt(md: string, maxLen = 120): string {
  const text = md
    .replace(/!\[.*?\]\(.*?\)/g, '')       // 图片
    .replace(/\[([^\]]*)\]\(.*?\)/g, '$1') // 链接保留文字
    .replace(/^#{1,6}\s+/gm, '')           // 标题 #
    .replace(/[*_~`>|#\[\]]/g, '')         // 格式符
    .replace(/\n{2,}/g, ' ')               // 多换行 → 空格
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text || '（空文章）'
}

/** 从正文提取第一张图片 URL（支持远程、本地路径、data URI）。 */
export function extractFirstImage(md: string): string | null {
  const m = md.match(/!\[.*?\]\((.*?)\)/)
  if (!m) return null
  const url = m[1].trim()
  return url || null
}

/** 对图片 URL 做清理：本地相对路径加前缀，非法协议过滤为空。 */
export function safeImageUrl(url: string | null): string | null {
  if (!url) return null
  // 本地缓存图片路径，加上当前部署域前缀（GitHub Pages 同域）
  if (url.startsWith('/')) return url
  // data URI 直接返回
  if (url.startsWith('data:')) return url
  // 远程 URL 直接返回
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  // 其他未知协议或相对路径过滤
  return null
}
