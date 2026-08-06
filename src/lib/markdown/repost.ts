import { renderMarkdown } from './index'
import type { Article } from '@/types'

/** 转载来源字段子集（用于生成/渲染声明块）。 */
export type RepostSource = Pick<
  Article,
  'repost' | 'sourceAuthorized' | 'sourceAuthor' | 'sourceUrl' | 'sourceSite' | 'sourcePublishedAt'
>

/**
 * 把转载信息拼成 Markdown 引用块（blockquote）。
 * 仅当 repost 为真且至少含原作者/原链接其一才产出；否则返回空串。
 * 内容经 renderMarkdown 二次消毒（设计 §2.5：用户内容渲染前必须消毒）。
 */
export function buildRepostNote(a: RepostSource): string {
  if (!a.repost) return ''
  const author = (a.sourceAuthor || '').trim()
  const url = (a.sourceUrl || '').trim()
  if (!author && !url) return ''
  const site = (a.sourceSite || '').trim()
  const date = a.sourcePublishedAt ? new Date(a.sourcePublishedAt).toLocaleDateString() : ''

  let line = '> 本文转载自'
  if (author) line += ` **${author}**`
  if (site) line += ` @ ${site}`
  if (date) line += `（原文发布于 ${date}）`
  line += '，已获原作者授权。'
  const lines = [line]
  if (url) lines.push(`> 原文链接：[${url}](${url})`)
  return lines.join('\n')
}

/** 把转载声明块渲染为已消毒的安全 HTML（空串时返回 ''）。 */
export function renderRepostNote(a: RepostSource): string {
  const md = buildRepostNote(a)
  return md ? renderMarkdown(md) : ''
}
