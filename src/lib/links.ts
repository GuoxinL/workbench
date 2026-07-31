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
  /** note id -> 出链目标 slug 集合 */
  out: Map<string, Set<string>>
  /** 目标 slug -> 引用它的 source note id 集合 */
  in: Map<string, Set<string>>
  /** 被引用但无对应笔记的 slug 集合（缺失链接，对应 L5/L8） */
  missing: Set<string>
  /** slug -> note id（现有笔记的标题索引） */
  titleToId: Map<string, string>
}

/**
 * 构建双向链接图（对应 notes.js buildGraph）。
 * 忽略自引用（L9），同篇重复引用已在 extractRefs 去重（L10）。
 */
export function buildGraph(articles: Article[]): LinkGraph {
  const titleToId = new Map<string, string>()
  for (const n of articles) {
    if (n.deleted) continue
    const s = slug(n.title)
    if (!titleToId.has(s)) titleToId.set(s, n.id)
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
      set.add(s)
      if (!titleToId.has(s)) {
        missing.add(s)
      } else {
        if (!inn.has(s)) inn.set(s, new Set())
        inn.get(s)!.add(n.id)
      }
    }
    out.set(n.id, set)
  }

  return { out, in: inn, missing, titleToId }
}

/**
 * 批量改写引用：把所有笔记里指向 `oldTitle` 的 [[oldTitle]] / [[oldTitle|alias]]
 * 改写为 `newTitle`（保留别名）。用于改标题联动改引用（L11）。
 * 返回新的笔记数组；被改动的笔记会刷新 updatedAt。
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
