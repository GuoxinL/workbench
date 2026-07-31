import { describe, expect, it } from 'vitest'
import { parseFrontmatter, serializeFrontmatter } from '../frontmatter'

describe('parseFrontmatter', () => {
  it('无 frontmatter 时返回空 data + 原样正文', () => {
    const raw = '# 标题\n\n正文内容'
    expect(parseFrontmatter(raw)).toEqual({ data: {}, content: raw })
  })

  it('解析基本字段（字符串/数字/布尔/数组）', () => {
    const raw = [
      '---',
      'title: "真实标题"',
      'updatedAt: 1700000000000',
      'deleted: false',
      'tags: [架构, 同步引擎]',
      '---',
      '正文',
    ].join('\n')
    const { data, content } = parseFrontmatter(raw)
    expect(data.title).toBe('真实标题')
    expect(data.updatedAt).toBe(1700000000000)
    expect(data.deleted).toBe(false)
    expect(data.tags).toEqual(['架构', '同步引擎'])
    expect(content).toBe('正文')
  })

  it('正文前的换行被剥离', () => {
    const raw = '---\ntitle: "x"\n---\n\n正文两行'
    const { content } = parseFrontmatter(raw)
    expect(content).toBe('正文两行')
  })

  it('数组为空时解析为 []', () => {
    const raw = '---\ntags: []\n---\nbody'
    expect(parseFrontmatter(raw).data.tags).toEqual([])
  })

  it('缺闭合围栏时回退为无 frontmatter', () => {
    const raw = '---\ntitle: "x"\nbody'
    expect(parseFrontmatter(raw)).toEqual({ data: {}, content: raw })
  })
})

describe('serializeFrontmatter', () => {
  it('data 为空时不写 frontmatter', () => {
    expect(serializeFrontmatter({}, '纯正文')).toBe('纯正文')
  })

  it('序列化基本字段', () => {
    const out = serializeFrontmatter(
      { title: '真实标题', updatedAt: 1700000000000, deleted: false, tags: ['a', 'b'] },
      '正文',
    )
    expect(out).toBe(
      ['---', 'title: "真实标题"', 'updatedAt: 1700000000000', 'deleted: false', 'tags: ["a", "b"]', '---', '正文'].join('\n'),
    )
  })

  it('解析序列化结果可往返', () => {
    const fm = { title: 'T', count: 3, ok: true, tags: ['x', 'y'] }
    const round = parseFrontmatter(serializeFrontmatter(fm, 'hello')).data
    expect(round).toEqual(fm)
  })
})
