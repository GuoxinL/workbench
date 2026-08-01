import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MilkdownEditor from '@/components/kb/MilkdownEditor.vue'

/**
 * 回归防护：MilkdownEditor 编辑器就绪后必须
 *   1) 渲染 .ProseMirror（toolbar(ed) 等同处 waitEditor 的 fn，能跑到这里说明
 *      crepe 工具栏等特性已应用，修复「工具栏消失」）；
 *   2) 暴露 window.__milkdownView（右键菜单 insertAtCursor 依赖，修复「右键插入失效」）；
 *   3) 经该视图句柄插入文本可生效（模拟右键插入）。
 * 此前 waitEditor 仅 100ms 单次检查、未就绪即放弃，导致以上全部不执行。
 */
describe('MilkdownEditor 工具栏与右键插入可用性', () => {
  it('编辑器就绪后渲染正文、暴露视图句柄且插入可生效', async () => {
    const wrapper = mount(MilkdownEditor, {
      props: { modelValue: '正文内容。' },
      attachTo: document.body,
    })
    // 等待 waitEditor 轮询就绪（上限约 6s，测试内给足余量）
    await new Promise((r) => setTimeout(r, 800))

    // 编辑器已渲染，意味着工具栏等 crepe 特性已应用
    expect(document.querySelector('.ProseMirror')).toBeTruthy()

    // 右键插入所依赖的视图句柄已暴露
    const view = (window as any).__milkdownView
    expect(view).toBeTruthy()

    // 模拟右键「插入文本」：在光标处插入，验证插入能力可用
    const beforeLen = view.state.doc.textContent.length
    view.dispatch(view.state.tr.insertText('[插入]', view.state.selection.from))
    await new Promise((r) => setTimeout(r, 50))
    const afterText = view.state.doc.textContent
    expect(afterText).toContain('[插入]')
    expect(afterText.length).toBeGreaterThan(beforeLen)

    wrapper.unmount()
  }, 30000)
})
