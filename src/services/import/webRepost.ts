import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import DOMPurify from 'dompurify'

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  hr: '---',
  emDelimiter: '*',
})
turndown.use(gfm)

export interface WebRepostInput {
  /** 原网页 URL（权威原链接，也用于提取域名/站点名） */
  url?: string
  /** 用户粘贴的网页 HTML/正文；缺省时仅用 URL 做元数据占位 */
  html?: string
}

export interface WebRepostResult {
  title: string
  /** 转换后的 Markdown 正文（v1 保留原图 URL） */
  content: string
  sourceAuthor?: string
  sourceUrl?: string
  sourceSite?: string
  sourcePublishedAt?: number
}

function parseDom(html?: string): Document {
  if (html && html.trim()) {
    if (typeof DOMParser !== 'undefined') {
      return new DOMParser().parseFromString(html, 'text/html')
    }
    const d = document.implementation.createHTMLDocument('')
    d.documentElement.innerHTML = html
    return d
  }
  return document
}

function metaContent(dom: Document, sel: string): string {
  return dom.querySelector(sel)?.getAttribute('content')?.trim() || ''
}
function metaByName(dom: Document, name: string): string {
  return metaContent(dom, `meta[name="${name}"]`) || metaContent(dom, `meta[property="${name}"]`)
}

/** 从 JSON-LD 脚本里取作者名（兼容对象或 @graph 数组）。 */
function extractJsonLdAuthor(dom: Document): string {
  const scripts = Array.from(dom.querySelectorAll('script[type="application/ld+json"]'))
  for (const s of scripts) {
    try {
      const json = JSON.parse(s.textContent || '')
      const nodes = Array.isArray(json) ? json : json['@graph'] ? json['@graph'] : [json]
      for (const node of nodes) {
        const author = node?.author
        if (!author) continue
        if (typeof author === 'string') return author
        if (author.name) return author.name
      }
    } catch {
      /* 非法 JSON-LD 忽略 */
    }
  }
  return ''
}

/** 提取转载元数据（纯 DOM 操作，可单测）。 */
export function extractWebMeta(
  dom: Document,
  url?: string,
  hints?: { author?: string; siteName?: string },
): Pick<WebRepostResult, 'sourceAuthor' | 'sourceUrl' | 'sourceSite' | 'sourcePublishedAt'> {
  const canonical = (dom.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href
  const sourceUrl = canonical || url || ''

  const hostname = (() => {
    try {
      return new URL(sourceUrl).hostname
    } catch {
      return ''
    }
  })()
  const ogSite = metaContent(dom, 'meta[property="og:site_name"]')
  const sourceSite = ogSite || hints?.siteName || hostname || undefined

  const byMeta = metaByName(dom, 'author') || metaContent(dom, 'meta[property="article:author"]')
  const sourceAuthor = byMeta || hints?.author || extractJsonLdAuthor(dom) || undefined

  let sourcePublishedAt: number | undefined
  const pub =
    metaContent(dom, 'meta[property="article:published_time"]') ||
    metaByName(dom, 'datePublished') ||
    metaContent(dom, 'meta[itemprop="datePublished"]')
  if (pub) {
    const t = Date.parse(pub)
    if (!Number.isNaN(t)) sourcePublishedAt = t
  }

  return {
    sourceUrl: sourceUrl || undefined,
    sourceSite,
    sourceAuthor,
    sourcePublishedAt,
  }
}

/**
 * 把网页转换为工作台文章格式（确定性流水线，不依赖 LLM）：
 * 1) Readability 抽正文并剥离导航/广告；
 * 2) DOMPurify 净化；
 * 3) Turndown(+gfm) 转 Markdown；
 * 4) 提取转载元数据。
 * 图片 v1 保留原 URL（不下载内联）。
 */
export function convertWebpage(input: WebRepostInput): WebRepostResult {
  const dom = parseDom(input.html)
  // 先提取元数据（Readability.parse 会改写 DOM，故在之前取 head 元信息）
  const meta = extractWebMeta(dom, input.url)
  let title = ''
  let content = ''

  try {
    const art = new Readability(dom).parse()
    if (art) {
      title = art.title || ''
      const clean = DOMPurify.sanitize(art.content || '', { ADD_ATTR: ['target'] })
      content = turndown.turndown(clean)
      // 用 Readability 额外提取的署名/站点补全
      if (!meta.sourceAuthor && art.byline) meta.sourceAuthor = art.byline
      if (!meta.sourceSite && art.siteName) meta.sourceSite = art.siteName
    }
  } catch {
    /* Readability 失败则 content/title 留空，仅用元数据兜底 */
  }

  if (!title) title = meta.sourceSite ? `${meta.sourceSite} 文章` : '转载文章'

  return {
    title: title.trim(),
    content: content.trim(),
    ...meta,
  }
}
