import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Article, Todo } from '@/types'
import { ArticleSchema, DataIndexSchema, TodoSchema, type DataIndex } from './schema'
import type { DataLayer, EntityKind, ListResult } from './types'

const DB_NAME = 'workbench'
const DB_VERSION = 1
const STORE_TODOS = 'todos'
const STORE_ARTICLES = 'articles'
const STORE_IMAGES = 'images'
const STORE_INDEX = 'index'

interface ImageRecord {
  key: string
  blob: Blob
  updatedAt: number
}

interface WBDB extends DBSchema {
  todos: { key: string; value: Todo }
  articles: { key: string; value: Article }
  images: { key: string; value: ImageRecord }
  index: { key: EntityKind; value: DataIndex }
}

let dbp: Promise<IDBPDatabase<WBDB>> | null = null

function getDB(): Promise<IDBPDatabase<WBDB>> {
  if (!dbp) {
    dbp = openDB<WBDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_TODOS)) db.createObjectStore(STORE_TODOS, { keyPath: 'id' })
        if (!db.objectStoreNames.contains(STORE_ARTICLES)) db.createObjectStore(STORE_ARTICLES, { keyPath: 'id' })
        if (!db.objectStoreNames.contains(STORE_IMAGES)) db.createObjectStore(STORE_IMAGES, { keyPath: 'key' })
        if (!db.objectStoreNames.contains(STORE_INDEX)) db.createObjectStore(STORE_INDEX)
      },
    })
  }
  return dbp
}

/** 任意 public 方法失败时吞掉异常并告警，避免写穿透的 rejection 打断 UI（IndexedDB 不可用时降级为静默）。 */
function swallow<T>(p: Promise<T>, label: string): Promise<T | void> {
  return p.catch((e) => {
    console.warn(`[db] ${label} 失败，已跳过：`, e)
  })
}

function emptyIndex(): DataIndex {
  return { total: 0, order: [], meta: {} }
}

async function readIndex(db: IDBPDatabase<WBDB>, kind: EntityKind): Promise<DataIndex> {
  const raw = await db.get(STORE_INDEX, kind)
  if (!raw) return emptyIndex()
  // 对索引本身也做校验，避免损坏数据导致分页计算崩溃
  const parsed = DataIndexSchema.safeParse(raw)
  return parsed.success ? parsed.data : emptyIndex()
}

async function writeIndex(db: IDBPDatabase<WBDB>, kind: EntityKind, idx: DataIndex): Promise<void> {
  await db.put(STORE_INDEX, idx, kind)
}

/** 写入实体后重算该 kind 的索引：order 按 updatedAt 倒序，meta 记录元信息。 */
async function reindex(db: IDBPDatabase<WBDB>, kind: EntityKind, entities: Array<{ id: string; updatedAt: number; deleted: boolean }>): Promise<void> {
  const idx = await readIndex(db, kind)
  for (const e of entities) {
    idx.meta[e.id] = { updatedAt: e.updatedAt, deleted: e.deleted }
  }
  idx.order = Object.entries(idx.meta)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .map(([id]) => id)
  idx.total = idx.order.length
  await writeIndex(db, kind, idx)
}

async function removeFromIndex(db: IDBPDatabase<WBDB>, kind: EntityKind, id: string): Promise<void> {
  const idx = await readIndex(db, kind)
  delete idx.meta[id]
  idx.order = idx.order.filter((x) => x !== id)
  idx.total = idx.order.length
  await writeIndex(db, kind, idx)
}

export function createIndexedDBDataLayer(): DataLayer {
  async function saveTodo(t: Todo): Promise<void> {
    const v = TodoSchema.parse(t) // 运行时校验，坏数据直接抛（被 swallow 捕获告警）
    const db = await getDB()
    await db.put(STORE_TODOS, v)
    await reindex(db, 'todo', [v])
  }

  async function saveArticle(a: Article): Promise<void> {
    const v = ArticleSchema.parse(a)
    const db = await getDB()
    await db.put(STORE_ARTICLES, v)
    await reindex(db, 'article', [v])
  }

  async function saveArticles(articles: Article[]): Promise<void> {
    if (!articles.length) return
    const db = await getDB()
    const valid = articles.map((a) => ArticleSchema.parse(a))
    const tx = db.transaction(STORE_ARTICLES, 'readwrite')
    await Promise.all(valid.map((a) => tx.objectStore(STORE_ARTICLES).put(a)))
    await tx.done
    await reindex(db, 'article', valid)
  }

  async function saveTodos(todos: Todo[]): Promise<void> {
    if (!todos.length) return
    const db = await getDB()
    const valid = todos.map((t) => TodoSchema.parse(t))
    const tx = db.transaction(STORE_TODOS, 'readwrite')
    await Promise.all(valid.map((t) => tx.objectStore(STORE_TODOS).put(t)))
    await tx.done
    await reindex(db, 'todo', valid)
  }

  async function saveAll(todos: Todo[], articles: Article[]): Promise<void> {
    const db = await getDB()
    const vTodos = todos.map((t) => TodoSchema.parse(t))
    const vArticles = articles.map((a) => ArticleSchema.parse(a))
    const tx = db.transaction([STORE_TODOS, STORE_ARTICLES, STORE_INDEX], 'readwrite')
    await Promise.all(vTodos.map((t) => tx.objectStore(STORE_TODOS).put(t)))
    await Promise.all(vArticles.map((a) => tx.objectStore(STORE_ARTICLES).put(a)))
    await reindex(db, 'todo', vTodos)
    await reindex(db, 'article', vArticles)
    await tx.done
  }

  async function getTodo(id: string): Promise<Todo | null> {
    const db = await getDB()
    const raw = await db.get(STORE_TODOS, id)
    return raw ? TodoSchema.parse(raw) : null
  }

  async function getArticle(id: string): Promise<Article | null> {
    const db = await getDB()
    const raw = await db.get(STORE_ARTICLES, id)
    return raw ? ArticleSchema.parse(raw) : null
  }

  async function listTodo(page: number, size: number): Promise<ListResult<Todo>> {
    const db = await getDB()
    const idx = await readIndex(db, 'todo')
    return paginate(db, STORE_TODOS, idx, page, size, TodoSchema)
  }

  async function listArticle(page: number, size: number): Promise<ListResult<Article>> {
    const db = await getDB()
    const idx = await readIndex(db, 'article')
    return paginate(db, STORE_ARTICLES, idx, page, size, ArticleSchema)
  }

  async function deleteTodo(id: string): Promise<void> {
    const db = await getDB()
    await db.delete(STORE_TODOS, id)
    await removeFromIndex(db, 'todo', id)
  }

  async function deleteArticle(id: string): Promise<void> {
    const db = await getDB()
    await db.delete(STORE_ARTICLES, id)
    await removeFromIndex(db, 'article', id)
  }

  async function readIndexPublic(kind: EntityKind): Promise<DataIndex> {
    return readIndex(await getDB(), kind)
  }

  async function isEmpty(): Promise<boolean> {
    const db = await getDB()
    const t = await readIndex(db, 'todo')
    const a = await readIndex(db, 'article')
    return t.total === 0 && a.total === 0
  }

  async function clear(): Promise<void> {
    const db = await getDB()
    await db.clear(STORE_TODOS)
    await db.clear(STORE_ARTICLES)
    await db.clear(STORE_INDEX)
  }

  // 写穿透：吞掉异常，避免 rejection 影响调用方
  const safe = (fn: (...args: any[]) => Promise<void>, label: string) => (...args: any[]) =>
    swallow(fn(...args), label)

  return {
    saveTodo: safe(saveTodo, 'saveTodo') as typeof saveTodo,
    saveArticle: safe(saveArticle, 'saveArticle') as typeof saveArticle,
    saveAll: safe(saveAll, 'saveAll') as typeof saveAll,
    saveArticles: safe(saveArticles, 'saveArticles') as typeof saveArticles,
    saveTodos: safe(saveTodos, 'saveTodos') as typeof saveTodos,
    getTodo,
    getArticle,
    listTodo,
    listArticle,
    deleteTodo: safe(deleteTodo, 'deleteTodo') as typeof deleteTodo,
    deleteArticle: safe(deleteArticle, 'deleteArticle') as typeof deleteArticle,
    readIndex: readIndexPublic,
    isEmpty,
    clear,
  }
}

/** 本地图片存储（P2 ⑥ 极简模式）：承载 paste/拖拽进来的二进制图片，key = local-img:<sha>。 */
export interface ImageStore {
  put(key: string, blob: Blob): Promise<void>
  get(key: string): Promise<Blob | null>
  delete(key: string): Promise<void>
}

let imageStoreInstance: ImageStore | null = null

/** 单例图片 store：复用同一 IndexedDB 连接（与 DataLayer 同库同版本）。 */
export function createImageStore(): ImageStore {
  if (imageStoreInstance) return imageStoreInstance
  const store: ImageStore = {
    async put(key, blob) {
      const db = await getDB()
      await db.put(STORE_IMAGES, { key, blob, updatedAt: Date.now() })
    },
    async get(key) {
      const db = await getDB()
      const r = await db.get(STORE_IMAGES, key)
      return r ? r.blob : null
    },
    async delete(key) {
      const db = await getDB()
      await db.delete(STORE_IMAGES, key)
    },
  }
  imageStoreInstance = store
  return store
}

async function paginate<T>(
  db: IDBPDatabase<WBDB>,
  store: 'todos' | 'articles',
  idx: DataIndex,
  page: number,
  size: number,
  schema: { parse: (x: unknown) => T },
): Promise<ListResult<T>> {
  const start = Math.max(0, (page - 1) * size)
  const ids = idx.order.slice(start, start + size)
  const raws = await Promise.all(ids.map((id) => db.get(store, id)))
  const items = raws.filter((x): x is NonNullable<typeof x> => x != null).map((x) => schema.parse(x))
  return { items, total: idx.total }
}
