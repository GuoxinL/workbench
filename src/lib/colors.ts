import type { ColorKey } from '@/types'

export interface ColorMeta {
  key: ColorKey
  label: string
  hex: string
}

/** 8 色分类（对应 T2：blue 常规 / red 紧急 / amber 重要 / green 推进中 / purple 思考 / teal 协作 / pink 个人 / slate 待定）。 */
export const COLORS: ColorMeta[] = [
  { key: 'blue', label: '常规', hex: '#3b82f6' },
  { key: 'red', label: '紧急', hex: '#ef4444' },
  { key: 'amber', label: '重要', hex: '#f59e0b' },
  { key: 'green', label: '推进中', hex: '#22c55e' },
  { key: 'purple', label: '思考', hex: '#a855f7' },
  { key: 'teal', label: '协作', hex: '#14b8a6' },
  { key: 'pink', label: '个人', hex: '#ec4899' },
  { key: 'slate', label: '待定', hex: '#64748b' },
]

export const COLOR_MAP: Record<ColorKey, ColorMeta> = Object.fromEntries(
  COLORS.map((c) => [c.key, c]),
) as Record<ColorKey, ColorMeta>

export function colorHex(key: ColorKey): string {
  return COLOR_MAP[key]?.hex ?? '#3b82f6'
}

export function colorLabel(key: ColorKey): string {
  return COLOR_MAP[key]?.label ?? key
}
