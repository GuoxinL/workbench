import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { createIndexedDBDataLayer } from './indexeddb'
import type { Article, Todo } from '@/types'

function mkTodo(id: string, updatedAt: number, deleted = false): Todo {
  return {
    id,
    title: `todo-${id}`,
    desc: '',
    color: 'blue',
    status: 'todo',
    due: '',
    time: updatedAt,
    articleId: '',
    createdAt: updatedAt,
    updatedAt,
    deleted,
  }
}

function mkArticle(id: string, updatedAt: number, deleted = false): Article {
  return {
    id,
    title: `article-${id}`,
    content: '',
    fromTodo: '',
    tags: [],
    createdAt: updatedAt,
    updatedAt,
    deleted,
  }
}

describe('IndexedDB DataLayer（P0：单实体存储 + 分页索引）', () => {
  let db = createIndexedDBDataLayer()

  beforeEach(async () => {
    await db.clear()
    db = createIndexedDBDataLayer()
  })

  it('saveTodo 后可 getTodo 取回（含运行时校验）', async () => {
    await db.saveTodo(mkTodo('t1', 100))
    const got = await db.getTodo('t1')
    expect(got?.id).toBe('t1')
    expect(got?.title).toBe('todo-t1')
    expect(await db.getTodo('nope')).toBeNull()
  })

  it('listTodo 分页：25 条按页返回，total 正确（§4 降遍历）', async () => {
    const todos = Array.from({ length: 25 }, (_, i) => mkTodo(`t${i}`, 1000 + i))
    await db.saveAll(todos, [])
    const p1 = await db.listTodo(1, 10)
    expect(p1.total).toBe(25)
    expect(p1.items.length).toBe(10)
    const p3 = await db.listTodo(3, 10)
    expect(p3.items.length).toBe(5)
    // 不触发全量遍历：每页仅返回本页 id 对应的实体；索引按 updatedAt 倒序，故第 1 页是最新的 t24..t15
    const descIds = [...todos].sort((a, b) => b.updatedAt - a.updatedAt).map((t) => t.id)
    expect(p1.items.map((t) => t.id)).toEqual(descIds.slice(0, 10))
  })

  it('索引 order 按 updatedAt 倒序', async () => {
    await db.saveTodo(mkTodo('old', 100))
    await db.saveTodo(mkTodo('new', 300))
    await db.saveTodo(mkTodo('mid', 200))
    const idx = await db.readIndex('todo')
    expect(idx.order).toEqual(['new', 'mid', 'old'])
  })

  it('更新实体后索引随之重排', async () => {
    await db.saveTodo(mkTodo('a', 100))
    await db.saveTodo(mkTodo('b', 200))
    // 把 a 的 updatedAt 推到最新
    await db.saveTodo(mkTodo('a', 999))
    const idx = await db.readIndex('todo')
    expect(idx.order).toEqual(['a', 'b'])
  })

  it('deleteTodo 物理删除并从索引移除', async () => {
    await db.saveTodo(mkTodo('x', 100))
    await db.deleteTodo('x')
    expect(await db.getTodo('x')).toBeNull()
    const idx = await db.readIndex('todo')
    expect(idx.total).toBe(0)
    expect(idx.order).toEqual([])
  })

  it('saveArticle + listArticle 同样工作', async () => {
    await db.saveAll([], [mkArticle('a1', 100), mkArticle('a2', 200)])
    const r = await db.listArticle(1, 10)
    expect(r.total).toBe(2)
    expect(r.items.map((a) => a.id).sort()).toEqual(['a1', 'a2'])
  })

  it('isEmpty 在空库为真，回填后为假', async () => {
    expect(await db.isEmpty()).toBe(true)
    await db.saveAll([mkTodo('t', 1)], [])
    expect(await db.isEmpty()).toBe(false)
  })
})
