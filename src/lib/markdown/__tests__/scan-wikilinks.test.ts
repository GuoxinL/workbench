import { describe, it, expect, vi } from 'vitest'
import { scanConvertWikilinks } from '@/lib/markdown/scan-wikilinks'

/**
 * 用最小 mock 模拟 ProseMirror EditorView，重点验证 scanConvertWikilinks
 * 是否会错误地把代码块/行内代码里的 [[...]] 当成双链转换。
 */
function makeView(nodes: { kind: 'text' | 'codeBlock'; text: string; marks?: { type: { name: string } }[] }[]) {
  const doc = {
    descendants(cb: (node: any, pos: number) => void | boolean) {
      let pos = 1
      for (const n of nodes) {
        if (n.kind === 'text') {
          cb({ isText: true, type: { name: 'text' }, text: n.text, marks: n.marks ?? [] }, pos)
        } else {
          cb({ isText: false, type: { name: 'codeBlock' }, text: n.text, marks: [] }, pos)
        }
        pos += n.text.length
      }
    },
  }
  const schema = {
    marks: { wikilink: { create: (attrs: any) => ({ type: 'wikilink', attrs }) } },
    text: (t: string, marks: any[]) => ({ text: t, marks }),
  }
  const tr = { replaceWith: vi.fn() }
  const view: any = {
    state: { doc, schema, tr },
    dispatch: () => {},
  }
  return { view, tr }
}

describe('scanConvertWikilinks 代码块/行内代码排除', () => {
  it('仅转换普通文本中的双链，跳过行内代码与代码块内的 [[...]]', () => {
    const { view, tr } = makeView([
      { kind: 'text', text: '普通 [[目标A]] 文本' },
      { kind: 'text', text: '代码 [[目标B]] 内', marks: [{ type: { name: 'code' } }] },
      { kind: 'codeBlock', text: 'block [[目标C]]' },
    ])
    scanConvertWikilinks(view)

    // 只有「目标A」被转换（行内代码与代码块内的不应转换）
    expect(tr.replaceWith).toHaveBeenCalledTimes(1)
    expect(tr.replaceWith.mock.calls[0][2].text).toBe('目标A')
  })

  it('代码块内的 [[...]] 完全不转换', () => {
    const { view, tr } = makeView([{ kind: 'codeBlock', text: 'const x = "[[目标]]"' }])
    scanConvertWikilinks(view)
    expect(tr.replaceWith).not.toHaveBeenCalled()
  })

  it('普通文本 [[标题|别名]] 转为 wikilink 并保留别名', () => {
    const { view, tr } = makeView([{ kind: 'text', text: '见 [[目标|别名]] 文' }])
    scanConvertWikilinks(view)

    expect(tr.replaceWith).toHaveBeenCalledTimes(1)
    const node = tr.replaceWith.mock.calls[0][2]
    expect(node.text).toBe('别名')
    expect(node.marks[0].attrs).toEqual({ title: '目标', slug: '目标' })
  })
})
