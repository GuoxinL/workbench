import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { TextSelection } from '@milkdown/prose/state'
import MilkdownEditor from '@/components/kb/MilkdownEditor.vue'

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

    wrapper.unmount()
  }, 30000)
})
