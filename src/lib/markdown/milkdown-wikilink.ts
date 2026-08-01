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
import { slug } from '@/lib/slug'

const TAG = '[wikilink]'

/** 从 wiki:// 协议 URL 提取原始标题；解码失败则返回占位 */
function parseWikiUrl(url: string): string {
  try {
    const title = decodeURIComponent(url.replace(/^wiki:\/\//, ''))
    return title.trim() || 'untitled'
  } catch (e) {
    console.warn(`${TAG} parseWikiUrl decode failed:`, url, e)
    return 'untitled'
  }
}

/** HTML 属性定义 */
export const wikilinkAttr = $markAttr('wikilink')

/** wikilink mark schema */
export const wikilinkSchema = $markSchema('wikilink', () => ({
  prio: 100,
  attrs: {
    title: { default: '' },
    slug: { default: '' },
  },
  parseDOM: [{ tag: 'a.wikilink' }],
  toDOM: (mark) => [
    'a',
    {
      class: 'wikilink',
      href: '#',
      'data-title': (mark.attrs.title as string) || '',
      'data-slug': (mark.attrs.slug as string) || '',
    },
    0,
  ],
  parseMarkdown: {
    match: (node) =>
      node.type === 'link' &&
      typeof (node as any).url === 'string' &&
      (node as any).url.startsWith('wiki://'),
    runner: (state, node, markType) => {
      const url = (node as any).url as string
      if (!url) {
        console.warn(`${TAG} parseMarkdown: link node has no url`)
        return
      }
      const title = parseWikiUrl(url)
      const children = (node as any).children
      state.openMark(markType, { title, slug: slug(title) })
      if (children && Array.isArray(children)) {
        state.next(children)
      } else {
        console.warn(`${TAG} parseMarkdown: link node has no children for "${title}"`)
      }
      state.closeMark(markType)
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'wikilink',
    // 关键：必须返回 truthy（state.addNode 返回 state 本身），否则序列化器会
    // 在 `[[title]]` 之后再把节点原始文本（别名）重复输出一遍，导致内容被
    // 污染（如 `[[标题]]别名别名`）。node.text 即编辑器中的展示别名，
    // 据此还原 `[[title|alias]]`，保证保存/重载后别名不丢。
    runner: (state, mark, node) => {
      const title = (mark.attrs.title as string) || 'untitled'
      const alias = (node && node.isText ? (node as any).text : '') || title
      const serialized = alias && alias !== title ? `[[${title}|${alias}]]` : `[[${title}]]`
      state.addNode('text', undefined, serialized)
      return true
    },
  },
}))

/** 最大单次遍历节点数，防止畸形输入导致死循环 */
const MAX_PARTS = 1000

/**
 * Remark 插件：将 `[[标题]]` / `[[标题|别名]]` 文本转为 `wiki://标题` 链接节点，
 * 由 parseMarkdown 再转为 wikilink mark。
 */
export const wikilinkRemark = $remark('wikilinkRemark', () => {
  return (tree: Root) => {
    visit(tree, 'text', (node, index, parent) => {
      if (!parent || index == null) {
        return // 根节点直接子节点，静默跳过
      }
      if (!Array.isArray(parent.children)) {
        console.warn(`${TAG} remark: parent.children is not an array, type=${parent.type}`)
        return
      }

      const value = (node as any).value as string | undefined
      if (!value || typeof value !== 'string') {
        console.warn(`${TAG} remark: text node has no valid value, node=`, node)
        return
      }

      const re = /\[\[([^\|\]]+)(?:\|([^\]]+))?\]\]/g
      const parts: { type: string; [k: string]: any }[] = []
      let pos = 0
      let m: RegExpExecArray | null
      let iteration = 0

      while ((m = re.exec(value)) !== null) {
        if (++iteration > MAX_PARTS) {
          console.warn(`${TAG} remark: hit MAX_PARTS=${MAX_PARTS}, stopped scanning "${value.slice(0, 80)}..."`)
          break
        }

        const title = (m[1] ?? '').trim()
        if (!title) continue
        const alias = (m[2] ?? title).trim() || title

        if (m.index > pos) {
          parts.push({ type: 'text', value: value.slice(pos, m.index) })
        }
        parts.push({
          type: 'link',
          url: `wiki://${encodeURIComponent(title)}`,
          title: null,
          children: [{ type: 'text', value: alias }],
        })
        pos = m.index + m[0].length
      }

      if (pos < value.length) {
        parts.push({ type: 'text', value: value.slice(pos) })
      }
      if (parts.length === 0) return

      try {
        parent.children.splice(index, 1, ...(parts as any))
      } catch (e) {
        console.warn(`${TAG} remark: splice failed, index=${index}, parent=${parent.type}, parts=${parts.length}`, e)
      }
    })
  }
})

/** `[[标题]]` / `[[标题|别名]]` 实时输入 → wikilink */
export const wikilinkInputRule = $inputRule(
  () =>
    new InputRule(
      /\[\[([^\|\]]+)(?:\|([^\]]+))?\]\]$/,
      (state, match, start, end) => {
        const rawTitle = (match[1] ?? '').trim()
        if (!rawTitle) {
          console.warn(`${TAG} inputRule: empty title in match "${match[0]}" — removing`)
          state.tr.delete(start, end)
          return state.tr
        }
        const alias = (match[2] ?? rawTitle).trim() || rawTitle
        const markType = state.schema.marks.wikilink
        if (!markType) {
          console.warn(`${TAG} inputRule: schema.marks.wikilink not registered — skipping`)
          return state.tr
        }

        try {
          const mark = markType.create({ title: rawTitle, slug: slug(rawTitle) })
          const { tr } = state
          tr.replaceWith(start, end, state.schema.text(alias, [mark]))
          return tr
        } catch (e) {
          console.warn(`${TAG} inputRule: mark.create/replaceWith failed for "${rawTitle}"`, e)
          return state.tr
        }
      },
    ),
)
