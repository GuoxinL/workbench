import { describe, expect, it } from 'vitest'
import { extractExcerpt, extractFirstImage, safeImageUrl } from '../excerpt'

describe('extractExcerpt', () => {
  it('去除标题语法', () => {
    expect(extractExcerpt('## 标题\n\n正文')).toBe('标题 正文')
  })

  it('去除链接与图片', () => {
    expect(extractExcerpt('见 [百度](https://baidu.com) 和 ![](a.png) 图')).toBe('见 百度 和 图')
  })

  it('去除格式符', () => {
    expect(extractExcerpt('**粗体** 与 *斜体* 与 `代码` 与 ~删除~')).toBe('粗体 与 斜体 与 代码 与 删除')
  })

  it('截断超长内容', () => {
    const long = 'a'.repeat(200)
    const r = extractExcerpt(long, 50)
    expect(r).toHaveLength(51) // 50 + '…'
    expect(r.endsWith('…')).toBe(true)
  })

  it('空文章返回占位', () => {
    expect(extractExcerpt('')).toBe('（空文章）')
  })

  it('白色文章返回占位', () => {
    expect(extractExcerpt('   \n\n  ')).toBe('（空文章）')
  })
})

describe('extractFirstImage', () => {
  it('提取第一张图片 URL', () => {
    expect(extractFirstImage('a ![alt](https://x.com/a.png) b ![alt](https://x.com/b.png)')).toBe('https://x.com/a.png')
  })

  it('无图片返回 null', () => {
    expect(extractFirstImage('just text')).toBeNull()
  })

  it('空字符串返回 null', () => {
    expect(extractFirstImage('')).toBeNull()
  })
})

describe('safeImageUrl', () => {
  it('null → null', () => {
    expect(safeImageUrl(null)).toBeNull()
  })

  it('data: URI 直接返回', () => {
    expect(safeImageUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc')
  })

  it('绝对路径保留', () => {
    expect(safeImageUrl('/images/photo.png')).toBe('/images/photo.png')
  })

  it('远程 URL 保留', () => {
    expect(safeImageUrl('https://example.com/img.png')).toBe('https://example.com/img.png')
  })

  it('相对路径过滤（非绝对、非远程）', () => {
    expect(safeImageUrl('assets/img.png')).toBeNull()
  })
})
