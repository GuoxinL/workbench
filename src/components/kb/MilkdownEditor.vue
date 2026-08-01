<script lang="ts">
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { nord } from '@milkdown/theme-nord'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/vue'
import { wikilinkSchema, wikilinkInputRule, wikilinkRemark } from '@/lib/markdown/milkdown-wikilink'
import { defineComponent, h } from 'vue'

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
        .use(listener),
    )
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
