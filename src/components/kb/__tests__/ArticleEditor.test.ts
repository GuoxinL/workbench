import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ArticleEditor from '@/components/kb/ArticleEditor.vue'

vi.mock('@/services/sync/engine', () => ({
  createSyncEngine: () => ({ schedulePush() {}, sync() {}, startPolling() {}, stopPolling() {} }),
}))

import { useDataStore } from '@/stores/data'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('wb.seeded', '1')
  setActivePinia(createPinia())
})

describe('ArticleEditor 双链点击→弹窗确认→跳转', () => {
  it('点击 wikilink 弹出小窗，点「打开文章」才跳转，且 preventDefault 阻止跳 /todos', async () => {
    const s = useDataStore()
    const a = s.addArticle('欢迎使用工作台')
    const b = s.addArticle('双链说明')

    const wrapper = mount(ArticleEditor, {
      props: { article: s.articleById(a.id)! },
      global: {
        stubs: {
          MilkdownEditor: { template: '<div class="milkdown"></div>' },
          ElButton: { template: '<button><slot /></button>' },
          ElSwitch: { template: '<span class="el-switch"></span>' },
          ElTooltip: { template: '<span><slot /></span>' },
        },
      },
      attachTo: document.body,
    })

    // 模拟 Milkdown 正文里渲染出的 wikilink（<a href="#">）
    const scroll = wrapper.find('.editor-scroll').element as HTMLElement
    const link = document.createElement('a')
    link.className = 'wikilink'
    link.setAttribute('data-slug', '双链说明')
    link.setAttribute('data-title', '双链说明')
    link.setAttribute('href', '#')
    scroll.appendChild(link)

    const spy = vi.spyOn(MouseEvent.prototype, 'preventDefault')
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }))
    await nextTick()

    // 核心：阻止 <a href="#"> 默认导航
    expect(spy).toHaveBeenCalled()
    // 点击后弹窗出现，尚未跳转
    const popBtn = document.querySelector('.link-pop .action') as HTMLButtonElement
    expect(popBtn).toBeTruthy()
    expect(wrapper.emitted('open')).toBeFalsy()
    // 点「打开文章」→ 跳转
    popBtn.click()
    await nextTick()
    expect(wrapper.emitted('open')).toBeTruthy()
    expect(wrapper.emitted('open')![0]).toEqual([b.id])

    spy.mockRestore()
    wrapper.unmount()
  })
})

describe('ArticleEditor 编辑态标识', () => {
  it('聚焦编辑区时加 .editing 类，离开时移除', async () => {
    const s = useDataStore()
    const a = s.addArticle('编辑态测试')

    const wrapper = mount(ArticleEditor, {
      props: { article: s.articleById(a.id)! },
      global: {
        stubs: {
          MilkdownEditor: { template: '<div class="milkdown"><div class="ProseMirror" tabindex="0"></div></div>' },
          ElButton: { template: '<button><slot /></button>' },
          ElSwitch: { template: '<span class="el-switch"></span>' },
          ElTooltip: { template: '<span><slot /></span>' },
        },
      },
      attachTo: document.body,
    })

    const scroll = wrapper.find('.editor-scroll').element as HTMLElement
    // 聚焦：dispatch focusin（bubbles）→ editing=true
    scroll.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await nextTick()
    expect(scroll.classList.contains('editing')).toBe(true)

    // 离开：focusout，relatedTarget 指向编辑区外 → editing=false
    scroll.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }),
    )
    await nextTick()
    expect(scroll.classList.contains('editing')).toBe(false)

    wrapper.unmount()
  })
})
