import type { Article } from '@/types'
import { slug } from '@/lib/slug'

/** 双链语法：[[标题]] 或 [[标题|别名]] */
export const WIKI_RE = /\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]/g

export interface WikiRef {
  title: string
  alias?: string
}

/** 从正文提取双链引用，按 slug 去重（同篇多次引用只算一条，对应 L10）。 */
export function extractRefs(content: string): WikiRef[] {
  const out: WikiRef[] = []
  const seen = new Set<string>()
  WIKI_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = WIKI_RE.exec(content)) !== null) {
    const title = m[1].trim()
    const s = slug(title)
    if (seen.has(s)) continue
    seen.add(s)
    out.push({ title, alias: m[2]?.trim() })
  }
  return out
}

export interface LinkGraph {
  /** 源文章 id -> 目标文章 id 集合 */
  out: Map<string, Set<string>>
  /** 目标文章 id -> 引用它的源文章 id 集合 */
  in: Map<string, Set<string>>
  /** 被引用但无对应文章的 slug 集合（缺失链接，对应 L5/L8） */
  missing: Set<string>
  /** slug -> 文章 id（现有文章的标题索引） */
  slugToId: Map<string, string>
}

/**
 * 根据文章标题（双链中的 [[标题]] 文本）解析到文章 id。
 * 未找到返回 null；多篇文章 slug 相同取首个匹配（与 slugToId 一致）。
 */
export function resolveTitle(articles: Article[], title: string): string | null {
  const s = slug(title)
  const a = articles.find((n) => !n.deleted && slug(n.title) === s)
  return a ? a.id : null
}

/**
 * 构建双向链接图（对应 articles.js buildGraph）。
 * 忽略自引用（L9），同篇重复引用已在 extractRefs 去重（L10）。
 */
export function buildGraph(articles: Article[]): LinkGraph {
  const slugToId = new Map<string, string>()
  for (const n of articles) {
    if (n.deleted) continue
    const s = slug(n.title)
    if (!slugToId.has(s)) slugToId.set(s, n.id)
  }

  const out = new Map<string, Set<string>>()
  const inn = new Map<string, Set<string>>()
  const missing = new Set<string>()

  for (const n of articles) {
    if (n.deleted) continue
    const self = slug(n.title)
    const refs = extractRefs(n.content)
    const set = new Set<string>()
    for (const r of refs) {
      const s = slug(r.title)
      if (s === self) continue // 忽略自引用
      const tgtId = slugToId.get(s)
      if (tgtId) {
        set.add(tgtId)
        if (!inn.has(tgtId)) inn.set(tgtId, new Set())
        inn.get(tgtId)!.add(n.id)
      } else {
        missing.add(s)
      }
    }
    out.set(n.id, set)
  }

  return { out, in: inn, missing, slugToId }
}

/**
 * 批量改写引用：把所有文章里指向 `oldTitle` 的 [[oldTitle]] / [[oldTitle|alias]]
 * 改写为 `newTitle`（保留别名）。用于改标题联动改引用（L11）。
 * 返回新的文章数组；被改动的文章会刷新 updatedAt。
 */
export function renameRefs(oldTitle: string, newTitle: string, articles: Article[]): Article[] {
  const oldSlug = slug(oldTitle)
  if (oldSlug === slug(newTitle)) return articles
  const re = /\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]/g
  return articles.map((n) => {
    let changed = false
    const content = n.content.replace(re, (m, t: string, alias?: string) => {
      if (slug(t) === oldSlug) {
        changed = true
        return alias ? `[[${newTitle}|${alias}]]` : `[[${newTitle}]]`
      }
      return m
    })
    return changed ? { ...n, content, updatedAt: Date.now() } : n
  })
}

/**
 * 标题去重（N3 新建 / N8 改名）。
 * suffix 默认 ` i`（" 2"）；改名场景传 `(i) => ` (${i})` 得到 "原名 (2)"。
 */
export function dedupTitle(
  base: string,
  existing: string[],
  suffix: (i: number) => string = (i) => ` ${i}`,
): string {
  const taken = new Set(existing.map(slug))
  if (!taken.has(slug(base))) return base
  let i = 2
  while (taken.has(slug(base + suffix(i)))) i++
  return base + suffix(i)
}
