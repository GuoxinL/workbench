/**
 * 同步三态判定（替代旧 manifest.planDiff 的 updatedAt 比较）。
 *
 * 对「本地 id 集合 ∪ 远端 path 集合」中每个 id，取三枚指纹：
 * - `treeSha`：远端目录树里的 sha（无则 absent）
 * - `baseSha`：本地基线 `wb.syncState.v1[id]`（无则 absent，表示从未成功同步过）
 * - `localSha`：本地内容的 git blob sha（软删除实体的 localSha 不参与内容比较）
 *
 * 判定矩阵（详见 02-plan.md §五）：
 *   A 本地无 / 远端有            → PULL
 *   B 本地有(存活) / 远端无       → PUSH（新建）
 *   C 两边都存活 / localSha === treeSha → 跳过（不更新）
 *   D 本地未动(base===localSha) / 远端改(treeSha≠base) → PULL
 *   E 远端未动(treeSha===base) / 本地改 → PUSH
 *   F 双方都改且不同            → CONFLICT（LWW 合并后推送）
 *   G 本地软删除 / 远端有        → DELETE（带远端 sha 锁）
 *
 * 首轮（baseSha 缺失）无法判定谁改：localSha === treeSha 视为跳过(C)，
 * 否则按冲突(F)处理——GET 远端后按 updatedAt 做 LWW 合并再推送，避免盲目覆盖远端内容。
 */
export interface SyncItem {
  id: string
  deleted: boolean
  localSha: string
}

export interface PlanResult {
  /** A / D：远端有、需拉取正文 */
  pull: string[]
  /** B / E：本地较新、需推送 */
  push: string[]
  /** G：本地软删除、需删除远端文件 */
  del: string[]
  /** F：双方都改、需 LWW 合并后推送 */
  conflicts: string[]
  /** C：sha 一致、不更新 */
  skip: string[]
}

export function planSync(
  local: SyncItem[],
  treeIndex: Record<string, string>,
  baseSha: Record<string, string>,
): PlanResult {
  const result: PlanResult = { pull: [], push: [], del: [], conflicts: [], skip: [] }
  const byId = new Map(local.map((l) => [l.id, l]))
  const ids = new Set<string>([...byId.keys(), ...Object.keys(treeIndex)])

  for (const id of ids) {
    const item = byId.get(id)
    const tree = treeIndex[id]
    const base = baseSha[id]

    // A：本地无此 id、远端有 → 拉取
    if (!item) {
      if (tree) result.pull.push(id)
      continue
    }
    // G：本地软删除 → 远端有则删除
    if (item.deleted) {
      if (tree) result.del.push(id)
      continue
    }
    // B：远端无 → 新建
    if (!tree) {
      result.push.push(id)
      continue
    }
    // C：sha 一致 → 跳过（不更新）
    if (item.localSha === tree) {
      result.skip.push(id)
      continue
    }
    // 无基线（首轮 / 未同步过）：按冲突安全处理（LWW 合并后推送）
    if (base === undefined) {
      result.conflicts.push(id)
      continue
    }
    // D：本地未动、远端改 → 拉取
    if (item.localSha === base) {
      result.pull.push(id)
      continue
    }
    // E：远端未动、本地改 → 推送
    if (tree === base) {
      result.push.push(id)
      continue
    }
    // F：双方都改且不同 → 冲突
    result.conflicts.push(id)
  }
  return result
}
