/**
 * 极简 YAML frontmatter 解析/序列化。
 *
 * 仅覆盖本项目的受控 schema（字符串 / 数字 / 布尔 / 字符串数组），
 * 不引入 js-yaml 依赖。若将来需要完整 YAML 语义，可在此处替换为 js-yaml。
 */

export type FrontmatterValue = string | number | boolean | string[]
export interface Frontmatter {
  [key: string]: FrontmatterValue
}
export interface ParsedDoc {
  data: Frontmatter
  content: string
}

const FENCE = '---'

function parseValue(v: string): FrontmatterValue {
  if (v === 'true') return true
  if (v === 'false') return false
  if (v === '') return ''
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim()
    if (!inner) return []
    return inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''))
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1)
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  return v
}

/** 解析 `--- ... ---` 包裹的 frontmatter + 正文；无 frontmatter 时 data 为空。 */
export function parseFrontmatter(raw: string): ParsedDoc {
  const trimmed = raw.replace(/^﻿/, '')
  if (!trimmed.startsWith(FENCE + '\n') && trimmed !== FENCE) {
    return { data: {}, content: raw }
  }
  const end = trimmed.indexOf('\n' + FENCE, FENCE.length)
  if (end < 0) return { data: {}, content: raw }

  const fmBlock = trimmed.slice(FENCE.length + 1, end).trim()
  const content = trimmed.slice(end + FENCE.length + 1).replace(/^\n+/, '')

  const data: Frontmatter = {}
  if (fmBlock) {
    for (const line of fmBlock.split('\n')) {
      const idx = line.indexOf(':')
      if (idx < 0) continue
      const key = line.slice(0, idx).trim()
      if (!key) continue
      data[key] = parseValue(line.slice(idx + 1).trim())
    }
  }
  return { data, content }
}

function serializeValue(val: FrontmatterValue): string {
  if (Array.isArray(val)) return `[${val.map((s) => JSON.stringify(s)).join(', ')}]`
  if (typeof val === 'boolean' || typeof val === 'number') return String(val)
  return JSON.stringify(val)
}

/** 序列化：受控字段 → `---\n...\n---\n` + 正文。data 为空时不写 frontmatter。 */
export function serializeFrontmatter(data: Frontmatter, content: string): string {
  const keys = Object.keys(data)
  if (keys.length === 0) return content
  const lines = keys.map((k) => `${k}: ${serializeValue(data[k])}`)
  return `${FENCE}\n${lines.join('\n')}\n${FENCE}\n${content}`
}
