import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../index'

describe('renderMarkdown', () => {
  it('渲染基础 Markdown（标题/粗体/列表）', () => {
    const html = renderMarkdown('# 标题\n\n**粗体** 与 *斜体*\n\n- a\n- b')
    expect(html).toContain('<h1>标题</h1>')
    expect(html).toContain('<strong>粗体</strong>')
    expect(html).toContain('<em>斜体</em>')
    expect(html).toContain('<li>a</li>')
  })

  it('==高亮== 渲染为 <mark>（高亮扩展）', () => {
    const html = renderMarkdown('这是 ==重点== 内容')
    expect(html).toContain('<mark>重点</mark>')
  })

  it('[[标题]] 渲染为双链 anchor（data-slug/data-title）', () => {
    const html = renderMarkdown('见 [[Alpha]] 一文')
    expect(html).toContain('class="wikilink"')
    expect(html).toContain('data-slug="alpha"')
    expect(html).toContain('data-title="Alpha"')
    expect(html).toContain('href="#/kb/alpha"')
    expect(html).toContain('>Alpha</a>')
  })

  it('[[标题|别名]] 用别名作可见文本', () => {
    const html = renderMarkdown('见 [[Alpha|甲]]')
    expect(html).toContain('>甲</a>')
    expect(html).toContain('data-slug="alpha"')
  })

  it('exists 返回 false → 追加 .missing 类（L5/L8）', () => {
    const html = renderMarkdown('[[Ghost]]', { exists: () => false })
    expect(html).toContain('class="wikilink missing"')
  })

  it('exists 返回 true → 不标 missing', () => {
    const html = renderMarkdown('[[Alpha]]', { exists: () => true })
    expect(html).toContain('class="wikilink"')
    expect(html).not.toContain('missing')
  })

  it('XSS 消毒：移除 script 与事件属性（§安全基线）', () => {
    const html = renderMarkdown('普通 <script>alert(1)</script> 文本 <img src=x onerror=alert(1)>')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('onerror')
    expect(html).toContain('普通')
  })

  it('双链标题中的 HTML 被当作文本而非标签（防注入）', () => {
    const html = renderMarkdown('[[<b>x</b>]]')
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const a = doc.querySelector('a.wikilink')!
    // 可见文本保持字面量，不向正文注入真实 <b> 元素
    expect(a.textContent).toBe('<b>x</b>')
    expect(a.querySelector('b')).toBeNull()
  })

  it('双链标题中的事件处理器被消毒（属性注入防护）', () => {
    const html = renderMarkdown('[[a" onmouseover="alert(1)]]')
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const a = doc.querySelector('a.wikilink')!
    // 没有真实的事件处理器属性（转义后的 onmouseover 仅是属性值内的字面文本）
    expect(a.getAttribute('onmouseover')).toBeNull()
    // 标题整体作为 data-slug / 可见文本的安全值保留
    expect(a.getAttribute('data-slug')).toBe('a" onmouseover="alert(1)')
    expect(a.textContent).toBe('a" onmouseover="alert(1)')
  })
})
