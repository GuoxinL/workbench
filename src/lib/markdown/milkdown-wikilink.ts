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

const TAG = '[wikilink]'

/** 标题归一化，空串或全空白返回占位 'untitled' 避免下游异常 */
function slug(s: unknown): string {
  if (typeof s !== 'string') {
    console.warn(`${TAG} slug() received non-string:`, typeof s, s)
    return 'untitled'
  }
  const trimmed = s.trim()
  if (!trimmed) {
    console.warn(`${TAG} slug() received empty/whitespace-only title`)
    return 'untitled'
  }
  return trimmed.toLowerCase().replace(/\s+/g, ' ')
}

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
  parseDOM: [{ tag: 'a.wikilink' }],
  toDOM: () => ['a', { class: 'wikilink', href: '#' }, 0],
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
    runner: (state, mark) => {
      const title = (mark.attrs.title as string) || 'untitled'
      state.addNode('text', undefined, `[[${title}]]`)
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
