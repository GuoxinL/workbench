import { describe, it, expect } from 'vitest'
import { slug } from '@/lib/slug'

describe('slug', () => {
  it('归一化：trim + 小写 + 折叠空白', () => {
    expect(slug('  Hello   World ')).toBe('hello world')
  })
  it('中文标题大小写与空白处理', () => {
    expect(slug('  我的  笔记 ')).toBe('我的 笔记')
  })
})
