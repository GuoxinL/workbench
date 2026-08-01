import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import LinksPanel from '@/components/kb/LinksPanel.vue'

vi.mock('@/services/sync/engine', () => ({
  createSyncEngine: () => ({ schedulePush() {}, sync() {}, startPolling() {}, stopPolling() {} }),
}))

import { useDataStore } from '@/stores/data'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('wb.seeded', '1')
  setActivePinia(createPinia())
})

describe('LinksPanel 数据产出', () => {
  it('有出链与入链时渲染对应条目', () => {
    const s = useDataStore()
    const a = s.addArticle('Alpha')
    s.updateArticle(a.id, { content: '[[Beta]]' })
    const b = s.addArticle('Beta')

    const wrapper = mount(LinksPanel, {
      props: { article: s.articleById(a.id)! },
    })

    // 出链：Alpha 引用了 Beta
    expect(wrapper.text()).toContain('Beta')
    // 入链：Beta 被 Alpha 引用
    const betaWrapper = mount(LinksPanel, {
      props: { article: s.articleById(b.id)! },
    })
    expect(betaWrapper.text()).toContain('Alpha')
  })

  it('传入 content prop 时（实时草稿）即使 article.content 为空也能显示出链', () => {
    const s = useDataStore()
    const a = s.addArticle('Alpha') // article.content 默认空

    // 模拟编辑器已输入 [[Beta]] 但尚未落盘到 store
    const wrapper = mount(LinksPanel, {
      props: { article: s.articleById(a.id)!, content: '[[Beta]]' },
    })

    expect(wrapper.text()).toContain('Beta')
  })
})
