import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import { highlightExtension } from './highlight'
import { wikilinkExtension } from './wikilink'

export interface RenderOptions {
  /**
   * 解析双链标题为文章 id（null 表示未找到，会标记 .missing，对应 L5/L8）。
   * 不传则不标记缺失，所有双链按已存在渲染。
   */
  resolve?: (title: string) => string | null
}

/**
 * 渲染知识库文章正文为安全 HTML。
 * 管线：marked（GFM）+ 自定义扩展（==高亮==、[[双链]]）→ DOMPurify 消毒。
 * 设计 §2.5：以 DOMPurify 替代旧 util.esc() 的全量转义；用户内容渲染前必须消毒。
 */
export function renderMarkdown(src: string, opts: RenderOptions = {}): string {
  const marked = new Marked({ gfm: true, breaks: false })
  marked.use({ extensions: [highlightExtension(), wikilinkExtension(opts.resolve)] })
  const raw = marked.parse(src, { async: false }) as string
  return DOMPurify.sanitize(raw)
}
