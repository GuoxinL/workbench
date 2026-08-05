export type ColorKey = 'blue' | 'red' | 'amber' | 'green' | 'purple' | 'teal' | 'pink' | 'slate'

export type TodoStatus = 'todo' | 'doing' | 'done'

export interface Todo {
  id: string
  title: string
  desc: string
  color: ColorKey
  status: TodoStatus
  due: string // 'YYYY-MM-DD'，空串表示无截止
  time: number // 用户可编辑的创建时间（ms），展示格式 2026/7/31 23:35:34
  articleId: string // 关联知识库文章 id，空串表示无
  createdAt: number
  updatedAt: number
  deleted: boolean // 软删除墓碑
}

export interface Article {
  id: string
  title: string
  content: string
  fromTodo: string // 来源待办 id
  tags: string[] // 知识库标签
  createdAt: number
  updatedAt: number
  deleted: boolean // 软删除墓碑
  published?: boolean // 是否发布到公开镜像库（只读分享）
}

/** 仅存本地，永不上传 */
export interface Config {
  enabled: boolean
  repo: string
  branch: string
  path: string
  token: string
  poll: number
  apiBase: string
  publicRepo?: string // 公开镜像仓库 owner/repo（只读分享用，默认推导）
}

export interface ManifestEntry {
  id: string
  title: string
  updatedAt: number
  deleted: boolean
  sha: string
}

/** 轻量索引导航（避免每次拉全量；per-file LWW 的 sha 缓存） */
export interface Manifest {
  version: 1
  updatedAt: number
  articles: Record<string, ManifestEntry>
  /** 待办的轻量索引（per-file LWW 的 sha 缓存）；旧远端 manifest 可能无此字段，故可选 */
  todos?: Record<string, ManifestEntry>
}

export interface WorkbenchData {
  version: 1
  todos: Todo[]
  articles: Article[]
  updatedAt: number
}

export type SyncPhase = 'idle' | 'off' | 'syncing' | 'uptodate' | 'ok' | 'error'
