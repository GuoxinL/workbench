import type { Article, Config, Manifest, ManifestEntry, Todo } from '@/types'
import { parseFrontmatter, serializeFrontmatter } from '@/lib/markdown/frontmatter'
import { TodoSchema } from '@/services/db/schema'
import { ConflictError, deleteFile, getFile, putFile, putFileBase64 } from './repoFile'
import { entryOf, getManifest, putManifest } from './manifest'
import { arrayBufferToBase64, sha256Hex } from '@/services/image/hash'

/**
 * 拉取远端**轻量索引**（manifest.json，单次请求，不含任何正文）。
 *
 * 索引驱动同步（P2 ⑤）的第一步：先只取索引，与本地做 LWW 比对定出差异 id，
 * 再按 id 差分 GET/PUT，避免每轮把全部 kb/todos 正文都拉一遍。
 */
export async function fetchManifest(config: Config): Promise<{ manifest: Manifest; sha: string } | null> {
  return getManifest(config)
}

/**
 * 按 id 差分拉取文章正文（`kb/<id>.md`，解析 frontmatter → Article）。
 * 墓碑条目不发请求：删除靠 manifest 索引传播，正文无需读取。
 */
export async function fetchArticles(
  ids: string[],
  index: Record<string, ManifestEntry>,
  config: Config,
): Promise<Article[]> {
  const out: Article[] = []
  for (const id of ids) {
    const entry = index[id]
    if (!entry || entry.deleted) continue
    const file = await getFile(`kb/${id}.md`, config)
    if (!file) continue
    const { data, content } = parseFrontmatter(file.content)
    out.push({
      id: entry.id,
      title: entry.title,
      content,
      fromTodo: String((data as any).fromTodo ?? ''),
      tags: Array.isArray((data as any).tags) ? ((data as any).tags as unknown[]).map(String) : [],
      createdAt: Number((data as any).createdAt ?? entry.updatedAt),
      updatedAt: entry.updatedAt,
      deleted: false,
      published: Boolean((data as any).publish),
    })
  }
  return out
}

/**
 * 按 id 差分拉取待办（`todos/<id>.json`，P1 ④ 的远端单文件化）。
 * 逐条经 Zod 校验：远端不可信，脏数据丢单条而非让整轮同步失败。
 */
export async function fetchTodos(
  ids: string[],
  index: Record<string, ManifestEntry>,
  config: Config,
): Promise<Todo[]> {
  const out: Todo[] = []
  for (const id of ids) {
    const entry = index[id]
    if (!entry || entry.deleted) continue
    const file = await getFile(`todos/${id}.json`, config)
    if (!file) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(file.content)
    } catch {
      continue // 远端文件损坏：跳过而非整轮同步失败
    }
    const ok = TodoSchema.safeParse(parsed)
    if (!ok.success) continue // 字段漂移/脏数据：丢弃单条，不污染 LWW 合并
    out.push({ ...ok.data, updatedAt: entry.updatedAt })
  }
  return out
}

export interface PushInput {
  /** 合并后的本地全量文章；实际只有 `articleIds` 命中的会被 PUT */
  articles: Article[]
  manifestSha: string | undefined
  /** 差分推送的文章 id 集合（P2 ⑤）；省略 = 全量推（首次同步 / 简单调用） */
  articleIds?: string[]
  /** 待办（P1 ④）：远端单文件化 todos/<id>.json；未传时不改动远端待办 */
  todos?: Todo[]
  /** 差分推送的待办 id 集合；省略 = 全量推 */
  todoIds?: string[]
  /**
   * 远端 manifest 基线：未被推送的条目**原样保留**（连同其 blob sha 与墓碑标记）。
   * 缺省则从空索引重建（等价于全量推）。
   */
  baseManifest?: Manifest
}

export interface PushResult {
  /** 成功推送后的新 manifest（含各文件 sha） */
  manifest: Manifest
  /** 发生冲突的 id；非 null 时表示需重新拉取合并后重试（S10） */
  conflictSlug: string | null
  /** 推送后 manifest.json 的 sha（供下次乐观锁，对应 S10） */
  manifestSha: string
}

/**
 * 差分推送本地数据到远端（P2 ⑤）：只 PUT `articleIds` / `todoIds` 命中的文件，
 * 再写一次 manifest.json。
 *
 * manifest 以 `baseManifest`（刚拉到的远端索引）为基线**增量覆盖**，而非由本地全量重建——
 * 这样未推送的条目会连同其 blob sha 与墓碑标记原样保留：既不会把 sha 洗成空串，
 * 也不会用本地陈旧副本把远端墓碑"复活"。墓碑本身照常推送（`deleted: true`），删除经索引传播。
 */
export async function pushRemote(input: PushInput, config: Config): Promise<PushResult> {
  const base = input.baseManifest
  const manifest: Manifest = {
    version: 1,
    updatedAt: Date.now(),
    articles: { ...(base?.articles ?? {}) },
    todos: { ...(base?.todos ?? {}) },
  }
  const articleIds = new Set(input.articleIds ?? input.articles.map((a) => a.id))
  const todoIds = new Set(input.todoIds ?? (input.todos ?? []).map((t) => t.id))
  let conflictSlug: string | null = null

  for (const a of input.articles) {
    if (!articleIds.has(a.id)) continue
    const s = a.id
    const baseSha = base?.articles[s]?.sha || undefined
    manifest.articles[s] = entryOf(a)
    const md = serializeFrontmatter(
      {
        id: a.id,
        title: a.title,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        deleted: a.deleted,
        fromTodo: a.fromTodo,
        tags: a.tags,
        publish: a.published ?? false,
      },
      a.content,
    )
    try {
      // 已存在文件需带远端 blob sha 才能更新；缺失则该文件视为新建（GitHub 对更新缺失 sha 返回 422）
      const sha = await putFile(`kb/${s}.md`, md, baseSha, config, `update ${a.title}`)
      manifest.articles[s].sha = sha
    } catch (e) {
      if (e instanceof ConflictError && baseSha === undefined) {
        // 文件可能已存在但未被 manifest 跟踪（如外部直写产生的孤儿文件）：
        // 取远端当前 blob sha 重试一次，避免 422「sha wasn't supplied」
        const cur = await getFile(`kb/${s}.md`, config)
        if (cur && cur.sha) {
          const sha = await putFile(`kb/${s}.md`, md, cur.sha, config, `update ${a.title}`)
          manifest.articles[s].sha = sha
          continue
        }
      }
      if (e instanceof ConflictError) {
        conflictSlug = s
        break
      }
      throw e
    }
  }

  for (const t of input.todos ?? []) {
    if (conflictSlug) break
    if (!todoIds.has(t.id)) continue
    const s = t.id
    const baseSha = base?.todos?.[s]?.sha || undefined
    manifest.todos![s] = entryOf(t)
    const json = JSON.stringify(t, null, 2)
    try {
      const sha = await putFile(`todos/${s}.json`, json, baseSha, config, `update todo ${t.title}`)
      manifest.todos![s].sha = sha
    } catch (e) {
      if (e instanceof ConflictError && baseSha === undefined) {
        // 同 kb 的孤儿文件兜底：远端已存在但未被 manifest 跟踪时，取当前 sha 重试一次
        const cur = await getFile(`todos/${s}.json`, config)
        if (cur && cur.sha) {
          const sha = await putFile(`todos/${s}.json`, json, cur.sha, config, `update todo ${t.title}`)
          manifest.todos![s].sha = sha
          continue
        }
      }
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

/** 构造公开镜像库用的 config：把 repo 换成 publicRepo，其余（token/apiBase/branch）沿用。 */
export function mirrorConfig(config: Config): Config | null {
  const owner = config.repo.split('/')[0]
  const publicRepo = config.publicRepo || `${owner}/workbench-public`
  if (!publicRepo || !/^[^/\s]+\/[^/\s]+$/.test(publicRepo)) return null
  return { ...config, repo: publicRepo }
}

/**
 * 把一张图片推到 git `images/<sha>.<ext>`（P2 ⑥ 同步模式），返回引用 key `images/<sha>.<ext>`。
 * key 由 blob 内容 SHA-256 决定 ⇒ 同图幂等，重复粘贴不会在仓库堆出多份；二进制经 base64 直传，不二次编码。
 */
export async function pushImage(blob: Blob, config: Config): Promise<string> {
  const buf = await blob.arrayBuffer()
  const hash = await sha256Hex(buf)
  const raw = blob.type.match(/image\/([a-zA-Z0-9.+-]+)/)?.[1] ?? 'png'
  const ext = raw.toLowerCase() === 'jpeg' ? 'jpg' : raw.toLowerCase()
  const path = `images/${hash}.${ext}`
  await putFileBase64(path, arrayBufferToBase64(buf), undefined, config, `add image ${path}`)
  return path
}

/** 从 git 删除一张图（P2 ⑥ 回收）；文件不存在时静默。 */
export async function deleteImage(key: string, config: Config): Promise<void> {
  if (!key.startsWith('images/')) return
  const file = await getFile(key, config)
  if (!file) return
  await deleteFile(key, file.sha, config, `remove image ${key}`)
}

/** 把单篇文章发布到公开镜像库（供 /share/:id 只读路由读取，公开无需 token）。 */
export async function publishToMirror(a: Article, config: Config): Promise<void> {
  const mc = mirrorConfig(config)
  if (!mc) throw new Error('未配置公开镜像仓库')
  const md = serializeFrontmatter(
    {
      id: a.id,
      title: a.title,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      fromTodo: a.fromTodo,
      tags: a.tags,
      publish: true,
    },
    a.content,
  )
  // 镜像库不跟踪 sha 乐观锁（单一作者写），取远端 sha 后 PUT
  const cur = await getFile(`kb/${a.id}.md`, mc)
  await putFile(`kb/${a.id}.md`, md, cur?.sha, mc, `publish ${a.title}`)
}

/** 从公开镜像库移除单篇文章（取消发布）。 */
export async function unpublishFromMirror(id: string, config: Config): Promise<void> {
  const mc = mirrorConfig(config)
  if (!mc) throw new Error('未配置公开镜像仓库')
  const cur = await getFile(`kb/${id}.md`, mc)
  if (!cur) return
  await deleteFile(`kb/${id}.md`, cur.sha, mc, `unpublish ${id}`)
}
