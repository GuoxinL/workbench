import type { Article, Config, Todo } from '@/types'
import { parseFrontmatter, serializeFrontmatter, type FrontmatterValue } from '@/lib/markdown/frontmatter'
import { TodoSchema } from '@/services/db/schema'
import { ConflictError, deleteFile, getFile, putFile, putFileBase64 } from './repoFile'
import { GithubError } from './client'
import type { RemoteIndex } from './listDir'
import { arrayBufferToBase64, sha256Hex } from '@/services/image/hash'

/** 把文章序列化为 `kb/<id>.md` 的正文（frontmatter + 正文），与 pushRemote 写入字节一致。 */
export function serializeArticle(a: Article): string {
  const fm: Record<string, FrontmatterValue> = {
    id: a.id,
    title: a.title,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    deleted: a.deleted,
    fromTodo: a.fromTodo,
    tags: a.tags,
    publish: a.published ?? false,
  }
  // 仅转载文章写入来源字段，避免污染原创文章文件
  if (a.repost) {
    fm.repost = true
    fm.sourceAuthorized = a.sourceAuthorized ?? true
    fm.sourceAuthor = a.sourceAuthor ?? ''
    fm.sourceUrl = a.sourceUrl ?? ''
    if (a.sourceSite) fm.sourceSite = a.sourceSite
    if (a.sourcePublishedAt) fm.sourcePublishedAt = a.sourcePublishedAt
  }
  return serializeFrontmatter(fm, a.content)
}

/** 把待办序列化为 `todos/<id>.json`（确定性 JSON，供本地 sha 计算与远端写入共用）。 */
export function serializeTodo(t: Todo): string {
  return JSON.stringify(t, null, 2)
}

/** 现拉目录树索引（替代旧中央 manifest.json 读取）。实现见 ./listDir。 */
export type { RemoteIndex }

/**
 * 按 id 差分拉取文章正文（`kb/<id>.md`，解析 frontmatter → Article）。
 * 正文自带全部元数据（id/title/updatedAt/...），无需再依赖远端索引补充。
 * 墓碑条目由引擎层负责 DELETE，这里只拉存活文件（远端不存在则跳过）。
 */
export async function fetchArticles(ids: string[], config: Config): Promise<Article[]> {
  const out: Article[] = []
  for (const id of ids) {
    const file = await getFile(`kb/${id}.md`, config)
    if (!file) continue
    const { data, content } = parseFrontmatter(file.content)
    out.push({
      id: String((data as any).id ?? id),
      title: String((data as any).title ?? ''),
      content,
      fromTodo: String((data as any).fromTodo ?? ''),
      tags: Array.isArray((data as any).tags) ? ((data as any).tags as unknown[]).map(String) : [],
      createdAt: Number((data as any).createdAt ?? 0),
      updatedAt: Number((data as any).updatedAt ?? 0),
      deleted: Boolean((data as any).deleted),
      published: Boolean((data as any).publish),
      repost: Boolean((data as any).repost),
      sourceAuthorized:
        (data as any).sourceAuthorized != null ? Boolean((data as any).sourceAuthorized) : undefined,
      sourceAuthor: (data as any).sourceAuthor != null ? String((data as any).sourceAuthor) : undefined,
      sourceUrl: (data as any).sourceUrl != null ? String((data as any).sourceUrl) : undefined,
      sourceSite: (data as any).sourceSite != null ? String((data as any).sourceSite) : undefined,
      sourcePublishedAt:
        (data as any).sourcePublishedAt != null ? Number((data as any).sourcePublishedAt) : undefined,
    })
  }
  return out
}

/**
 * 按 id 差分拉取待办（`todos/<id>.json`）。
 * 逐条经 Zod 校验：远端不可信，脏数据丢单条而非让整轮同步失败。
 */
export async function fetchTodos(ids: string[], config: Config): Promise<Todo[]> {
  const out: Todo[] = []
  for (const id of ids) {
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
    out.push(ok.data)
  }
  return out
}

export interface PushInput {
  /** 合并后的本地全量文章；实际只有 `pushIds` / `conflicts` 命中的会被 PUT */
  articles: Article[]
  /** 需 PUT 的文章 id 集合（push + conflict 合并结果） */
  pushIds: string[]
  /** 合并后的本地全量待办；未传时不改动远端待办 */
  todos?: Todo[]
  /** 需 PUT 的待办 id 集合（push + conflict 合并结果） */
  todoPushIds?: string[]
  /** 需删除（远端已有、本地已软删）的文章 id 集合 */
  delIds: string[]
  /** 需删除的待办 id 集合 */
  todoDelIds?: string[]
  /**
   * 路径 → 当前远端 blob sha（乐观锁）：PUT/DELETE 带它才能更新；缺失视为新建（或孤儿文件兜底）。
   */
  treeShaByPath: Record<string, string>
}

export interface PushResult {
  /** 发生冲突的文件 path（非 null 时表示需重新拉取合并后重试） */
  conflictSlug: string | null
  /** 成功 PUT 的文件：path → 新 blob sha（供更新本地基线） */
  shaByPath: Record<string, string>
  /** 成功 DELETE 的文件 path 列表 */
  deletedPaths: string[]
}

/**
 * 差分推送本地数据到远端：只 PUT `pushIds` / `todoPushIds` 命中的文件，DELETE `delIds` 命中的文件。
 *
 * 乐观锁来自 `treeShaByPath`（刚拉到的目录树 sha），而非任何中央文件——这是消除
 * manifest.json 写入热点的关键：每次同步从「写 1 个大索引」变成「只写真正变化的 N 个独立文件」。
 */
export async function pushRemote(input: PushInput, config: Config): Promise<PushResult> {
  const shaByPath: Record<string, string> = {}
  const deletedPaths: string[] = []
  const articleById = new Map(input.articles.map((a) => [a.id, a]))
  let conflictSlug: string | null = null

  for (const id of input.pushIds) {
    const a = articleById.get(id)
    if (!a) continue
    const path = `kb/${id}.md`
    const lockSha = input.treeShaByPath[path]
    try {
      shaByPath[path] = await putFile(path, serializeArticle(a), lockSha, config, `update ${a.title}`)
    } catch (e) {
      if (e instanceof ConflictError && !lockSha) {
        // 孤儿文件兜底：远端已存在但未被目录树跟踪（理论上不会，因我们现拉索引），取当前 sha 重试一次
        const cur = await getFile(path, config)
        if (cur?.sha) {
          shaByPath[path] = await putFile(path, serializeArticle(a), cur.sha, config, `update ${a.title}`)
          continue
        }
      }
      if (e instanceof ConflictError) {
        conflictSlug = path
        break
      }
      throw e
    }
  }

  const todoById = new Map((input.todos ?? []).map((t) => [t.id, t]))
  for (const id of input.todoPushIds ?? []) {
    if (conflictSlug) break
    const t = todoById.get(id)
    if (!t) continue
    const path = `todos/${id}.json`
    const lockSha = input.treeShaByPath[path]
    try {
      shaByPath[path] = await putFile(path, serializeTodo(t), lockSha, config, `update todo ${t.title}`)
    } catch (e) {
      if (e instanceof ConflictError && !lockSha) {
        const cur = await getFile(path, config)
        if (cur?.sha) {
          shaByPath[path] = await putFile(path, serializeTodo(t), cur.sha, config, `update todo ${t.title}`)
          continue
        }
      }
      if (e instanceof ConflictError) {
        conflictSlug = path
        break
      }
      throw e
    }
  }

  for (const id of input.delIds) {
    if (conflictSlug) break
    const path = `kb/${id}.md`
    const lockSha = input.treeShaByPath[path]
    if (!lockSha) continue // 远端已无该文件，无需删除
    try {
      await deleteFile(path, lockSha, config, `delete ${id}`)
      deletedPaths.push(path)
    } catch (e) {
      if (e instanceof GithubError && e.code === 'notfound') {
        deletedPaths.push(path) // 已被删，等同成功
        continue
      }
      if (e instanceof ConflictError) {
        conflictSlug = path
        break
      }
      throw e
    }
  }

  for (const id of input.todoDelIds ?? []) {
    if (conflictSlug) break
    const path = `todos/${id}.json`
    const lockSha = input.treeShaByPath[path]
    if (!lockSha) continue
    try {
      await deleteFile(path, lockSha, config, `delete todo ${id}`)
      deletedPaths.push(path)
    } catch (e) {
      if (e instanceof GithubError && e.code === 'notfound') {
        deletedPaths.push(path)
        continue
      }
      if (e instanceof ConflictError) {
        conflictSlug = path
        break
      }
      throw e
    }
  }

  return { conflictSlug, shaByPath, deletedPaths }
}

/** 构造公开镜像库用的 config：把 repo 换成 publicRepo，其余（token/apiBase/branch）沿用。 */
export function mirrorConfig(config: Config): Config | null {
  const owner = config.repo.split('/')[0]
  const publicRepo = config.publicRepo || `${owner}/workbench-public`
  if (!publicRepo || !/^[^/\s]+\/[^/\s]+$/.test(publicRepo)) return null
  return { ...config, repo: publicRepo }
}

/**
 * 把一张图片推到 git `images/<sha>.<ext>`，返回引用 key `images/<sha>.<ext>`。
 * 内容寻址 ⇒ 同图幂等；不进索引，与文章/待办同步路径互不干扰。
 */
export async function pushImage(blob: Blob, config: Config): Promise<string> {
  const buf = await blob.arrayBuffer()
  const hash = await sha256Hex(buf)
  const raw = blob.type.match(/image\/([a-zA-Z0-9.+-]+)/)?.[1] ?? 'png'
  const ext = raw.toLowerCase() === 'jpeg' ? 'jpg' : raw.toLowerCase()
  const path = `images/${hash}.${ext}`
  // 图片二进制经 base64 直传，不二次编码；不进索引，与文章/待办同步路径互不干扰
  await putFileBase64(path, arrayBufferToBase64(buf), undefined, config, `add image ${path}`)
  return path
}

/** 从 git 删除一张图；文件不存在时静默。 */
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
  const md = serializeArticle(a)
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
