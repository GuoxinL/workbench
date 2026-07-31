import type { WorkbenchData } from '@/types'

/** 墓碑保留窗口：30 天（对应 S9）。 */
export const TOMBSTONE_TTL = 30 * 24 * 60 * 60 * 1000

/**
 * 序列化前清理过期墓碑（S9）：删除 30 天前的软删除记录。
 * 未删除的实体原样保留。now 可注入以便单测。
 */
export function cleanupTombstones(data: WorkbenchData, now: number = Date.now()): WorkbenchData {
  const keep = (e: { deleted: boolean; updatedAt: number }) =>
    !e.deleted || now - e.updatedAt < TOMBSTONE_TTL
  const todos = data.todos.filter(keep)
  const articles = data.articles.filter(keep)
  if (todos.length === data.todos.length && articles.length === data.articles.length) return data
  return { ...data, todos, articles }
}
