/**
 * Milkdown 双链插件：`[[标题]]` / `[[标题|别名]]`
 *
 * - inputRule: 实时输入时自动转为 wikilink mark
 * - remark 插件: 加载已有文档时把 `[[标题]]` 文本转为 wikilink mark
 * - parseMarkdown: 匹配 remark 生成的 `wiki://` 链接节点
 * - toMarkdown: 序列化回 `[[标题]]`
 */
import { $markAttr, $markSchema, $inputRule, $remark } from '@milkdown/utils'
import { InputRule } from 'prosemirror-inputrules'
import type { Root } from 'mdast'
import { visit } from 'unist-util-visit'

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** HTML 属性定义 */
export const wikilinkAttr = $markAttr('wikilink')

/** wikilink mark schema */
export const wikilinkSchema = $markSchema('wikilink', () => ({
  prio: 100,
  parseDOM: [{ tag: 'a.wikilink' }],
  toDOM: () => ['a', { class: 'wikilink', href: '#' }, 0],
  parseMarkdown: {
    match: (node) =>
      node.type === 'link' &&
      typeof (node as any).url === 'string' &&
      (node as any).url.startsWith('wiki://'),
    runner: (state, node, markType) => {
      const title = decodeURIComponent((node as any).url.replace('wiki://', ''))
      state.openMark(markType, { title, slug: slug(title) })
      state.next((node as any).children)
      state.closeMark(markType)
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'wikilink',
    runner: (state, mark) => {
      const title = (mark.attrs.title as string) || ''
      state.addNode('text', undefined, `[[${title}]]`)
    },
  },
}))

/**
 * Remark 插件：将 `[[标题]]` / `[[标题|别名]]` 文本转为 `wiki://标题` 链接节点，
 * 由 parseMarkdown 再转为 wikilink mark。
 */
export const wikilinkRemark = $remark('wikilinkRemark', () => {
  return (tree: Root) => {
    visit(tree, 'text', (node, index, parent) => {
      if (!parent || index === undefined) return
      const re = /\[\[([^\|\]]+)(?:\|([^\]]+))?\]\]/g
      const parts: { type: string; [k: string]: any }[] = []
      let pos = 0
      let m: RegExpExecArray | null
      while ((m = re.exec((node as any).value)) !== null) {
        const title = m[1].trim()
        const alias = m[2]?.trim() || title
        if (m.index > pos) {
          parts.push({ type: 'text', value: (node as any).value.slice(pos, m.index) })
        }
        parts.push({
          type: 'link',
          url: `wiki://${encodeURIComponent(title)}`,
          title: null,
          children: [{ type: 'text', value: alias }],
        })
        pos = m.index + m[0].length
      }
      if (pos < (node as any).value.length) {
        parts.push({ type: 'text', value: (node as any).value.slice(pos) })
      }
      if (parts.length === 0) return
      parent.children.splice(index, 1, ...(parts as any))
    })
  }
})

/** `[[标题]]` / `[[标题|别名]]` 实时输入 → wikilink */
export const wikilinkInputRule = $inputRule(
  () =>
    new InputRule(
      /\[\[([^\|\]]+)(?:\|([^\]]+))?\]\]$/,
      (state, match, start, end) => {
        const title = (match[1] ?? '').trim()
        const alias = (match[2] ?? title).trim()
        const mark = state.schema.marks.wikilink.create({
          title,
          slug: slug(title),
        })
        const { tr } = state
        tr.replaceWith(start, end, state.schema.text(alias, [mark]))
        return tr
      },
    ),
)
