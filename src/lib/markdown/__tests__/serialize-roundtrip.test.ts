import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, editorStateCtx, serializerCtx } from '@milkdown/kit/core'
import { remarkStringifyOptionsCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { wikilinkSchema, wikilinkRemark, wikilinkMdHandler } from '@/lib/markdown/milkdown-wikilink'
import { scanConvertWikilinks } from '@/lib/markdown/scan-wikilinks'
import type { EditorView } from '@milkdown/prose/view'

/**
 * 验证 Milkdown 加载含 [[标题]] 的内容、经 scanConvertWikilinks 生成 wikilink
 * mark 后，序列化回吐的 markdown 仍保留 `[[...]]` 语法（不被转义成 `\[\[...]]`）。
 * 这是修复「引用面板误报无出链 / 保存后双链丢失」的关键：wikilink mdast handler
 * 原样输出 `[[标题|别名]]`，不经 markdown 转义器。
 *
 * 流程与真实 MilkdownEditor.vue 一致：先建编辑器（parse），再
 * scanConvertWikilinks(view) 把 `[[...]]` 文本转为 mark，最后序列化。
 */
describe('Milkdown wikilink 序列化往返', () => {
  function makeEditor(defaultValue: string) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, host)
        ctx.set(defaultValueCtx, defaultValue)
        // 注册 wikilink 的 mdast 序列化 handler（与 MilkdownEditor.vue 一致）
        const prev = ctx.get(remarkStringifyOptionsCtx) as
          | { handlers?: Record<string, unknown>; encode?: unknown }
          | undefined
        ctx.set(remarkStringifyOptionsCtx, {
          ...prev,
          handlers: { ...(prev?.handlers ?? {}), wikilink: wikilinkMdHandler } as any,
        })
      })
      .use(commonmark)
      .use(gfm)
      .use(wikilinkSchema)
      .use(wikilinkRemark)
      .create()
      .then((editor) => {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx) as EditorView
          scanConvertWikilinks(view)
        })
        return { editor, host }
      })
  }

  function serialize(editor: any): string {
    let captured = ''
    editor.action((ctx: any) => {
      const state = ctx.get(editorStateCtx)
      const serializer = ctx.get(serializerCtx)
      captured = serializer(state.doc)
    })
    return captured
  }

  it('加载 [[欢迎使用工作台]] 后序列化保留 [[...]]（不转义）', async () => {
    const { editor, host } = await makeEditor('给文章打标签。见 [[欢迎使用工作台]]。')
    const captured = serialize(editor)
    expect(captured).toContain('[[欢迎使用工作台]]')
    expect(captured).not.toContain('\\[[')
    editor.destroy()
    host.remove()
  }, 30000)

  it('带别名 [[标题|别名]] 序列化保留别名', async () => {
    const { editor, host } = await makeEditor('见 [[欢迎使用工作台|欢迎]]。')
    const captured = serialize(editor)
    expect(captured).toContain('[[欢迎使用工作台|欢迎]]')
    editor.destroy()
    host.remove()
  }, 30000)
})
