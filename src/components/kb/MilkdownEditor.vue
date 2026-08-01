<script lang="ts">
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core'
import { remarkStringifyOptionsCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { $prose } from '@milkdown/kit/utils'
import { nord } from '@milkdown/theme-nord'
import { Milkdown, MilkdownProvider, useEditor, useInstance } from '@milkdown/vue'
import { wikilinkSchema, wikilinkInputRule, wikilinkRemark, wikilinkMdHandler } from '@/lib/markdown/milkdown-wikilink'
import { scanConvertWikilinks } from '@/lib/markdown/scan-wikilinks'
import { pasteImagePlugin } from '@/lib/markdown/paste-image'
import { codeMirror } from '@milkdown/crepe/feature/code-mirror'
import { toolbar } from '@milkdown/crepe/feature/toolbar'
import { table } from '@milkdown/crepe/feature/table'
import { imageBlock } from '@milkdown/crepe/feature/image-block'
import { placeholder } from '@milkdown/crepe/feature/placeholder'
import { defineComponent, h } from 'vue'
import type { EditorView } from '@milkdown/prose/view'

const MilkdownCore = defineComponent({
  name: 'MilkdownCore',
  props: { modelValue: String },
    emits: ['update:modelValue', 'ready'],
  setup(props, { emit }) {
    // 初始即为 true：屏蔽编辑器 build / 首次 markdownUpdated 推送。加载时文档里
    // `[[...]]` 还是纯文本（wikilink mark 由 waitEditor 里的 scanConvertWikilinks
    // 生成），若此刻把序列化结果回吐给父组件，mdast 的 text handler 会把 `[`
    // 转义成 `\[`，污染 draftContent（表现为引用面板「无出链」、保存后双链丢失）。
    // 待 mark 生成后再放开，后续编辑走带 mark 的序列化（wikilinkMdHandler 原样输出）。
    let scanning = true
    // 编辑器渲染完成后通知父组件重跑双链缺失标记等后处理
    const onReady = () => emit('ready')

    useEditor((root) =>
      Editor.make()
        .config(nord)
        .config((ctx) => {
          ctx.set(rootCtx, root)
          ctx.set(defaultValueCtx, props.modelValue ?? '')
          // 注册 wikilink 的 mdast 序列化 handler：让 `[[标题]]` 在导出 markdown
          // 时不被 markdown 转义器把 `[` 转义成 `\[`（否则双链语法损坏、保存后丢失）。
          // 合并既有 handlers，避免覆盖 crepe 等其它序列化 handler。
          const prev = ctx.get(remarkStringifyOptionsCtx) as
            | { handlers?: Record<string, unknown>; encode?: unknown }
            | undefined
          ctx.set(remarkStringifyOptionsCtx, {
            ...prev,
            // wikilink 非 mdast 标准节点，Handlers 类型不包含它，故整体断言
            handlers: { ...(prev?.handlers ?? {}), wikilink: wikilinkMdHandler } as any,
          })
          ctx.get(listenerCtx).markdownUpdated((_, md: string) => {
            if (!scanning) emit('update:modelValue', md)
          })
        })
        .use(commonmark)
        .use(gfm)
        .use(wikilinkSchema)
        .use(wikilinkRemark)
        .use(wikilinkInputRule)
        .use($prose(() => pasteImagePlugin()))
        .use(listener),
    )

    const [, getEditor] = useInstance() as any
    const waitEditor = (fn: (ed: Editor) => void, ms = 100) => {
      setTimeout(() => { const ed = getEditor(); if (ed) fn(ed) }, ms)
    }

    waitEditor((ed) => {
      codeMirror(ed); toolbar(ed); table(ed); imageBlock(ed); placeholder(ed)
      ed.action((ctx: any) => {
        const view = ctx.get(editorViewCtx) as EditorView | undefined
        if (!view) return
        // 暴露给 ArticleEditor 的 insertAtCursor（右键菜单插入）
        ;(window as any).__milkdownView = view
        scanning = true
        scanConvertWikilinks(view)
        scanning = false
        onReady()
      })
    })
    return () => h(Milkdown)
  },
})

export default defineComponent({
  name: 'MilkdownEditor',
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue', 'ready'],
  setup(props, { emit }) {
    return () => h(MilkdownProvider, {}, () =>
      h(MilkdownCore, {
        modelValue: props.modelValue,
        'onUpdate:modelValue': (v: string) => emit('update:modelValue', v),
        onReady: () => emit('ready'),
      }),
    )
  },
})
</script>
