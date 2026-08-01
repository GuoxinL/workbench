import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MilkdownEditor from '@/components/kb/MilkdownEditor.vue'

/**
 * 组件级验证（对齐线上真实流程）：
 * 加载含 `[[欢迎使用工作台]]` 的文档时，MilkdownEditor 在 wikilink mark 生成前
 * 若把转义的 `\[[...]]` 回吐给父组件（update:modelValue），draftContent 会被写脏，
 * 引用面板 extractRefs 匹配不到 → 误报「无出链」。
 *
 * 修复点：scanning 初始为 true，待 waitEditor 里 scanConvertWikilinks 生成 mark
 * 后再放开，屏蔽加载期那次转义回吐。本测试断言：
 *   1) 加载期间绝不回吐含 `\[[` 的转义内容（核心回归防护）；
 *   2) 编辑器就绪后（scanning 放开）触发真正编辑，回吐内容仍保留 `[[...]]` 不转义。
 */
describe('MilkdownEditor 双链序列化不转义（组件级）', () => {
  it('加载期不回吐转义内容，编辑后仍保留 [[...]]', async () => {
    const emitted: string[] = []
    const wrapper = mount(MilkdownEditor, {
      props: {
        modelValue: '给文章打标签。见 [[欢迎使用工作台]]。',
        'onUpdate:modelValue': (v: string) => emitted.push(v),
      },
      attachTo: document.body,
    })

    // 等编辑器创建 + waitEditor(100ms) + scanConvertWikilinks
    await new Promise((r) => setTimeout(r, 600))

    // 1) 加载期：扫描屏蔽了转义回吐，绝不应出现 \[[
    expect(emitted.some((m) => m.includes('\\[['))).toBe(false)

    // 2) 编辑器就绪后触发一次真实编辑（scanning 已放开），回吐应为带 mark 的
    //    干净序列化，保留 [[...]] 不转义
    const view = (window as any).__milkdownView
    expect(view).toBeTruthy()
    view.dispatch(view.state.tr.insertText('x', view.state.selection.from))
    await new Promise((r) => setTimeout(r, 150))

    expect(emitted.length).toBeGreaterThan(0)
    const last = emitted[emitted.length - 1]
    expect(last).toContain('[[欢迎使用工作台]]')
    expect(last).not.toContain('\\[[')

    wrapper.unmount()
  }, 30000)
})
