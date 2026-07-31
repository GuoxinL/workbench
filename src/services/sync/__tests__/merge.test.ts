import { describe, it, expect } from 'vitest'
import type { WorkbenchData } from '@/types'
import { mergeInto } from '@/services/sync/merge'

function data(todos: WorkbenchData['todos'], articles: WorkbenchData['articles']): WorkbenchData {
  return { version: 1, todos, articles, updatedAt: 0 }
}
function todo(id: string, updatedAt: number, deleted = false) {
  return {
    id,
    title: id,
    desc: '',
    color: 'blue' as const,
    status: 'todo' as const,
    due: '',
    noteId: '',
    createdAt: 1,
    updatedAt,
    deleted,
  }
}
function note(id: string, updatedAt: number, deleted = false) {
  return { id, title: id, content: '', fromTodo: '', tags: [], createdAt: 1, updatedAt, deleted }
}

describe('mergeInto', () => {
  it('远端有本地无 -> 插入', () => {
    const local = data([todo('a', 1)], [])
    const remote = data([todo('a', 1), todo('b', 2)], [])
    const r = mergeInto(local, remote)
    expect(r.todos.map((t) => t.id).sort()).toEqual(['a', 'b'])
    expect(r.merged).toBe(true)
  })

  it('两端都有 -> updatedAt 大者胜', () => {
    const local = data([todo('a', 5)], [])
    const remote = data([{ ...todo('a', 9), title: 'remote-wins' }], [])
    const r = mergeInto(local, remote)
    expect(r.todos[0].title).toBe('remote-wins')
    expect(r.merged).toBe(true)
  })

  it('本地更新更新则保留本地', () => {
    const local = data([todo('a', 9)], [])
    const remote = data([{ ...todo('a', 3), title: 'remote' }], [])
    const r = mergeInto(local, remote)
    expect(r.todos[0].title).toBe('a')
    expect(r.merged).toBe(false)
  })

  it('相等 updatedAt 保留本地', () => {
    const local = data([todo('a', 5)], [])
    const remote = data([{ ...todo('a', 5), title: 'remote' }], [])
    const r = mergeInto(local, remote)
    expect(r.todos[0].title).toBe('a')
    expect(r.merged).toBe(false)
  })

  it('墓碑（deleted）参与合并并传播', () => {
    const local = data([todo('a', 1)], [])
    const remote = data([todo('a', 5, true)], [])
    const r = mergeInto(local, remote)
    expect(r.todos[0].deleted).toBe(true)
    expect(r.merged).toBe(true)
  })

  it('合并后按 createdAt 倒序', () => {
    const local = data([todo('old', 1)], [])
    const remote = data([{ ...todo('new', 2), createdAt: 2 }], [])
    const r = mergeInto(local, remote)
    expect(r.todos.map((t) => t.id)).toEqual(['new', 'old'])
  })

  it('todos 与 notes 分别合并', () => {
    const local = data([todo('a', 1)], [note('x', 1)])
    const remote = data([todo('a', 1)], [note('y', 2)])
    const r = mergeInto(local, remote)
    expect(r.todos.map((t) => t.id)).toEqual(['a'])
    expect(r.articles.map((n) => n.id).sort()).toEqual(['x', 'y'])
  })
})
