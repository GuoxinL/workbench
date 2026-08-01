<script lang="ts">
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { $prose } from '@milkdown/kit/utils'
import { nord } from '@milkdown/theme-nord'
import { Milkdown, MilkdownProvider, useEditor, useInstance } from '@milkdown/vue'
import { wikilinkSchema, wikilinkInputRule, wikilinkRemark } from '@/lib/markdown/milkdown-wikilink'
import { pasteImagePlugin } from '@/lib/markdown/paste-image'
import { codeMirror } from '@milkdown/crepe/feature/code-mirror'
import { toolbar } from '@milkdown/crepe/feature/toolbar'
import { table } from '@milkdown/crepe/feature/table'
import { imageBlock } from '@milkdown/crepe/feature/image-block'
import { placeholder } from '@milkdown/crepe/feature/placeholder'
import { defineComponent, h } from 'vue'
import type { EditorView } from '@milkdown/prose/view'

function slug(s: string) { return s.trim().toLowerCase().replace(/\s+/g, ' ') }

/** 扫描 ProseMirror 文档，把 [[标题|别名]] 文本转为 wikilink mark */
function scanConvertWikilinks(view: EditorView) {
  const ranges: { from: number; to: number; title: string; alias: string }[] = []
  view.state.doc.descendants((node, pos) => {
    if (!node.isText) return
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
    if (mark) tr.replaceWith(r.from, r.to, view.state.schema.text(r.alias, [mark]))
  }
  view.dispatch(tr)
}

const MilkdownCore = defineComponent({
  name: 'MilkdownCore',
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    let scanning = false

    useEditor((root) =>
      Editor.make()
        .config(nord)
        .config((ctx) => {
          ctx.set(rootCtx, root)
          ctx.set(defaultValueCtx, props.modelValue ?? '')
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
        scanning = true
        scanConvertWikilinks(view)
        scanning = false
      })
    })
    ;(window as any).__milkdownEditor = getEditor
    waitEditor((ed) => {
      ed.action((ctx: any) => { (window as any).__milkdownView = ctx.get(editorViewCtx) })
    }, 600)

    return () => h(Milkdown)
  },
})

export default defineComponent({
  name: 'MilkdownEditor',
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h(MilkdownProvider, {}, () =>
      h(MilkdownCore, {
        modelValue: props.modelValue,
        'onUpdate:modelValue': (v: string) => emit('update:modelValue', v),
      }),
    )
  },
})
</script>
