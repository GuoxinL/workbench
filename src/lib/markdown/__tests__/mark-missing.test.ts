import { describe, it, expect, beforeEach } from 'vitest'
import type { Article } from '@/types'
import { slug } from '@/lib/slug'
import { markMissingLinks } from '@/lib/markdown/wikilink-mark'

function article(id: string, title: string, deleted = false): Article {
  return {
    id,
    title,
    content: '',
    fromTodo: '',
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    deleted,
  }
}

/**
 * 模拟 Milkdown 真实渲染：data-slug 在 milkdown-wikilink.ts 中已用 slug() 归一化，
 * 因此这里对传入标题先 slug 再写入 data-slug，贴近生产实际。
 */
function renderWikilinks(titles: string[]): HTMLElement[] {
  document.body.innerHTML = '<div class="milkdown"></div>'
  const milk = document.querySelector('.milkdown') as HTMLElement
  for (const t of titles) {
    const a = document.createElement('a')
    a.className = 'wikilink'
    a.setAttribute('data-slug', slug(t))
    a.setAttribute('data-title', t)
    milk.appendChild(a)
  }
  return Array.from(milk.querySelectorAll<HTMLElement>('.wikilink'))
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('markMissingLinks', () => {
  it('存在的双链不加 missing，不存在的加 missing（即本次 bug 的修复点）', () => {
    const [existed, missing] = renderWikilinks(['存在文章', '不存在X'])
    markMissingLinks(document, [article('A', '存在文章')])

    expect(existed.classList.contains('missing')).toBe(false)
    expect(missing.classList.contains('missing')).toBe(true)
  })

  it('data-slug 与标题按 slug 归一（大小写/空白）匹配', () => {
    const [el] = renderWikilinks(['Alpha'])
    markMissingLinks(document, [article('A', '  ALPHA  ')])
    expect(el.classList.contains('missing')).toBe(false)
  })

  it('已删除文章视作不存在 → 加 missing', () => {
    const [el] = renderWikilinks(['Beta'])
    markMissingLinks(document, [article('A', 'Beta', true)])
    expect(el.classList.contains('missing')).toBe(true)
  })

  it('无 data-slug 的 wikilink 视为缺失 → 加 missing', () => {
    document.body.innerHTML = '<div class="milkdown"></div>'
    const milk = document.querySelector('.milkdown') as HTMLElement
    const a = document.createElement('a')
    a.className = 'wikilink'
    milk.appendChild(a)

    markMissingLinks(document, [article('A', 'X')])

    expect(a.classList.contains('missing')).toBe(true)
  })

  it('同一 DOM 随 articles 变化正确切换标记（缺失→补齐）', () => {
    const [el] = renderWikilinks(['Gamma'])
    const before = [article('A', 'Alpha')]
    const after = [article('A', 'Alpha'), article('B', 'Gamma')]

    markMissingLinks(document, before)
    expect(el.classList.contains('missing')).toBe(true)

    markMissingLinks(document, after)
    expect(el.classList.contains('missing')).toBe(false)
  })

  it('仅扫描 .milkdown 内的 wikilink，容器外的不受影响', () => {
    document.body.innerHTML = '<div class="milkdown"></div>'
    const milk = document.querySelector('.milkdown') as HTMLElement
    const inside = document.createElement('a')
    inside.className = 'wikilink'
    inside.setAttribute('data-slug', slug('Outside'))
    milk.appendChild(inside)

    const outside = document.createElement('a')
    outside.className = 'wikilink'
    outside.setAttribute('data-slug', slug('Outside'))
    document.body.appendChild(outside)

    markMissingLinks(document, []) // 无任何文章

    // milkdown 内的不存在 → missing；milkdown 外的不在扫描范围 → 不加
    expect(inside.classList.contains('missing')).toBe(true)
    expect(outside.classList.contains('missing')).toBe(false)
  })
})
