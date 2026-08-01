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
