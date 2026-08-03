import { z } from 'zod'

/**
 * 运行时数据校验（§3.2 / 安全基线）：从本地 IndexedDB 或远端 GitHub（不可信）读回的
 * 实体都必须先经 Zod 校验，防止脏数据 / 字段漂移在 LWW 合并或分页时崩溃。
 * 编译期类型仍由 `@/types` 的 interface 保证，这里补的是"运行时"那一层。
 */

export const ColorKeySchema = z.enum(['blue', 'red', 'amber', 'green', 'purple', 'teal', 'pink', 'slate'])
export const TodoStatusSchema = z.enum(['todo', 'doing', 'done'])

export const TodoSchema = z.object({
  id: z.string(),
  title: z.string(),
  desc: z.string(),
  color: ColorKeySchema,
  status: TodoStatusSchema,
  due: z.string(),
  time: z.number(),
  articleId: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deleted: z.boolean(),
})
export type TodoInput = z.input<typeof TodoSchema>

export const ArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  fromTodo: z.string(),
  tags: z.array(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
  deleted: z.boolean(),
  published: z.boolean().optional(),
})
export type ArticleInput = z.input<typeof ArticleSchema>

/** 轻量索引导航（§4）：不存正文，仅维护有序 id 列表与每实体元信息，供分页与同步比对。 */
export interface DataIndexMeta {
  updatedAt: number
  deleted: boolean
  sha?: string
}
export interface DataIndex {
  total: number
  /** 有序 id 列表，按 updatedAt 倒序 */
  order: string[]
  meta: Record<string, DataIndexMeta>
}

export const DataIndexMetaSchema = z.object({
  updatedAt: z.number(),
  deleted: z.boolean(),
  sha: z.string().optional(),
})

export const DataIndexSchema = z.object({
  total: z.number(),
  order: z.array(z.string()),
  meta: z.record(z.string(), DataIndexMetaSchema),
})
