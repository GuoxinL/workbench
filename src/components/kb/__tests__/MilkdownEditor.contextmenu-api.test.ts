import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { TextSelection } from '@milkdown/prose/state'
import MilkdownEditor from '@/components/kb/MilkdownEditor.vue'

/**
 * 右键菜单「同源」验证：右键菜单的所有功能项不再自行插入原始 markdown 文本，
 * 而是复用 MilkdownEditor 通过 window.__milkdownApi 暴露的同源命令（cmd /
 * insertImageNode / insertTableNode），与上方常驻工具栏使用完全一致的逻辑。
 *
 * 本测试挂载真实 MilkdownEditor，等待同源 API 就绪后逐项调用，断言最终文档结构：
 *   - 标题 h1/h2/h3 → heading 节点（对应 level）
 *   - 无序/有序列表 → bullet_list / ordered_list 节点
 *   - 引用块 → blockquote 节点
 *   - 代码块 → code_block 节点
 *   - 分割线 → hr 节点
 *   - 链接 → 带 link 标记的文字（href 正确）
 *   - 图片 → image 节点（src 正确）
 *   - 表格 → 3 行 2 列表格，首行为表头（table_header）
 *
 * 采用「单次挂载」结构，与工具栏测试一致，规避 window 全局在多实例间泄漏。
 */
describe('MilkdownEditor 右键菜单同源命令（与工具栏一致）', () => {
  const waitForApi = async (timeoutMs = 8000) => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const api = (window as any).__milkdownApi
      if (api && typeof api.cmd === 'function') return api
      await new Promise((r) => setTimeout(r, 50))
    }
    return (window as any).__milkdownApi
  }
  // 用 schema 重建文档内容，便于逐条独立验证命令（Fragment 无 .clear() 方法）
  const resetDoc = (view: any, text: string) => {
    const schema = view.state.schema
    const para = schema.nodes.paragraph.create(null, text ? schema.text(text) : null)
    const newDoc = schema.nodes.doc.create(null, para)
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, newDoc.content))
  }
  const setCursor = (view: any, pos: number) =>
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
  const hasNode = (view: any, name: string) => {
    let found = false
    view.state.doc.descendants((n: any) => {
      if (n.type.name === name) found = true
    })
    return found
  }

  it('右键菜单所有项通过同源命令生成正确节点/标记', async () => {
    // 链接命令内部用 prompt 收集文字与 URL，jsdom 下默认返回 null，需桩化
    const origPrompt = window.prompt
    window.prompt = ((msg: string) =>
      msg.includes('URL') ? 'https://example.com' : '链接文字') as any

    const wrapper = mount(MilkdownEditor, {
      props: { modelValue: '测试内容。' },
      attachTo: document.body,
    })
    const api = await waitForApi()
    expect(api).toBeTruthy()
    const view = (window as any).__milkdownView
    expect(view).toBeTruthy()

    // 1) 标题 h1 / h2 / h3
    for (const [key, level] of [['h1', 1], ['h2', 2], ['h3', 3]] as const) {
      resetDoc(view, '标题文本。')
      setCursor(view, 1)
      api.cmd(key)
      await new Promise((r) => setTimeout(r, 30))
      const first = view.state.doc.firstChild
      expect(first.type.name).toBe('heading')
      expect(first.attrs.level).toBe(level)
    }

    // 2) 无序列表
    resetDoc(view, '列表项。')
    setCursor(view, 1)
    api.cmd('ul')
    await new Promise((r) => setTimeout(r, 30))
    expect(hasNode(view, 'bullet_list')).toBe(true)

    // 3) 有序列表
    resetDoc(view, '列表项。')
    setCursor(view, 1)
    api.cmd('ol')
    await new Promise((r) => setTimeout(r, 30))
    expect(hasNode(view, 'ordered_list')).toBe(true)

    // 4) 引用块
    resetDoc(view, '引用内容。')
    setCursor(view, 1)
    api.cmd('quote')
    await new Promise((r) => setTimeout(r, 30))
    expect(hasNode(view, 'blockquote')).toBe(true)

    // 5) 代码块
    resetDoc(view, '代码内容。')
    setCursor(view, 1)
    api.cmd('codeblock')
    await new Promise((r) => setTimeout(r, 30))
    expect(hasNode(view, 'code_block')).toBe(true)

    // 6) 分割线
    resetDoc(view, '一段文字。')
    setCursor(view, 1 + '一段文字。'.length)
    api.cmd('hr')
    await new Promise((r) => setTimeout(r, 30))
    expect(hasNode(view, 'hr')).toBe(true)

    // 7) 链接：空选区下应插入带 link 标记的文字，href 正确
    resetDoc(view, '链接测试。')
    setCursor(view, 1)
    api.cmd('link')
    await new Promise((r) => setTimeout(r, 30))
    let linkHref: string | null = null
    view.state.doc.descendants((n: any) => {
      if (n.isText && n.marks.some((m: any) => m.type.name === 'link')) {
        const lm = n.marks.find((m: any) => m.type.name === 'link')
        linkHref = lm.attrs.href
      }
    })
    expect(linkHref).toBe('https://example.com')

    // 8) 图片：通过 insertImageNode 插入 image 节点（src 正确）
    resetDoc(view, '图片前后。')
    setCursor(view, 1)
    api.insertImageNode('data:image/png;base64,AAA')
    await new Promise((r) => setTimeout(r, 30))
    let imgSrc: string | null = null
    view.state.doc.descendants((n: any) => {
      if (n.type.name === 'image') imgSrc = n.attrs.src
    })
    expect(imgSrc).toBe('data:image/png;base64,AAA')

    // 9) 表格：3 行 2 列，首行为表头（table_header）
    resetDoc(view, '表格前后。')
    setCursor(view, 1)
    api.insertTableNode(3, 2)
    await new Promise((r) => setTimeout(r, 30))
    let rows = 0
    let cells = 0
    let headerCells = 0
    view.state.doc.descendants((n: any) => {
      if (n.type.name === 'table_row') rows++
      if (n.type.name === 'table_cell') cells++
      if (n.type.name === 'table_header') headerCells++
    })
    expect(rows).toBe(3)
    expect(cells + headerCells).toBe(6) // 3 行 × 2 列
    expect(headerCells).toBe(2) // 首行 2 个表头

    window.prompt = origPrompt
    wrapper.unmount()
  }, 30000)

  afterEach(() => {
    delete (window as any).__milkdownApi
    delete (window as any).__milkdownView
  })
})
