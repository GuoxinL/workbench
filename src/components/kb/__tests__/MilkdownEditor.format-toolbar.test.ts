import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { TextSelection } from '@milkdown/prose/state'
import MilkdownEditor from '@/components/kb/MilkdownEditor.vue'

// 链接/图片命令改走弹窗（openPrompt），mock 之
vi.mock('@/composables/useDialog', () => ({
  openPrompt: vi.fn(() => Promise.resolve('https://ex.com/x.png')),
  openTableDialog: vi.fn(() => Promise.resolve({ rows: 3, cols: 3 })),
  openConfirm: vi.fn(() => Promise.resolve(true)),
  useDialog: () => ({ current: { value: null } }),
}))

/**
 * 常驻格式工具栏命令验证：挂载真实 MilkdownEditor（单次挂载），等待工具栏就绪后，
 * 通过点击工具栏按钮触发 ProseMirror 原生命令，断言文档结构按预期变化。
 * 覆盖：加粗(toggleMark)、H1(setBlockType heading)、无序列表(wrapInList)。
 *
 * 采用「单次挂载 + 命令间重置文档」的结构：全局 window.__milkdownView 在多实例间
 * 存在泄漏风险，分开多个 it 连续挂载会导致就绪判定被污染；单次挂载可规避，且更贴近
 * 单页单编辑器（或每篇文章一个编辑器）的真实场景。
 */
describe('MilkdownEditor 常驻格式工具栏命令', () => {
  const waitForToolbar = async (timeoutMs = 8000) => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const tb = document.querySelector('.md-toolbar')
      if (tb) return tb as Element
      await new Promise((r) => setTimeout(r, 50))
    }
    return document.querySelector('.md-toolbar') as Element | null
  }
  const findBtn = (toolbar: Element, kw: string) =>
    [...toolbar.querySelectorAll('button')].find(
      (b) => (b.getAttribute('title') || '').includes(kw),
    )!
  // 重置编辑器内容为给定文本，便于逐条独立验证命令。
  // 用 schema 重建一个 doc 节点再 replaceWith（Fragment 无 .clear() 方法）。
  const resetDoc = (view: any, text: string) => {
    const schema = view.state.schema
    const para = schema.nodes.paragraph.create(null, text ? schema.text(text) : null)
    const newDoc = schema.nodes.doc.create(null, para)
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, newDoc.content))
  }

  it('工具栏命令生效：加粗 / H1 / 无序列表分别正确改写文档结构', async () => {
    const wrapper = mount(MilkdownEditor, {
      props: { modelValue: '你好世界，这是一段测试文本。' },
      attachTo: document.body,
    })
    const toolbar = await waitForToolbar()
    expect(toolbar).toBeTruthy()
    const view = (window as any).__milkdownView
    expect(view).toBeTruthy()

    // 图标完整性：13 个工具栏按钮全部含 svg 图标（加粗/斜体/行内代码/标题用内联
    // SVG，其余用 Element Plus 图标），不再存在「纯文字无图标」的按钮。
    const btns = [...(toolbar as Element).querySelectorAll('button')]
    expect(btns.length).toBe(12)
    expect(btns.every((b) => b.querySelector('svg'))).toBe(true)
    // 进一步校验自定义内联 SVG 图标确实渲染出内部元素（非空 svg）：
    // 加粗/斜体/行内代码为 <path>，标题为含 'H1/H2/H3' 文本的 <text>。
    const byTitle = (kw: string) =>
      btns.find((b) => (b.getAttribute('title') || '').includes(kw))!
    expect(byTitle('加粗').querySelector('svg path')).toBeTruthy()
    expect(byTitle('斜体').querySelector('svg line')).toBeTruthy()
    expect(byTitle('行内代码').querySelector('svg polyline')).toBeTruthy()
    const h1text = byTitle('标题 1').querySelector('svg text')?.textContent || ''
    expect(h1text).toContain('H1')
    const h2text = byTitle('标题 2').querySelector('svg text')?.textContent || ''
    expect(h2text).toContain('H2')
    const h3text = byTitle('标题 3').querySelector('svg text')?.textContent || ''
    expect(h3text).toContain('H3')
    // 有序列表改用自定义编号列表 SVG（原 EP Sort 上下箭头与操作不符），确认含 '1' 文本
    const olText = byTitle('有序列表').querySelector('svg text')?.textContent || ''
    expect(olText).toContain('1')
    // 代码块改用自定义代码窗口 SVG（原 EP Document 与代码语义不符），确认含 rect + path
    expect(byTitle('代码块').querySelector('svg rect')).toBeTruthy()

    // 1) 加粗：选中首段全部文本后点击「加粗」
    resetDoc(view, '你好世界，这是一段测试文本。')
    const doc = view.state.doc
    let from = 1
    let to = 1
    doc.descendants((n: any, pos: number) => {
      if (n.isText && from === 1) {
        from = pos
        to = pos + n.text.length
      }
    })
    view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, from, to)))
    findBtn(toolbar!, '加粗').click()
    await new Promise((r) => setTimeout(r, 50))
    expect(view.state.doc.rangeHasMark(from, to, view.state.schema.marks.strong)).toBe(true)

    // 2) H1：点击「标题 1」把当前段落变为 heading level1
    resetDoc(view, '一个段落。')
    await new Promise((r) => setTimeout(r, 30))
    findBtn(toolbar!, '标题 1').click()
    await new Promise((r) => setTimeout(r, 50))
    const first = view.state.doc.firstChild
    expect(first.type.name).toBe('heading')
    expect(first.attrs.level).toBe(1)

    // 3) 无序列表：点击「无序列表」生成 bullet_list
    resetDoc(view, '列表项内容。')
    await new Promise((r) => setTimeout(r, 30))
    findBtn(toolbar!, '无序列表').click()
    await new Promise((r) => setTimeout(r, 50))
    let hasBullet = false
    view.state.doc.descendants((n: any) => {
      if (n.type.name === 'bullet_list') hasBullet = true
    })
    expect(hasBullet).toBe(true)

    // 4) 斜体：点击「斜体」对选中文本加 emphasis 标记
    resetDoc(view, '另一段测试文本。')
    await new Promise((r) => setTimeout(r, 30))
    {
      const d = view.state.doc
      let f = 1
      let t = 1
      d.descendants((n: any, pos: number) => {
        if (n.isText && f === 1) {
          f = pos
          t = pos + n.text.length
        }
      })
      view.dispatch(view.state.tr.setSelection(TextSelection.create(d, f, t)))
      findBtn(toolbar!, '斜体').click()
      await new Promise((r) => setTimeout(r, 50))
      expect(view.state.doc.rangeHasMark(f, t, view.state.schema.marks.emphasis)).toBe(true)
    }

    // 5) 行内代码：点击「行内代码」对选中文本加 inlineCode 标记
    resetDoc(view, '代码片段 inline。')
    await new Promise((r) => setTimeout(r, 30))
    {
      const d = view.state.doc
      let f = 1
      let t = 1
      d.descendants((n: any, pos: number) => {
        if (n.isText && f === 1) {
          f = pos
          t = pos + n.text.length
        }
      })
      view.dispatch(view.state.tr.setSelection(TextSelection.create(d, f, t)))
      findBtn(toolbar!, '行内代码').click()
      await new Promise((r) => setTimeout(r, 50))
      expect(view.state.doc.rangeHasMark(f, t, view.state.schema.marks.inlineCode)).toBe(true)
    }

    // 6) 分割线：点击「分割线」在文档中插入 hr 节点
    resetDoc(view, '一段文字。')
    await new Promise((r) => setTimeout(r, 30))
    {
      const len = view.state.doc.firstChild.textContent.length
      const pos = 1 + len // 段落末尾光标
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
      findBtn(toolbar!, '分割线').click()
      await new Promise((r) => setTimeout(r, 50))
      let hasHr = false
      view.state.doc.descendants((n: any) => {
        if (n.type.name === 'hr') hasHr = true
      })
      expect(hasHr).toBe(true)
    }

    const setCursor = (pos: number) =>
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
    const hasNode = (name: string) => {
      let f = false
      view.state.doc.descendants((n: any) => {
        if (n.type.name === name) f = true
      })
      return f
    }

    // 7) H2 / H3：点击「标题 2 / 3」生成对应层级 heading
    for (const [kw, level] of [['标题 2', 2], ['标题 3', 3]] as const) {
      resetDoc(view, '标题段落。')
      await new Promise((r) => setTimeout(r, 30))
      findBtn(toolbar!, kw).click()
      await new Promise((r) => setTimeout(r, 50))
      const h = view.state.doc.firstChild
      expect(h.type.name).toBe('heading')
      expect(h.attrs.level).toBe(level)
    }

    // 8) 有序列表：点击「有序列表」生成 ordered_list
    resetDoc(view, '有序列表项。')
    await new Promise((r) => setTimeout(r, 30))
    findBtn(toolbar!, '有序列表').click()
    await new Promise((r) => setTimeout(r, 50))
    expect(hasNode('ordered_list')).toBe(true)

    // 9) 代码块：点击「代码块」生成 code_block
    resetDoc(view, '代码内容。')
    await new Promise((r) => setTimeout(r, 30))
    findBtn(toolbar!, '代码块').click()
    await new Promise((r) => setTimeout(r, 50))
    expect(hasNode('code_block')).toBe(true)

    // 10) 链接：点击「插入链接」在光标处插入带 link 标记的文字
    resetDoc(view, '链接测试。')
    setCursor(1)
    await new Promise((r) => setTimeout(r, 30))
    findBtn(toolbar!, '插入链接').click()
    await new Promise((r) => setTimeout(r, 50))
    let linkHref: string | null = null
    view.state.doc.descendants((n: any) => {
      if (n.isText && n.marks.some((m: any) => m.type.name === 'link')) {
        linkHref = n.marks.find((m: any) => m.type.name === 'link').attrs.href
      }
    })
    expect(linkHref).toBe('https://ex.com/x.png')

    // 11) 图片：点击「插入图片」在光标处插入 image 节点
    resetDoc(view, '图片测试。')
    setCursor(1)
    await new Promise((r) => setTimeout(r, 30))
    findBtn(toolbar!, '插入图片').click()
    await new Promise((r) => setTimeout(r, 50))
    let imgSrc: string | null = null
    view.state.doc.descendants((n: any) => {
      if (n.type.name === 'image') imgSrc = n.attrs.src
    })
    expect(imgSrc).toBe('https://ex.com/x.png')

    wrapper.unmount()
  }, 30000)
})
