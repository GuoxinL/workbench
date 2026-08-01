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

  it('loadData 清理全部墓碑文章（防止全删后列表为空）', () => {
    const s1 = useDataStore()
    const a1 = s1.addArticle('文章一')
    const a2 = s1.addArticle('文章二')
    s1.removeArticle(a1.id)
    s1.removeArticle(a2.id)
    // localStorage 中保留 < 30 天的墓碑（persist 调用 cleanupTombstones）
    const raw = JSON.parse(localStorage.getItem('wb.data.v1') || '{}')
    const deletedCount = raw.articles.filter((x: any) => x.deleted).length
    expect(deletedCount).toBeGreaterThanOrEqual(2)

    // 模拟重载：新 store 实例应检测到「全墓碑」并清除
    setActivePinia(createPinia())
    const s2 = useDataStore()
    expect(s2.articles.filter((n) => !n.deleted).length).toBe(0)
  })

  it('loadData 墓碑 + 存活混合时不清理（保留墓碑供同步引擎）', () => {
    const s1 = useDataStore()
    s1.addArticle('存活')
    const a2 = s1.addArticle('删除')
    s1.removeArticle(a2.id) // 仅删除 a2
    // 重载
    setActivePinia(createPinia())
    const s2 = useDataStore()
    const live = s2.articles.filter((n) => !n.deleted)
    expect(live.length).toBe(1)
    expect(live[0].title).toBe('存活')
    // 墓碑仍存在（供同步引擎传播删除）
    const tombstones = s2.articles.filter((n) => n.deleted)
    expect(tombstones.length).toBe(1)
  })

  it('loadData 空文章列表不报错（退化为 emptyData）', () => {
    localStorage.setItem('wb.data.v1', JSON.stringify({ version: 1, todos: [], articles: [] }))
    setActivePinia(createPinia())
    const s = useDataStore()
    expect(s.articles.length).toBe(0)
    expect(s.todos.length).toBe(0)
  })

  it('loadData 清理全部墓碑待办', () => {
    const s1 = useDataStore()
    const t1 = s1.addTodo({ title: '待办A' })
    const t2 = s1.addTodo({ title: '待办B' })
    s1.removeTodo(t1.id)
    s1.removeTodo(t2.id)
    const raw = JSON.parse(localStorage.getItem('wb.data.v1') || '{}')
    const deletedCount = raw.todos.filter((x: any) => x.deleted).length
    expect(deletedCount).toBeGreaterThanOrEqual(2)

    setActivePinia(createPinia())
    const s2 = useDataStore()
    expect(s2.todos.filter((t) => !t.deleted).length).toBe(0)
  })

  it('loadData 待办墓碑 + 存活待办混合时不清理', () => {
    const s1 = useDataStore()
    const del = s1.addTodo({ title: '删除我' })
    s1.addTodo({ title: '保留我' })
    s1.removeTodo(del.id) // 仅删除「删除我」
    setActivePinia(createPinia())
    const s2 = useDataStore()
    const live = s2.todos.filter((t) => !t.deleted)
    expect(live.length).toBe(1)
    expect(live[0].title).toBe('保留我')
    const tombstones = s2.todos.filter((t) => t.deleted)
    expect(tombstones.length).toBe(1)
  })

  it('loadData 文章 + 待办同时全墓碑 → 两者均清除', () => {
    const s1 = useDataStore()
    const a = s1.addArticle('删除文章')
    const t = s1.addTodo({ title: '删除待办' })
    s1.removeArticle(a.id)
    s1.removeTodo(t.id)
    setActivePinia(createPinia())
    const s2 = useDataStore()
    expect(s2.articles.filter((n) => !n.deleted).length).toBe(0)
    expect(s2.todos.filter((tx) => !tx.deleted).length).toBe(0)
  })
})
