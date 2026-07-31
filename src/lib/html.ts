/**
 * HTML 转义：用户内容渲染前必须经此处理，避免标签注入 / XSS。
 * 与旧 util.esc() 语义一致，但在新栈中作为 lib 层纯函数存在。
 */
const MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => MAP[c])
}
