import type { Article, Todo } from '@/types'
import type { DataIndex } from './schema'

/** 实体种类：本机主存储（IndexedDB）按此路由到不同 object store。 */
export type EntityKind = 'todo' | 'article'

export interface ListResult<T> {
  items: T[]
  total: number
}

/**
 * DataLayer 接口（设计文档 §3.2）：视图 / 业务只面对此接口，不感知底层是 IndexedDB 还是远端。
 * P0 仅实现 IndexedDB 单实现；后续可加 GitHub 文件夹实现（或 StorageLayer 在其上做双写）。
 *
 * 注意：本实现索引的 `order` 一律按 `updatedAt` 倒序，分页即 `order.slice` 后逐 id 取实体，
 * 把"全量遍历"降为 O(页大小)（§4）。
 */
export interface DataLayer {
  saveTodo(t: Todo): Promise<void>
  saveArticle(a: Article): Promise<void>
  /** 批量写入（迁移 / 同步回写用），按 id upsert 并重建索引。 */
  saveAll(todos: Todo[], articles: Article[]): Promise<void>
  saveArticles(articles: Article[]): Promise<void>
  saveTodos(todos: Todo[]): Promise<void>

  getTodo(id: string): Promise<Todo | null>
  getArticle(id: string): Promise<Article | null>

  listTodo(page: number, size: number): Promise<ListResult<Todo>>
  listArticle(page: number, size: number): Promise<ListResult<Article>>

  /** 物理删除（IndexedDB 内）；软删墓碑由 store 置 deleted 后走 saveTodo/saveArticle。 */
  deleteTodo(id: string): Promise<void>
  deleteArticle(id: string): Promise<void>

  readIndex(kind: EntityKind): Promise<DataIndex>
  /** 两个 kind 的索引 total 均为 0 视为空库（用于决定是否从 localStorage 回填）。 */
  isEmpty(): Promise<boolean>
  clear(): Promise<void>
}
