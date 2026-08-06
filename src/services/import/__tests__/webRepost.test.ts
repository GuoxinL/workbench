import { describe, expect, it } from 'vitest'
import { convertWebpage, extractWebMeta } from '../webRepost'

const SAMPLE = `<!DOCTYPE html><html><head>
<meta property="og:site_name" content="示例博客">
<meta name="author" content="张三">
<meta property="article:published_time" content="2026-01-15T10:00:00Z">
<link rel="canonical" href="https://blog.example.com/p/123">
<title>一篇好文 - 示例博客</title>
</head><body>
<nav>顶部导航</nav>
<article>
<h1>一篇好文</h1>
<p>正文第一段，包含<a href="https://blog.example.com/p/123">原文链接</a>。</p>
<h2>小节标题</h2>
<p>第二段内容。</p>
</article>
<footer>页脚版权</footer>
</body></html>`

describe('convertWebpage（确定性转换流水线）', () => {
  it('提取转载元数据：作者/原链接/站点/发布时间', () => {
    const r = convertWebpage({ html: SAMPLE, url: 'https://blog.example.com/p/123' })
    expect(r.sourceAuthor).toBe('张三')
    expect(r.sourceUrl).toBe('https://blog.example.com/p/123')
    expect(r.sourceSite).toBe('示例博客')
    expect(r.sourcePublishedAt).toBe(Date.parse('2026-01-15T10:00:00Z'))
  })

  it('正文转为 Markdown 并剥离页脚噪声', () => {
    const r = convertWebpage({ html: SAMPLE, url: 'https://blog.example.com/p/123' })
    expect(r.content).toContain('正文第一段')
    expect(r.content).toContain('第二段内容')
    expect(r.content).not.toContain('页脚版权')
    // 标题被转成 atx 形式（# / ## 均接受，Readability 可能降一级）
    expect(r.content).toMatch(/#{1,6}\s+一篇好文/)
  })

  it('标题回退为站点名文章', () => {
    const html = '<html><head><meta property="og:site_name" content="X网"></head><body><article><p>无标题正文</p></article></body></html>'
    const r = convertWebpage({ html })
    expect(r.title).toContain('X网')
  })

  it('无 HTML 仅 URL 时至少补全原链接与域名站点', () => {
    const r = convertWebpage({ url: 'https://news.example.org/a/b' })
    expect(r.sourceUrl).toBe('https://news.example.org/a/b')
    expect(r.sourceSite).toBe('news.example.org')
  })
})

describe('extractWebMeta（纯 DOM，可单测）', () => {
  it('JSON-LD 作者兜底', () => {
    const html = `<html><head>
<link rel="canonical" href="https://x.com/1">
<script type="application/ld+json">{"@context":"https://schema.org","author":{"name":"李四"}}</script>
</head><body><article><p>hi</p></article></body></html>`
    const dom = new DOMParser().parseFromString(html, 'text/html')
    const meta = extractWebMeta(dom, 'https://x.com/1')
    expect(meta.sourceAuthor).toBe('李四')
    expect(meta.sourceUrl).toBe('https://x.com/1')
  })
})
