/** 时间格式化：ms -> "2026/7/31 23:35:34"（月/日不补零，时分秒补零） */
export function formatTime(ms: number): string {
  const d = new Date(ms)
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 解析 "2026/7/31 23:35:34" / "2026/7/31" / ISO 字符串 -> ms；失败返回 null */
export function parseTime(s: string): number | null {
  const m = s.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/)
  if (m) {
    const y = +m[1]
    const mo = +m[2] - 1
    const d = +m[3]
    const h = +(m[4] ?? '0')
    const mi = +(m[5] ?? '0')
    const se = +(m[6] ?? '0')
    const ms = new Date(y, mo, d, h, mi, se).getTime()
    return isNaN(ms) ? null : ms
  }
  const t = Date.parse(s)
  return isNaN(t) ? null : t
}

/** 仅取日期部分（本地 0 点），用于同日/同周/同月/同年判定 */
export function startOfDay(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** 是否同一 ISO 周（周一为一周起点） */
export function sameWeek(a: number, b: number): boolean {
  const day = (d: Date) => (d.getDay() + 6) % 7 // 周一=0
  const mondayOf = (ms: number) => {
    const d = new Date(ms)
    d.setDate(d.getDate() - day(d))
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  }
  return mondayOf(a) === mondayOf(b)
}

export function sameMonth(a: number, b: number): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth()
}

export function sameYear(a: number, b: number): boolean {
  return new Date(a).getFullYear() === new Date(b).getFullYear()
}
