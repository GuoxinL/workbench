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
// 项目用 unplugin 自动按需导入 Element Plus 组件（仅作用于模板标签），
// 运行时 h() 调用需显式导入组件，故在此直接 import ElButton / ElIcon。
import { ElButton, ElIcon } from 'element-plus'
// 图标取自 Element Plus 官方图标库（element-plus 的配套依赖，随装随有）。
// 无序列表/链接/图片/分割线用 EP 现成图标；加粗/斜体/行内代码/标题/有序列表/
// 代码块在 EP 中无合适图标或原 EP 图标与操作不符（ol 原 Sort、codeblock 原 Document），
// 一律用同风格内联 SVG 绘制，保证工具栏视觉统一且图标与操作语义一致。
import { List, Link, Picture, Minus } from '@element-plus/icons-vue'
import { runCommand, insertImage, insertTable, insertLinkMark, insertWikilink, type CmdType } from './editorCommands'
import LinkDialog from './LinkDialog.vue'

// ── 工具栏内联 SVG 图标（与 EP 图标同风格：1em、stroke currentColor）──
const SVG_PROPS = {
  viewBox: '0 0 24 24',
  width: '1em',
  height: '1em',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 2,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
} as const

const BoldIcon = defineComponent({
  name: 'BoldIcon',
  render: () =>
    h('svg', SVG_PROPS, [
      h('path', { d: 'M7 5h6a3.5 3.5 0 0 1 0 7H7z' }),
      h('path', { d: 'M7 12h7a3.5 3.5 0 0 1 0 7H7z' }),
    ]),
})
const ItalicIcon = defineComponent({
  name: 'ItalicIcon',
  render: () =>
    h('svg', SVG_PROPS, [
      h('line', { x1: 19, y1: 4, x2: 10, y2: 4 }),
      h('line', { x1: 14, y1: 20, x2: 5, y2: 20 }),
      h('line', { x1: 15, y1: 4, x2: 9, y2: 20 }),
    ]),
})
const CodeIcon = defineComponent({
  name: 'CodeIcon',
  render: () =>
    h('svg', SVG_PROPS, [
      h('polyline', { points: '16 18 22 12 16 6' }),
      h('polyline', { points: '8 6 2 12 8 18' }),
    ]),
})
const makeHIcon = (n: number) =>
  defineComponent({
    name: `H${n}Icon`,
    render: () =>
      h('svg', SVG_PROPS, [
        h(
          'text',
          {
            x: 2,
            y: 16,
            'font-size': 12,
            'font-weight': 700,
            'font-family': 'sans-serif',
            stroke: 'none',
            fill: 'currentColor',
          },
          `H${n}`,
        ),
      ]),
  })
const H1Icon = makeHIcon(1)
const H2Icon = makeHIcon(2)
const H3Icon = makeHIcon(3)
// 有序列表：三条横线各带序号 1/2/3（EP 无编号列表图标，原 Sort 上下箭头与操作不符）
const OrderedListIcon = defineComponent({
  name: 'OrderedListIcon',
  render: () =>
    h('svg', SVG_PROPS, [
      h('text', { x: 1.5, y: 8, 'font-size': 7, 'font-weight': 700, 'font-family': 'sans-serif', stroke: 'none', fill: 'currentColor' }, '1'),
      h('line', { x1: 8, y1: 6, x2: 21, y2: 6 }),
      h('text', { x: 1.5, y: 15, 'font-size': 7, 'font-weight': 700, 'font-family': 'sans-serif', stroke: 'none', fill: 'currentColor' }, '2'),
      h('line', { x1: 8, y1: 13, x2: 21, y2: 13 }),
      h('text', { x: 1.5, y: 22, 'font-size': 7, 'font-weight': 700, 'font-family': 'sans-serif', stroke: 'none', fill: 'currentColor' }, '3'),
      h('line', { x1: 8, y1: 20, x2: 21, y2: 20 }),
    ]),
})
// 代码块：带边框的代码窗口 + </> 尖括号（原 Document 图标与"代码"语义不符）
const CodeBlockIcon = defineComponent({
  name: 'CodeBlockIcon',
  render: () =>
    h('svg', SVG_PROPS, [
      h('rect', { x: 2, y: 4, width: 20, height: 16, rx: 2 }),
      h('path', { d: 'M10 10l-3 2 3 2' }),
      h('path', { d: 'M14 10l3 2-3 2' }),
    ]),
})

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
    // 编辑器视图实例：仅用于就绪门控（工具栏渲染条件）与暴露给测试。
    // 命令派发不再依赖缓存视图——统一走 editorCommands 里的 ed.action(commandsCtx)。
    const editorView = ref<EditorView | null>(null)

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
        // 暴露同源命令 API 给右键菜单：右键菜单与工具栏复用 editorCommands 里的
        // 同一组官方 commandsCtx 调用（cmd / insertImageNode / insertTableNode）。
        ;(window as any).__milkdownApi = {
          cmd,
          insertImageNode: (src: string, alt = '') => {
            const ed = getEditor()
            if (ed) insertImage(ed, src, alt)
          },
          insertTableNode: (rows: number, cols: number) => {
            const ed = getEditor()
            if (ed) insertTable(ed, rows, cols)
          },
          insertLinkMark: (href: string, text?: string) => {
            const ed = getEditor()
            if (ed) insertLinkMark(ed, href, text)
          },
          insertWikilink: (title: string) => {
            const ed = getEditor()
            if (ed) insertWikilink(ed, title)
          },
        }
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
    // 命令实现见 editorCommands.ts：统一走 milkdown 官方 commandsCtx 管道
    // （正确集成 keymap / 输入规则 / 历史栈），工具栏按钮与右键菜单复用同一份
    // runCommand / insertImage / insertTable，不再手写 ProseMirror transaction。
    const cmd = (type: string) => {
      const ed = getEditor()
      if (!ed) return
      if (type === 'link') {
        linkOpen.value = true // 链接由 LinkDialog 统一处理（双链/锚点/外部）
        return
      }
      runCommand(ed, type as CmdType)
    }
    const linkOpen = ref(false)
    const toolbarButtons = () => {
      type BtnDef =
        | { t: string; title: string; icon: any }
        | { sep: true }
      const defs: BtnDef[] = [
        { t: 'bold', title: '加粗 (Ctrl+B)', icon: BoldIcon },
        { t: 'italic', title: '斜体 (Ctrl+I)', icon: ItalicIcon },
        { sep: true },
        { t: 'h1', title: '标题 1', icon: H1Icon },
        { t: 'h2', title: '标题 2', icon: H2Icon },
        { t: 'h3', title: '标题 3', icon: H3Icon },
        { sep: true },
        { t: 'ul', title: '无序列表', icon: List },
        { t: 'ol', title: '有序列表', icon: OrderedListIcon },
        { sep: true },
        { t: 'code', title: '行内代码', icon: CodeIcon },
        { t: 'codeblock', title: '代码块', icon: CodeBlockIcon },
        { sep: true },
        { t: 'link', title: '插入链接', icon: Link },
        { t: 'image', title: '插入图片', icon: Picture },
        { t: 'hr', title: '分割线', icon: Minus },
      ]
      return defs.map((b) => {
        if ('sep' in b) return h('span', { class: 'tb-sep' })
        // mousedown 阻止默认行为，避免按钮抢走编辑器焦点导致选区丢失（ProseMirror 工具栏经典做法）
        return h(
          ElButton,
          {
            class: 'tb-btn',
            size: 'small',
            title: b.title,
            onMousedown: (e: any) => e.preventDefault(),
            onClick: () => cmd(b.t),
          } as any,
          () => h(ElIcon, {}, () => h(b.icon)),
        )
      })
    }

    return () => {
      const children = [
        editorView.value ? h('div', { class: 'md-toolbar' }, toolbarButtons()) : null,
        h(Milkdown),
        linkOpen.value
          ? h(LinkDialog, {
              editor: getEditor(),
              onClose: () => (linkOpen.value = false),
            })
          : null,
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

<style>
/* 非 scoped：本组件用渲染函数（无 <template>），scoped 的 data-v 不会加到 h() 元素上，
   故用非 scoped 让 .md-toolbar / .md-editor-wrap / .tb-sep 等类名生效。类名专一，低风险。 */
.md-editor-wrap {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.md-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--card-bg);
  margin-bottom: 10px;
  box-shadow: var(--shadow-sm);
  /* 滚动时浮动吸附到编辑区最顶端（top:-16px 抵消 .editor-scroll 的 padding-top） */
  position: sticky;
  top: -16px;
  z-index: 20;
}
/* 复用 Element Plus 按钮外观，仅做间距统一（去掉相邻按钮的默认外边距） */
.md-toolbar :deep(.el-button) {
  margin: 0;
}
.md-toolbar :deep(.el-button .el-icon),
.md-toolbar :deep(.el-button svg) {
  vertical-align: middle;
}
.tb-sep {
  width: 1px;
  height: 20px;
  background: var(--line);
  margin: 0 2px;
  align-self: center;
}
</style>

