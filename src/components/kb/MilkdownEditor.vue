<script lang="ts">
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { replaceAll, getMarkdown, $prose } from '@milkdown/kit/utils'
import { nord } from '@milkdown/theme-nord'
import { Milkdown, MilkdownProvider, useEditor, useInstance } from '@milkdown/vue'
import { wikilinkSchema, wikilinkInputRule, wikilinkRemark } from '@/lib/markdown/milkdown-wikilink'
import { pasteImagePlugin } from '@/lib/markdown/paste-image'
import { codeMirror } from '@milkdown/crepe/feature/code-mirror'
import { toolbar } from '@milkdown/crepe/feature/toolbar'
import { table } from '@milkdown/crepe/feature/table'
import { imageBlock } from '@milkdown/crepe/feature/image-block'
import { placeholder } from '@milkdown/crepe/feature/placeholder'
import { defineComponent, h, watch } from 'vue'
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
      ranges.push({
        from: pos + m.index,
        to: pos + m.index + m[0].length,
        title: m[1].trim(),
        alias: m[2]?.trim() || m[1].trim(),
      })
    }
  })
  if (ranges.length === 0) return
  const tr = view.state.tr
  ranges.sort((a, b) => b.from - a.from) // 从后往前替换保位置
  for (const r of ranges) {
    const mark = view.state.schema.marks.wikilink?.create({
      title: r.title,
      slug: slug(r.title),
    })
    if (mark) tr.replaceWith(r.from, r.to, view.state.schema.text(r.alias, [mark]))
  }
  view.dispatch(tr)
}

// 内层组件
const MilkdownCore = defineComponent({
  name: 'MilkdownCore',
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    useEditor((root) =>
      Editor.make()
        .config(nord)
        .config((ctx) => {
          ctx.set(rootCtx, root)
          ctx.set(defaultValueCtx, props.modelValue ?? '')
          ctx.get(listenerCtx).markdownUpdated((_, md: string) => {
            emit('update:modelValue', md)
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

    // 编辑器就绪后应用 Crepe 功能
    watch(
      () => getEditor(),
      (ed) => {
        if (!ed) return
        // 延迟确保 DOM 就绪
        setTimeout(() => {
          codeMirror(ed)
          toolbar(ed)
          table(ed)
          imageBlock(ed)
          placeholder(ed)
          // 初始加载后扫描 wikilink
          ed.action((ctx: any) => {
            const view = ctx.get(editorViewCtx) as EditorView
            if (view) scanConvertWikilinks(view)
          })
        }, 100)
      },
      { immediate: true },
    )

    watch(
      () => props.modelValue,
      (val) => {
        const ed = getEditor()
        if (!ed) return
        const current = ed.action(getMarkdown())
        if (current !== (val ?? '')) {
          ed.action(replaceAll(val ?? ''))
          // Crepe 绕过 remark 流水线，手动扫描转换 wikilink
          setTimeout(() => {
            const ev = (window as any).__milkdownView as EditorView | undefined
            if (ev) scanConvertWikilinks(ev)
          }, 200)
        }
      },
    )

    ;(window as any).__milkdownEditor = getEditor
    setTimeout(() => {
      const ed = getEditor()
      if (ed) {
        ed.action((ctx: any) => {
          ;(window as any).__milkdownView = ctx.get(editorViewCtx)
        })
      }
    }, 500)

    return () => h(Milkdown)
  },
})

export default defineComponent({
  name: 'MilkdownEditor',
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h(MilkdownProvider, {}, () =>
        h(MilkdownCore, {
          modelValue: props.modelValue,
          'onUpdate:modelValue': (v: string) => emit('update:modelValue', v),
        }),
      )
  },
})
</script>
