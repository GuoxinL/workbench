import { describe, it, expect } from 'vitest'
import type { WorkbenchData } from '@/types'
import { cleanupTombstones, TOMBSTONE_TTL } from '@/services/sync/serialize'

function data(): WorkbenchData {
  return {
    version: 1,
    todos: [
      { id: 'live', title: 't', desc: '', color: 'blue', status: 'todo', due: '', articleId: '', time: 1, createdAt: 1, updatedAt: 1, deleted: false },
      { id: 'fresh-tomb', title: 't', desc: '', color: 'blue', status: 'todo', due: '', articleId: '', time: 1, createdAt: 1, updatedAt: 1, deleted: true },
    ],
    articles: [],
    updatedAt: 1,
  }
}

describe('cleanupTombstones', () => {
  it('保留 30 天内的墓碑', () => {
    const d = data()
    const now = TOMBSTONE_TTL // fresh-tomb 的 updatedAt=1，距今 = TTL-1 < TTL，应保留
    const r = cleanupTombstones(d, now)
    expect(r.todos.map((t) => t.id).sort()).toEqual(['fresh-tomb', 'live'])
  })

  it('丢弃超过 30 天的墓碑（边界 +1ms）', () => {
    const d = data()
    const now = TOMBSTONE_TTL + 1
    const r = cleanupTombstones(d, now)
    expect(r.todos.map((t) => t.id)).toEqual(['live'])
  })

  it('未删除实体原样保留', () => {
    const d = data()
    const r = cleanupTombstones(d, 0)
    expect(r.todos.find((t) => t.id === 'live')).toBeTruthy()
  })

  it('无变化时返回同一引用', () => {
    const d = data()
    const r = cleanupTombstones(d, 0)
    expect(r).toBe(d)
  })
})
