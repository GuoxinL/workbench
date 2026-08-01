import type { Article, Config, Manifest, ManifestEntry } from '@/types'
import { getFile, putFile, ConflictError } from './repoFile'

export function emptyManifest(): Manifest {
  return { version: 1, updatedAt: Date.now(), articles: {}, todosSha: '' }
}

/** 由本地文章数组构建 manifest 索引（key 为 id，sha 由调用方回填）。 */
export function indexFromArticles(articles: Article[]): Record<string, ManifestEntry> {
  const out: Record<string, ManifestEntry> = {}
  for (const a of articles) {
    out[a.id] = {
      id: a.id,
      title: a.title,
      updatedAt: a.updatedAt,
      deleted: a.deleted,
      sha: '',
    }
  }
  return out
}

/**
 * 本地/远端 manifest 差异，驱动同步引擎的拉取/推送调度。
 *
 * 以文章 id 为键，按 updatedAt 做 per-file LWW（Last-Write-Wins）比较：
 * - pull: 文章仅存在于远端，或远端 updatedAt 大于本地 → 需从远端拉取
 * - push: 文章仅存在于本地，或本地 updatedAt 大于远端 → 需推送到远端
 * - 两边都存在且 updatedAt 相等时，不拉也不推（无差异）
 */
export interface ManifestDiff {
  /** 需从远端拉取的 id（远端存在且本地缺失，或远端较新） */
  pull: string[]
  /** 需推送到远端的 id（本地存在且远端缺失，或本地较新） */
  push: string[]
}

/**
 * 比对本地/远端 manifest（id 为 key），得出需拉/需推的 id 集合（per-file LWW 的调度依据）。
 */
export function diffManifests(local: Manifest, remote: Manifest): ManifestDiff {
  const pull: string[] = []
  const push: string[] = []
  const ids = new Set([...Object.keys(local.articles), ...Object.keys(remote.articles)])
  for (const id of ids) {
    const l = local.articles[id]
    const r = remote.articles[id]
    if (!l && r) pull.push(id)
    else if (l && !r) push.push(id)
    else if (l && r) {
      if (r.updatedAt > l.updatedAt) pull.push(id)
      else if (l.updatedAt > r.updatedAt) push.push(id)
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
