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
import { defineComponent, h, watch } from 'vue'

// 内层组件（必须在 MilkdownProvider 内，才能调 useEditor）
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

    // 外部 modelValue 变化时替换编辑器内容
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

    // 暴露编辑器引用到 window，供右键菜单等直接插入
    ;(window as any).__milkdownEditor = getEditor

    // 延迟暴露 editorView 供 ArticleEditor 直接插入文本
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

// 外层组件（提供 MilkdownProvider 上下文）
export default defineComponent({
  name: 'MilkdownEditor',
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h(
        MilkdownProvider,
        {},
        () =>
          h(MilkdownCore, {
            modelValue: props.modelValue,
            'onUpdate:modelValue': (v: string) => emit('update:modelValue', v),
          }),
      )
  },
})
</script>

<style scoped>
/* 每个 Milkdown 实例挂载在 provider 内部的 .milkdown DOM 上
   全局样式在 base.css 中补充 */
</style>
