import type { Config, Manifest, ManifestEntry } from '@/types'
import { getFile } from './repoFile'

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
 * @deprecated 已被 `src/services/sync/diff.ts` 的 `planSync`（按 git blob sha 三态判定）取代。
 * 仅保留以兼容旧测试；新同步不再使用 updatedAt 比较。
 */
export function planDiff(
  local: Array<{ id: string; updatedAt: number }>,
  remoteIndex: Record<string, ManifestEntry> | undefined,
): { pull: string[]; push: string[] } {
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

/**
 * @deprecated 旧中央 `manifest.json` 已不再写入。本函数仅保留用于读取既有仓库的遗留 manifest
 * （过渡期只读、不播种）。新同步改用 `listDir` 目录树索引，不再依赖此文件。
 */
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
