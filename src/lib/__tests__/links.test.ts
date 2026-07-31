import { describe, it, expect } from 'vitest'
import type { Article } from '@/types'
import { buildGraph, dedupTitle, extractRefs, renameRefs } from '@/lib/links'

function note(id: string, title: string, content: string, deleted = false): Article {
  return {
    id,
    title,
    content,
    fromTodo: '',
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    deleted,
  }
}

describe('extractRefs', () => {
  it('解析 [[标题]] 与 [[标题|别名]]', () => {
    const refs = extractRefs('see [[Alpha]] and [[Beta|别名]] end')
    expect(refs).toEqual([
      { title: 'Alpha' },
      { title: 'Beta', alias: '别名' },
    ])
  })
  it('同篇重复引用只算一条（L10）', () => {
    const refs = extractRefs('[[Alpha]] x [[alpha]] y [[ALPHA]]')
    expect(refs).toHaveLength(1)
  })
})

describe('buildGraph', () => {
  it('构建出入链与缺失链接', () => {
    const notes = [
      note('A', 'Alpha', '[[Beta]]'),
      note('B', 'Beta', '[[Alpha]] [[Gamma]]'),
      note('C', 'Gamma', 'hello'),
    ]
    const g = buildGraph(notes)
    expect([...g.out.get('A')!]).toEqual(['beta'])
    expect([...g.out.get('B')!].sort()).toEqual(['alpha', 'gamma'])
    expect(g.in.get('beta')!.has('A')).toBe(true)
    expect(g.in.get('alpha')!.has('B')).toBe(true)
    expect(g.missing.size).toBe(0)
    expect(g.titleToId.get('gamma')).toBe('C')
  })

  it('忽略自引用（L9）', () => {
    const g = buildGraph([note('A', 'Alpha', '[[Alpha]]')])
    expect(g.out.get('A')!.size).toBe(0)
    expect(g.in.get('alpha')?.size ?? 0).toBe(0)
  })

  it('标记缺失链接（L5/L8）', () => {
    const g = buildGraph([note('A', 'Alpha', '[[Ghost]]')])
    expect(g.missing.has('ghost')).toBe(true)
    expect(g.out.get('A')!.has('ghost')).toBe(true)
  })

  it('忽略已删除笔记', () => {
    const g = buildGraph([note('A', 'Alpha', '[[Beta]]'), note('B', 'Beta', 'x', true)])
    expect(g.missing.has('beta')).toBe(true)
  })
})

describe('renameRefs', () => {
  it('改写 [[旧]] 与 [[旧|别名]]，保留别名', () => {
    const notes = [
      note('A', 'Alpha', '[[Old]] and [[Old|别名]]'),
      note('B', 'Beta', '[[Old]]'),
    ]
    const out = renameRefs('Old', 'New', notes)
    expect(out[0].content).toBe('[[New]] and [[New|别名]]')
    expect(out[1].content).toBe('[[New]]')
  })

  it('不改写不相关的引用', () => {
    const notes = [note('A', 'Alpha', '[[Other]]')]
    const out = renameRefs('Old', 'New', notes)
    expect(out[0].content).toBe('[[Other]]')
  })

  it('新标题与原标题 slug 相同则不改写', () => {
    const notes = [note('A', 'Alpha', '[[Old]]')]
    expect(renameRefs('Old', 'old', notes)).toBe(notes)
  })
})

describe('dedupTitle', () => {
  it('无冲突直接返回', () => {
    expect(dedupTitle('Note', ['Other'])).toBe('Note')
  })
  it('冲突追加空格序号（N3）', () => {
    expect(dedupTitle('Note', ['Note', 'Note 2'])).toBe('Note 3')
  })
  it('改名冲突追加括号序号（N8）', () => {
    expect(dedupTitle('Note', ['Note', 'Note (2)'], (i) => ` (${i})`)).toBe('Note (3)')
  })
})
