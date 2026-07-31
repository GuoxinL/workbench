import type { Article, Config, Manifest } from '@/types'
import { slug } from '@/lib/slug'
import { parseFrontmatter, serializeFrontmatter } from '@/lib/markdown/frontmatter'
import { ConflictError, getFile, putFile } from './repoFile'
import { emptyManifest, getManifest, indexFromArticles, putManifest } from './manifest'

export interface RemoteSnapshot {
  manifest: Manifest
  manifestSha: string
  articles: Article[]
  /** slug -> 远端文件 blob sha，供更新已有文件时作为乐观锁基准（避免 GitHub 422） */
  shas: Record<string, string>
}

/** 拉取远端快照：manifest + 各 kb 文件（解析 frontmatter → Article）。 */
export async function fetchRemote(config: Config): Promise<RemoteSnapshot | null> {
  const m = await getManifest(config)
  if (!m) return null
  const articles: Article[] = []
  const shas: Record<string, string> = {}
  for (const key of Object.keys(m.manifest.articles)) {
    const entry = m.manifest.articles[key]
    if (entry.deleted) continue
    const file = await getFile(`kb/${key}.md`, config)
    if (!file) continue
    const { data, content } = parseFrontmatter(file.content)
    shas[key] = file.sha
    articles.push({
      id: entry.id,
      title: entry.title,
      content,
      fromTodo: String((data as any).fromTodo ?? ''),
      tags: Array.isArray((data as any).tags) ? ((data as any).tags as unknown[]).map(String) : [],
      createdAt: Number((data as any).createdAt ?? entry.updatedAt),
      updatedAt: entry.updatedAt,
      deleted: false,
    })
  }
  return { manifest: m.manifest, manifestSha: m.sha, articles, shas }
}

export interface PushInput {
  articles: Article[]
  manifestSha: string | undefined
  /** 远端已存在文件的 blob sha：更新时作为乐观锁基准传入 putFile（缺失则视为新建） */
  remoteShas?: Record<string, string>
}

export interface PushResult {
  /** 成功推送后的新 manifest（含各文件 sha） */
  manifest: Manifest
  /** 发生冲突的 slug；非 null 时表示需重新拉取合并后重试（S10） */
  conflictSlug: string | null
  /** 推送后 manifest.json 的 sha（供下次乐观锁，对应 S10） */
  manifestSha: string
}

/** 推送本地文章到远端：逐文件 PUT（kb/<slug>.md）+ 更新 manifest.json。 */
export async function pushRemote(input: PushInput, config: Config): Promise<PushResult> {
  const manifest = emptyManifest()
  manifest.articles = indexFromArticles(input.articles)
  let conflictSlug: string | null = null

  for (const a of input.articles) {
    const s = slug(a.title)
    const md = serializeFrontmatter(
      {
        id: a.id,
        title: a.title,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        deleted: a.deleted,
        fromTodo: a.fromTodo,
        tags: a.tags,
        publish: true,
      },
      a.content,
    )
    try {
      // 已存在文件需带远端 blob sha 才能更新；缺失则该文件视为新建（GitHub 对更新缺失 sha 返回 422）
      const sha = await putFile(`kb/${s}.md`, md, input.remoteShas?.[s], config, `update ${a.title}`)
      manifest.articles[s].sha = sha
    } catch (e) {
      if (e instanceof ConflictError) {
        conflictSlug = s
        break
      }
      throw e
    }
  }

  if (conflictSlug) return { manifest, conflictSlug, manifestSha: '' }
  const newSha = await putManifest(manifest, input.manifestSha, config)
  return { manifest, conflictSlug: null, manifestSha: newSha }
}
