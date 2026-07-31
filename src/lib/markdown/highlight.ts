import type { TokenizerAndRendererExtension } from 'marked'
import { escapeHtml } from '@/lib/html'

/**
 * `==高亮==` 行内扩展：渲染为 <mark>。
 * 设计 §2.5：支持 ==高亮== 语法（对应 markdown.js 的 == 规则）。
 */
export function highlightExtension(): TokenizerAndRendererExtension {
  return {
    name: 'highlight',
    level: 'inline',
    start(src: string) {
      return src.indexOf('==')
    },
    tokenizer(src: string) {
      const m = /^==([^=]+?)==/.exec(src)
      if (m) return { type: 'highlight', raw: m[0], text: m[1] } as any
      return undefined
    },
    renderer(token: any) {
      return `<mark>${escapeHtml(token.text)}</mark>`
    },
  } as TokenizerAndRendererExtension
}
