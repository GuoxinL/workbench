import { commandsCtx, editorViewCtx } from '@milkdown/kit/core'
import type { Editor } from '@milkdown/kit/core'
import { TextSelection } from '@milkdown/prose/state'
import { openPrompt } from '@/composables/useDialog'
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  createCodeBlockCommand,
  insertHrCommand,
  toggleLinkCommand,
  insertImageCommand,
  addBlockTypeCommand,
} from '@milkdown/kit/preset/commonmark'
import { createTable } from '@milkdown/kit/preset/gfm'

/**
 * 工具栏与右键菜单的「同源」命令层：所有命令统一走 milkdown 官方 commandsCtx
 * 管道（正确集成 keymap / 输入规则 / 历史栈 / 命令管理器），不再手写 ProseMirror
 * transaction。工具栏按钮与右键菜单均调用本模块的同一组函数。
 */

export type CmdType =
  | 'bold'
  | 'italic'
  | 'code'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'ul'
  | 'ol'
  | 'quote'
  | 'codeblock'
  | 'hr'
  | 'link'
  | 'image'

// 统一命令调用入口：ed.action 内取 commandsCtx 并 call(key, payload)。
// key 为 milkdown 的 CmdKey<T>，这里放宽为 unknown 以容纳各类命令键。
const call = (ed: Editor, key: unknown, ...args: unknown[]) =>
  ed.action((ctx) => {
    ;(ctx.get(commandsCtx) as any).call(key, ...args)
  })

/** 插入图片节点（工具栏与右键菜单共用） */
export function insertImage(ed: Editor, src: string, alt = ''): void {
  call(ed, insertImageCommand.key, { src, alt })
}

/** 插入表格节点（右键菜单用；首行为表头，由 gfm createTable 生成） */
export function insertTable(ed: Editor, rows: number, cols: number): void {
  ed.action((ctx) => {
    ;(ctx.get(commandsCtx) as any).call(addBlockTypeCommand.key, {
      nodeType: createTable(ctx, rows, cols),
    })
  })
}

// 链接：弹窗收集 href；空选区时先插入文字并选中，再走官方 toggleLinkCommand 套标记
async function runLink(ed: Editor): Promise<void> {
  const href = await openPrompt({
    title: '插入链接',
    label: '链接 URL',
    default: 'https://',
    placeholder: 'https://example.com',
    confirmText: '插入',
  })
  if (!href) return
  ed.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { empty, from } = view.state.selection
    if (empty) {
      const text = '链接'
      view.dispatch(view.state.tr.insertText(text, from))
      view.dispatch(
        view.state.tr.setSelection(
          TextSelection.create(view.state.doc, from, from + text.length),
        ),
      )
    }
    ;(ctx.get(commandsCtx) as any).call(toggleLinkCommand.key, { href })
  })
}

// 图片（工具栏）：弹窗收集 URL + 描述，再调 insertImage
async function runImage(ed: Editor): Promise<void> {
  const src = await openPrompt({
    title: '插入图片',
    label: '图片 URL',
    default: 'https://',
    placeholder: 'https://example.com/x.png',
    confirmText: '插入',
  })
  if (!src) return
  const alt = await openPrompt({
    title: '图片描述',
    label: '描述（可选）',
    placeholder: '图片说明',
    confirmText: '确定',
  })
  insertImage(ed, src, alt || '')
}

/** 统一命令入口：工具栏按钮与右键菜单均调用此函数 */
export async function runCommand(ed: Editor, type: CmdType): Promise<void> {
  switch (type) {
    case 'bold':
      return call(ed, toggleStrongCommand.key)
    case 'italic':
      return call(ed, toggleEmphasisCommand.key)
    case 'code':
      return call(ed, toggleInlineCodeCommand.key)
    case 'h1':
      return call(ed, wrapInHeadingCommand.key, 1)
    case 'h2':
      return call(ed, wrapInHeadingCommand.key, 2)
    case 'h3':
      return call(ed, wrapInHeadingCommand.key, 3)
    case 'ul':
      return call(ed, wrapInBulletListCommand.key)
    case 'ol':
      return call(ed, wrapInOrderedListCommand.key)
    case 'quote':
      return call(ed, wrapInBlockquoteCommand.key)
    case 'codeblock':
      return call(ed, createCodeBlockCommand.key)
    case 'hr':
      return call(ed, insertHrCommand.key)
    case 'link':
      return runLink(ed)
    case 'image':
      return runImage(ed)
  }
}
