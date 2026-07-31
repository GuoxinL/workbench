/**
 * 标题归一化：trim + 转小写 + 空白折叠为单空格。
 * 供双链语法（[[标题]]）的 link text 去重比较与 renameRefs 文本匹配用。
 */
export function slug(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}
