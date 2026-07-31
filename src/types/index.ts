export type ColorKey = 'blue' | 'red' | 'amber' | 'green' | 'purple' | 'teal' | 'pink' | 'slate'

export type TodoStatus = 'todo' | 'doing' | 'done'

export interface Todo {
  id: string
  title: string
  desc: string
  color: ColorKey
  status: TodoStatus
  due: string // 'YYYY-MM-DD'，空串表示无截止
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
  todosSha: string
}

export interface WorkbenchData {
  version: 1
  todos: Todo[]
  articles: Article[]
  updatedAt: number
}

export type SyncPhase = 'idle' | 'syncing' | 'ok' | 'error' | 'off'
