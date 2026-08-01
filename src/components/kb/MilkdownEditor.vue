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
import { defineComponent, h, ref } from 'vue'
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
    // 编辑器视图实例：工具栏命令由此操作文档（就绪前为 null，工具栏隐藏）
    const editorView = ref<EditorView | null>(null)
    // 实时获取当前 EditorView：ed.action 在编辑器创建早期捕获的 view 可能是预挂载的
    // 过渡视图，milkdown 之后会换成真正渲染的视图。若命令派发用缓存的 editorView.value
    // 会指向陈旧视图，对其 dispatch 时 tr.before 与渲染视图的 state.doc 不符而抛
    // 「Applying a mismatched transaction」。故派发时通过 getEditor().action 重新取当前视图。
    const getLiveView = (): any => {
      const ed = getEditor()
      if (ed) {
        try {
          let v: any = null
          ed.action((ctx: any) => {
            v = ctx.get(editorViewCtx)
          })
          if (v) return v
        } catch {
          /* 忽略，回退到缓存值 */
        }
      }
      return editorView.value
    }

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
    // 轮询等待编辑器就绪：真实浏览器里 build 常超过 100ms。原实现仅单次检查、
    // getEditor() 为 undefined 就放弃，导致 crepe 工具栏、window.__milkdownView、
    // scanConvertWikilinks 全部不执行 —— 表现为「工具栏消失 / 右键插入失效」。
    // 改为就绪前持续重试（带上限），就绪后仅执行一次。
    let editorReadyHandled = false
    const tryWhenReady = (fn: (ed: Editor) => void, tries = 0) => {
      const ed = getEditor()
      if (ed) {
        if (editorReadyHandled) return
        editorReadyHandled = true
        fn(ed)
        return
      }
      if (tries >= 120) return // 约 6s 仍不可用则放弃，避免死循环
      setTimeout(() => tryWhenReady(fn, tries + 1), 50)
    }
    const waitEditor = (fn: (ed: Editor) => void) => tryWhenReady(fn)

    waitEditor((ed) => {
      codeMirror(ed); toolbar(ed); table(ed); imageBlock(ed); placeholder(ed)
      ed.action((ctx: any) => {
        const view = ctx.get(editorViewCtx) as EditorView | undefined
        if (!view) return
        // 暴露给 ArticleEditor 的 insertAtCursor（右键菜单插入）
        ;(window as any).__milkdownView = view
        // 供常驻工具栏命令操作文档
        editorView.value = view as any
        scanning = true
        try {
          scanConvertWikilinks(view)
        } catch (e) {
          // 扫描失败不应阻断就绪通知与 scanning 复位（否则 draftContent 永不更新）
          console.error('[MilkdownEditor] scanConvertWikilinks failed', e)
        } finally {
          scanning = false
          onReady()
        }
      })
    })

    // ── 常驻 Markdown 格式工具栏 ──
    // 直接用视图自身的 view.state.tr 操作文档：所有事务都源自同一个 view.state，
    // 不会出现 prosemirror-commands / prosemirror-schema-list 跨 prosemirror-state
    // 副本导致的「Applying a mismatched transaction」。mark/node 类型从
    // view.state.schema 动态获取，链接/图片用 prompt 收集用户输入。
    // 注意：view.focus() 必须在 dispatch 之后调用——focus 会刷新 view.state.doc，
    // 若在构建事务前调用，会导致 tr.before 与当前 view.state.doc 不符而派发失败。
    const toggleMarkByName = (name: string) => {
      const view = getLiveView()
      if (!view) return
      const markType = view.state.schema.marks[name]
      if (!markType) return
      const { state } = view
      const { from, to, empty } = state.selection
      const tr = state.tr
      if (empty) {
        // 光标处：切换 stored mark（影响后续输入）
        const marks = state.storedMarks || state.selection.$from.marks()
        const has = markType.isInSet(marks)
        view.dispatch(
          tr.setStoredMarks(has ? markType.removeFromSet(marks) : [markType.create()]),
        )
        view.focus()
        return
      }
      const has = state.doc.rangeHasMark(from, to, markType)
      if (has) tr.removeMark(from, to, markType)
      else tr.addMark(from, to, markType.create())
      view.dispatch(tr)
      view.focus()
    }
    // 将选区覆盖的文本块整体改为指定 nodeType（setBlockType 的 tr 版实现）
    const setBlockTypeTo = (nodeType: any, attrs: Record<string, unknown> | null) => {
      const view = getLiveView()
      if (!view) return
      const { state } = view
      const { from, to } = state.selection
      const tr = state.tr
      let changed = false
      state.doc.nodesBetween(from, to, (node: any, pos: number) => {
        if (!node.isTextblock) return
        if (node.hasMarkup(nodeType, attrs || undefined)) return
        tr.setNodeMarkup(pos, nodeType, attrs || undefined)
        changed = true
      })
      if (changed) view.dispatch(tr)
      view.focus()
    }
    const toggleHeading = (level: number) => {
      const view = getLiveView()
      if (!view) return
      const { state } = view
      const { $from, $to } = state.selection
      let already = false
      state.doc.nodesBetween($from.pos, $to.pos, (n: any) => {
        if (n.type.name === 'heading' && n.attrs.level === level) already = true
      })
      if (already) setBlockTypeTo(state.schema.nodes.paragraph, null)
      else setBlockTypeTo(state.schema.nodes.heading, { level })
    }
    // 用 tr.wrap 包裹选区文本块（wrap 为从外到内的节点数组）
    const wrapWith = (wrap: any[]) => {
      const view = getLiveView()
      if (!view) return
      const { state } = view
      const { $from, $to } = state.selection
      const range = $from.blockRange($to)
      if (!range) return
      view.dispatch(state.tr.wrap(range, wrap))
      view.focus()
    }
    const wrapList = (name: string) => {
      const view = getLiveView()
      if (!view) return
      const list = view.state.schema.nodes[name]
      const item = view.state.schema.nodes.list_item
      if (!list || !item) return
      wrapWith([{ type: list }, { type: item }])
    }
    const wrapBlockquote = () => {
      const view = getLiveView()
      if (!view) return
      const bq = view.state.schema.nodes.blockquote
      if (!bq) return
      wrapWith([{ type: bq }])
    }
    const setCodeBlock = () => {
      const view = getLiveView()
      if (!view) return
      const cb = view.state.schema.nodes.code_block
      if (!cb) return
      setBlockTypeTo(cb, null)
    }
    const insertHr = () => {
      const view = getLiveView()
      if (!view) return
      const hr = view.state.schema.nodes.horizontal_rule
      if (!hr) return
      view.dispatch(view.state.tr.replaceSelectionWith(hr.create()))
      view.focus()
    }
    const insertLink = () => {
      const view = getLiveView()
      if (!view) return
      const state = view.state
      const { from, to, empty } = state.selection
      const text = empty ? (prompt('链接文字：') || '链接') : state.doc.textBetween(from, to, ' ')
      const url = prompt('链接 URL：', 'https://')
      if (!url) return
      const link = state.schema.marks.link
      if (!link) return
      const tr = state.tr
      if (empty) {
        tr.insertText(text, from)
        tr.addMark(from, from + text.length, link.create({ href: url }))
      } else {
        tr.addMark(from, to, link.create({ href: url }))
      }
      view.dispatch(tr)
      view.focus()
    }
    const insertImage = () => {
      const view = getLiveView()
      if (!view) return
      const url = prompt('图片 URL：', 'https://')
      if (!url) return
      const alt = prompt('图片描述（可选）：') || ''
      const img = view.state.schema.nodes.image
      if (!img) return
      view.dispatch(
        view.state.tr.replaceSelectionWith(img.create({ src: url, alt })),
      )
      view.focus()
    }
    const cmd = (type: string) => {
      switch (type) {
        case 'bold': return toggleMarkByName('strong')
        case 'italic': return toggleMarkByName('emphasis')
        case 'code': return toggleMarkByName('code')
        case 'h1': return toggleHeading(1)
        case 'h2': return toggleHeading(2)
        case 'h3': return toggleHeading(3)
        case 'ul': return wrapList('bullet_list')
        case 'ol': return wrapList('ordered_list')
        case 'quote': return wrapBlockquote()
        case 'codeblock': return setCodeBlock()
        case 'link': return insertLink()
        case 'image': return insertImage()
        case 'hr': return insertHr()
      }
    }
    const toolbarButtons = () => {
      const defs: ({ t: string; label: string; title: string } | { sep: true })[] = [
        { t: 'bold', label: 'B', title: '加粗 (Ctrl+B)' },
        { t: 'italic', label: 'I', title: '斜体 (Ctrl+I)' },
        { t: 'code', label: '</>', title: '行内代码' },
        { sep: true },
        { t: 'h1', label: 'H1', title: '标题 1' },
        { t: 'h2', label: 'H2', title: '标题 2' },
        { t: 'h3', label: 'H3', title: '标题 3' },
        { sep: true },
        { t: 'ul', label: '• 列表', title: '无序列表' },
        { t: 'ol', label: '1. 列表', title: '有序列表' },
        { t: 'quote', label: '❝ 引用', title: '引用块' },
        { t: 'codeblock', label: '</> 代码块', title: '代码块' },
        { sep: true },
        { t: 'link', label: '🔗 链接', title: '插入链接' },
        { t: 'image', label: '🖼 图片', title: '插入图片' },
        { t: 'hr', label: '― 分割线', title: '分割线' },
      ]
      return defs.map((b) =>
        'sep' in b
          ? h('span', { class: 'tb-sep' })
          : h(
              'button',
              { class: 'tb-btn', type: 'button', title: b.title, onClick: () => cmd(b.t) },
              b.label,
            ),
      )
    }

    return () => {
      const children = [
        editorView.value ? h('div', { class: 'md-toolbar' }, toolbarButtons()) : null,
        h(Milkdown),
      ].filter(Boolean) as any[]
      return h('div', { class: 'md-editor-wrap' }, children)
    }
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

<style scoped>
.md-editor-wrap {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.md-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  margin-bottom: 10px;
}
.tb-btn {
  min-width: 30px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  color: var(--fg);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}
.tb-btn:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
}
.tb-btn:active {
  background: #e2e8f0;
}
.tb-sep {
  width: 1px;
  height: 20px;
  background: var(--line);
  margin: 0 2px;
  align-self: center;
}
</style>

