import { $markAttr, $markSchema, $inputRule } from '@milkdown/utils'
import { InputRule } from 'prosemirror-inputrules'

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
    match: () => false,
    runner: () => {},
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'wikilink',
    runner: (state, mark) => {
      const title = (mark.attrs.title as string) || ''
      state.addNode('text', undefined, `[[${title}]]`)
    },
  },
}))

/** `[[标题]]` / `[[标题|别名]]` 自动转为 wikilink */
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
