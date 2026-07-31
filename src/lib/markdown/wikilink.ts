import type { TokenizerAndRendererExtension } from 'marked'
import { slug } from '@/lib/slug'
import { escapeHtml } from '@/lib/html'

/**
 * `[[标题]]` / `[[标题|别名]]` 双链扩展（设计 L1–L11）。
 * - 渲染为 <a class="wikilink" data-slug data-title href="#/kb/<slug>">
 * - 若传入 exists(slug) 且返回 false → 追加 .missing 类（L5/L8）
 * - 点击跳转由 ArticlePreview 组件用 data-slug 接管，href 仅作降级
 */
export function wikilinkExtension(exists?: (slug: string) => boolean): TokenizerAndRendererExtension {
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
      const missing = exists ? !exists(s) : false
      const cls = missing ? 'wikilink missing' : 'wikilink'
      const href = `#/kb/${encodeURIComponent(s)}`
      return `<a class="${cls}" data-slug="${escapeHtml(s)}" data-title="${escapeHtml(token.title)}" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`
    },
  } as TokenizerAndRendererExtension
}
