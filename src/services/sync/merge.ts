import type { Article, Todo, WorkbenchData } from '@/types'

export interface MergeResult {
  todos: Todo[]
  articles: Article[]
  /** 是否发生了任何合并变更（用于 sync() 上报 merged 标志） */
  merged: boolean
}

/**
 * 逐条 LWW 合并（对应 S7 + S8 软删除墓碑）。
 * - 远端有本地无 -> 插入
 * - 两端都有 -> updatedAt 大者胜（相等保留本地）
 * - 合并后按 createdAt 倒序
 * 墓碑（deleted）同样参与合并，保证删除可传播。
 */
function mergeEntities<T extends { id: string; createdAt: number; updatedAt: number }>(
  local: T[],
  remote: T[],
): { items: T[]; changed: boolean } {
  const map = new Map<string, T>()
  for (const it of local) map.set(it.id, it)
  let changed = false
  for (const r of remote) {
    const l = map.get(r.id)
    if (!l) {
      map.set(r.id, r)
      changed = true
    } else if (r.updatedAt > l.updatedAt) {
      map.set(r.id, r)
      changed = true
    }
  }
  const items = [...map.values()].sort((a, b) => b.createdAt - a.createdAt)
  return { items, changed }
}

/** 逐条 LWW 合并文章数组（按 id 主键，updatedAt 大者胜）。供同步引擎按文件合并复用。 */
export function mergeArticles(local: Article[], remote: Article[]): { items: Article[]; changed: boolean } {
  return mergeEntities(local, remote)
}

export function mergeInto(local: WorkbenchData, remote: WorkbenchData): MergeResult {
  const t = mergeEntities(local.todos, remote.todos)
  const n = mergeEntities(local.articles, remote.articles)
  return { todos: t.items, articles: n.items, merged: t.changed || n.changed }
}
