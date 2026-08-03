import type { Config, Manifest, ManifestEntry } from '@/types'
import { getFile, putFile, ConflictError } from './repoFile'

export function emptyManifest(): Manifest {
  return { version: 1, updatedAt: Date.now(), articles: {}, todos: {} }
}

/** 由单个实体（文章或待办）构建 manifest 条目；sha 由调用方在 PUT 成功后回填。 */
export function entryOf(
  e: { id: string; title: string; updatedAt: number; deleted: boolean },
  sha = '',
): ManifestEntry {
  return { id: e.id, title: e.title, updatedAt: e.updatedAt, deleted: e.deleted, sha }
}

/**
 * 本地/远端差异，驱动同步引擎的拉取/推送调度。
 *
 * 以实体 id 为键，按 updatedAt 做 per-file LWW（Last-Write-Wins）比较：
 * - pull: 仅存在于远端，或远端 updatedAt 大于本地 → 需从远端拉取
 * - push: 仅存在于本地，或本地 updatedAt 大于远端 → 需推送到远端
 * - 两边都存在且 updatedAt 相等时，不拉也不推（无差异）
 */
export interface ManifestDiff {
  /** 需从远端拉取的 id（远端存在且本地缺失，或远端较新） */
  pull: string[]
  /** 需推送到远端的 id（本地存在且远端缺失，或本地较新） */
  push: string[]
}

/**
 * 索引驱动同步的调度核心（P2 ⑤）：拿**本地实体数组**与**远端轻量索引**做 per-file LWW 比对，
 * 得出真正有差异的 id。同步只需据此 GET/PUT 这些文件，传输量从 O(N) 降到 O(差异数)。
 *
 * 只看 `updatedAt`，不读正文；相等视为无差异（既不拉也不推）。
 */
export function planDiff(
  local: Array<{ id: string; updatedAt: number }>,
  remoteIndex: Record<string, ManifestEntry> | undefined,
): ManifestDiff {
  const remote = remoteIndex ?? {}
  const pull: string[] = []
  const push: string[] = []
  const localMap = new Map(local.map((e) => [e.id, e.updatedAt]))
  const ids = new Set([...localMap.keys(), ...Object.keys(remote)])
  for (const id of ids) {
    const l = localMap.get(id)
    const r = remote[id]
    if (l === undefined && r) pull.push(id)
    else if (l !== undefined && !r) push.push(id)
    else if (l !== undefined && r) {
      if (r.updatedAt > l) pull.push(id)
      else if (l > r.updatedAt) push.push(id)
    }
  }
  return { pull, push }
}

/** 读取 manifest.json；不存在或损坏返回 null。 */
export async function getManifest(config: Config): Promise<{ manifest: Manifest; sha: string } | null> {
  const f = await getFile('manifest.json', config)
  if (!f) return null
  try {
    const m = JSON.parse(f.content) as Manifest
    if (!m || typeof m.articles !== 'object') return null
    return { manifest: m, sha: f.sha }
  } catch {
    return null
  }
}

export async function putManifest(manifest: Manifest, sha: string | undefined, config: Config): Promise<string> {
  try {
    return await putFile('manifest.json', JSON.stringify(manifest, null, 2), sha, config, 'update manifest')
  } catch (e) {
    if (e instanceof ConflictError) throw e
    throw e
  }
}
