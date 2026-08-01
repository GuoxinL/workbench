import { describe, it, expect } from 'vitest'
import type { Article } from '@/types'
import { buildGraph, dedupTitle, extractRefs, renameRefs } from '@/lib/links'

function article(id: string, title: string, content: string, deleted = false): Article {
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
    const articles = [
      article('A', 'Alpha', '[[Beta]]'),
      article('B', 'Beta', '[[Alpha]] [[Gamma]]'),
      article('C', 'Gamma', 'hello'),
    ]
    const g = buildGraph(articles)
    expect([...g.out.get('A')!]).toEqual(['B'])
    expect([...g.out.get('B')!].sort()).toEqual(['A', 'C'])
    expect(g.in.get('B')!.has('A')).toBe(true)
    expect(g.in.get('A')!.has('B')).toBe(true)
    expect(g.in.get('C')!.has('B')).toBe(true)
    expect(g.missing.size).toBe(0)
    expect(g.slugToId.get('gamma')).toBe('C')
  })

  it('忽略自引用（L9）', () => {
    const g = buildGraph([article('A', 'Alpha', '[[Alpha]]')])
    expect(g.out.get('A')!.size).toBe(0)
    expect(g.in.get('A')?.size ?? 0).toBe(0)
  })

  it('标记缺失链接（L5/L8）', () => {
    const g = buildGraph([article('A', 'Alpha', '[[Ghost]]')])
    expect(g.missing.has('ghost')).toBe(true)
    expect(g.out.get('A')!.size).toBe(0)
  })

  it('忽略已删除文章', () => {
    const g = buildGraph([article('A', 'Alpha', '[[Beta]]'), article('B', 'Beta', 'x', true)])
    expect(g.missing.has('beta')).toBe(true)
  })
})

describe('renameRefs', () => {
  it('改写 [[旧]] 与 [[旧|别名]]，保留别名', () => {
    const articles = [
      article('A', 'Alpha', '[[Old]] and [[Old|别名]]'),
      article('B', 'Beta', '[[Old]]'),
    ]
    const out = renameRefs('Old', 'New', articles)
    expect(out[0].content).toBe('[[New]] and [[New|别名]]')
    expect(out[1].content).toBe('[[New]]')
  })

  it('不改写不相关的引用', () => {
    const articles = [article('A', 'Alpha', '[[Other]]')]
    const out = renameRefs('Old', 'New', articles)
    expect(out[0].content).toBe('[[Other]]')
  })

  it('新标题与原标题 slug 相同则不改写', () => {
    const articles = [article('A', 'Alpha', '[[Old]]')]
    expect(renameRefs('Old', 'old', articles)).toBe(articles)
  })
})

describe('dedupTitle', () => {
  it('无冲突直接返回', () => {
    expect(dedupTitle('Article', ['Other'])).toBe('Article')
  })
  it('冲突追加空格序号（N3）', () => {
    expect(dedupTitle('Article', ['Article', 'Article 2'])).toBe('Article 3')
  })
  it('改名冲突追加括号序号（N8）', () => {
    expect(dedupTitle('Article', ['Article', 'Article (2)'], (i) => ` (${i})`)).toBe('Article (3)')
  })
})
