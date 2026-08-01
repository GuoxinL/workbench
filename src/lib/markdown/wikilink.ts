import type { TokenizerAndRendererExtension } from 'marked'
import { slug } from '@/lib/slug'
import { escapeHtml } from '@/lib/html'

/**
 * `[[标题]]` / `[[标题|别名]]` 双链扩展（设计 L1–L11）。
 * - 渲染为 <a class="wikilink" data-slug data-title data-id href="...">
 * - resolve 返回 id → href 指向 #/articles/<id>
 * - resolve 返回 null → 追加 .missing 类，href 降级为 #
 * - 不传 resolve → href 降级为 #
 * - 点击跳转由 ArticleEditor 用 data-id/data-slug 接管
 */
export function wikilinkExtension(resolve?: (title: string) => string | null): TokenizerAndRendererExtension {
  return {
    name: 'wikilink',
    level: 'inline',
    start(src: string) {
      return src.indexOf('[[')
    },
    tokenizer(src: string) {
      const m = /^\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]/.exec(src)
      if (m) {
        return {
          type: 'wikilink',
          raw: m[0],
          title: m[1].trim(),
          alias: m[2]?.trim(),
        } as any
      }
      return undefined
    },
    renderer(token: any) {
      const s = slug(token.title)
      const label = token.alias || token.title
      const id = resolve ? resolve(token.title) : null
      const missing = resolve !== undefined && !id
      const cls = missing ? 'wikilink missing' : 'wikilink'
      const rawTitle = escapeHtml(token.title)
      const rawSlug = escapeHtml(s)
      const rawId = id ? escapeHtml(id) : ''
      const href = id
        ? `#/articles/${encodeURIComponent(id)}`
        : '#'
      return `<a class="${cls}" data-slug="${rawSlug}" data-title="${rawTitle}" data-id="${rawId}" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`
    },
  } as TokenizerAndRendererExtension
}
