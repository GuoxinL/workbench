import type { EditorView } from '@milkdown/prose/view'
import { slug } from '@/lib/slug'

/**
 * 扫描 ProseMirror 文档，把 `[[标题|别名]]` 文本转为 wikilink mark。
 *
 * 必须跳过行内代码（code mark）与代码块（codeBlock 节点）：示例代码里的
 * `[[示例]]` 是教学/文档用途，不应被渲染成可点击双链（否则用户看到代码块里的
 * `[[X]]` 也变成链接，点击还会触发跳转）。markdown 解析阶段的 wikilinkRemark
 * 只访问 text 节点不会触碰 inlineCode，但此处是基于 ProseMirror 文档全文扫描，
 * 行内代码在 PM 中是带 `code` mark 的 text 节点，需要显式排除。
 */
export function scanConvertWikilinks(view: EditorView) {
  const ranges: { from: number; to: number; title: string; alias: string }[] = []
  view.state.doc.descendants((node, pos) => {
    // 代码块：自身不是 text，且不应进入其内部
    if (node.type.name === 'codeBlock') return false
    if (!node.isText) return
    // 行内代码：带 code mark 的 text 节点，里面的 [[...]] 不当双链
    if (node.marks.some((m) => m.type.name === 'code')) return
    const text = node.text || ''
    const re = /\[\[([^\|\]]+)(?:\|([^\]]+))?\]\]/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const t = (m[1] ?? '').trim()
      if (!t) continue
      ranges.push({
        from: pos + m.index,
        to: pos + m.index + m[0].length,
        title: t,
        alias: (m[2] ?? t).trim() || t,
      })
    }
  })
  if (ranges.length === 0) return
  const tr = view.state.tr
  ranges.sort((a, b) => b.from - a.from)
  for (const r of ranges) {
    const mark = view.state.schema.marks.wikilink?.create({ title: r.title, slug: slug(r.title) })
    if (mark) {
      tr.replaceWith(r.from, r.to, view.state.schema.text(r.alias, [mark]))
    }
  }
  view.dispatch(tr)
}
