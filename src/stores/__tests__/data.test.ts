import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// 屏蔽同步引擎副作用（定时器 / 网络），聚焦数据层行为
vi.mock('@/services/sync/engine', () => ({
  createSyncEngine: () => ({ schedulePush() {}, sync() {}, startPolling() {}, stopPolling() {} }),
}))

import { useDataStore } from '@/stores/data'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('wb.seeded', '1') // 关闭播种副作用，避免污染其它用例
  setActivePinia(createPinia())
})

describe('data store —— 待办 / 知识库文章', () => {
  it('addTodo 默认蓝色分类（T2）', () => {
    const s = useDataStore()
    const t = s.addTodo({ title: '买菜' })
    expect(t.color).toBe('blue')
    expect(s.todos[0].title).toBe('买菜')
  })

  it('removeTodo 软删除墓碑（T13）', () => {
    const s = useDataStore()
    const t = s.addTodo({ title: 'x' })
    s.removeTodo(t.id)
    expect(s.todos.find((x) => x.id === t.id)?.deleted).toBe(true)
  })

  it('updateTodo 切换完成态（T8）', () => {
    const s = useDataStore()
    const t = s.addTodo({ title: 'x' })
    s.updateTodo(t.id, { status: 'done' })
    expect(s.todos.find((x) => x.id === t.id)?.status).toBe('done')
  })

  it('todoToArticle 生成文章并双向关联（X7）', () => {
    const s = useDataStore()
    const t = s.addTodo({ title: '任务', desc: '细节' })
    const a = s.todoToArticle(t.id)!
    expect(a.fromTodo).toBe(t.id)
    expect(a.content).toContain('## 记录')
    expect(s.todoById(t.id)?.articleId).toBe(a.id)
  })

  it('addArticle 同名自动去重（N3）', () => {
    const s = useDataStore()
    s.addArticle('文章')
    const b = s.addArticle('文章')
    expect(b.title).toBe('文章 2')
  })

  it('removeArticle 解除待办关联（N9）', () => {
    const s = useDataStore()
    const t = s.addTodo({ title: 't' })
    const a = s.todoToArticle(t.id)!
    s.removeArticle(a.id)
    expect(s.todoById(t.id)?.articleId).toBe('')
  })

  it('updateArticle 改名联动改引用（L11）', () => {
    const s = useDataStore()
    const a1 = s.addArticle('Alpha')
    const a2 = s.addArticle('Beta')
    s.updateArticle(a2.id, { content: 'see [[Alpha]]' })
    s.updateArticle(a1.id, { title: 'Gamma' })
    const a2after = s.articleById(a2.id)!
    expect(a2after.content).toContain('[[Gamma]]')
    expect(a2after.content).not.toContain('[[Alpha]]')
  })

  it('seedIfEmpty 首次播种 3 文章 + 4 待办（X3）', () => {
    localStorage.clear()
    localStorage.removeItem('wb.seeded')
    setActivePinia(createPinia())
    const s = useDataStore()
    const arts = s.articles.filter((n) => !n.deleted)
    const todos = s.todos.filter((n) => !n.deleted)
    expect(arts.length).toBe(3)
    expect(todos.length).toBe(4)
    expect(arts.some((n) => n.title === '双链说明' && n.content.includes('[[欢迎使用工作台]]'))).toBe(true)
  })
})
