import type { Article, Config, Manifest, ManifestEntry } from '@/types'
import { slug } from '@/lib/slug'
import { getFile, putFile, ConflictError } from './repoFile'

export function emptyManifest(): Manifest {
  return { version: 1, updatedAt: Date.now(), articles: {}, todosSha: '' }
}

export function slugOf(title: string): string {
  return slug(title)
}

/** 由本地文章数组构建 manifest 索引（sha 由调用方回填）。 */
export function indexFromArticles(articles: Article[]): Record<string, ManifestEntry> {
  const out: Record<string, ManifestEntry> = {}
  for (const a of articles) {
    out[slug(a.title)] = {
      id: a.id,
      title: a.title,
      updatedAt: a.updatedAt,
      deleted: a.deleted,
      sha: '',
    }
  }
  return out
}

export interface ManifestDiff {
  /** 需从远端拉取的 slug（远端更新或本地缺失） */
  pull: string[]
  /** 需推送到远端的 slug（本地更新或远端缺失） */
  push: string[]
}

/**
 * 比对本地/远端 manifest，得出需拉/需推的 slug 集合（per-file LWW 的调度依据）。
 * 纯函数，便于单测。
 */
export function diffManifests(local: Manifest, remote: Manifest): ManifestDiff {
  const pull: string[] = []
  const push: string[] = []
  const slugs = new Set([...Object.keys(local.articles), ...Object.keys(remote.articles)])
  for (const s of slugs) {
    const l = local.articles[s]
    const r = remote.articles[s]
    if (!l && r) pull.push(s)
    else if (l && !r) push.push(s)
    else if (l && r) {
      if (r.updatedAt > l.updatedAt) pull.push(s)
      else if (l.updatedAt > r.updatedAt) push.push(s)
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
