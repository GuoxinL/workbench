/**
 * 缺失双链标记：扫描 root 内的 .wikilink 元素，对不存在对应文章（按 data-slug 归一化匹配）的双链加 `missing` 类。
 * 抽成纯函数便于单元测试（原逻辑内联在 ArticleEditor.refreshMissingLinks）。
 */
import type { Article } from '@/types'
import { slug } from '@/lib/slug'

export function markMissingLinks(root: ParentNode, articles: Article[]): void {
  const existing = new Set(
    articles.filter((a) => !a.deleted).map((a) => slug(a.title)),
  )
  root.querySelectorAll<HTMLElement>('.milkdown .wikilink').forEach((el) => {
    const s = el.getAttribute('data-slug')
    const existed = s ? existing.has(s) : false
    el.classList.toggle('missing', !existed)
  })
}
