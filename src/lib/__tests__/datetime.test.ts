import { describe, expect, it } from 'vitest'
import { formatTime, parseTime, sameMonth, sameWeek, sameYear, startOfDay } from '@/lib/datetime'

describe('datetime', () => {
  it('formatTime 输出 年/月/日 时:分:秒（月日不补零，时分秒补零）', () => {
    const ms = new Date(2026, 6, 31, 23, 35, 34).getTime()
    expect(formatTime(ms)).toBe('2026/7/31 23:35:34')
  })

  it('parseTime 解析 2026/7/31 23:35:34 往返一致', () => {
    const ms = parseTime('2026/7/31 23:35:34')
    expect(ms).not.toBeNull()
    expect(formatTime(ms!)).toBe('2026/7/31 23:35:34')
  })

  it('parseTime 仅日期与非法串', () => {
    expect(formatTime(parseTime('2026/1/2')!)).toBe('2026/1/2 00:00:00')
    expect(parseTime('not-a-date')).toBeNull()
  })

  it('sameMonth / sameYear', () => {
    const a = new Date(2026, 6, 31).getTime()
    const b = new Date(2026, 6, 1).getTime()
    const c = new Date(2025, 6, 31).getTime()
    expect(sameMonth(a, b)).toBe(true)
    expect(sameMonth(a, c)).toBe(false)
    expect(sameYear(a, c)).toBe(false)
  })

  it('sameWeek 以周一为起点', () => {
    // 2026-07-31 是周五；2026-07-27 是周一，同周
    const fri = new Date(2026, 6, 31).getTime()
    const mon = new Date(2026, 6, 27).getTime()
    const sun = new Date(2026, 6, 26).getTime() // 周日，属上一周
    expect(sameWeek(fri, mon)).toBe(true)
    expect(sameWeek(fri, sun)).toBe(false)
  })

  it('startOfDay 归零到本地 0 点', () => {
    const ms = new Date(2026, 6, 31, 23, 59, 59).getTime()
    expect(startOfDay(ms)).toBe(new Date(2026, 6, 31).getTime())
  })
})
