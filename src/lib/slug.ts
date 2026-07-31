/**
 * 标题归一化：trim + 转小写 + 空白折叠为单空格。
 * 双链寻址用此函数做相等比较，与原 store.js 的 slug() 语义一致。
 */
export function slug(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}
