import { describe, expect, it, vi } from 'vitest'
import { createStorageLayer } from '../storageLayer'
import type { DataLayer } from '@/services/db'
import type { ImageCloudLayer } from '@/services/image'
import type { Article, Todo } from '@/types'

const todo: Todo = {
  id: 't1',
  title: '待办甲',
  desc: '',
  color: 'blue',
  status: 'todo',
  due: '',
  time: 1,
  articleId: '',
  createdAt: 1,
  updatedAt: 1,
  deleted: false,
}

const article: Article = {
  id: 'a1',
  title: '文章甲',
  content: '',
  fromTodo: '',
  tags: [],
  createdAt: 1,
  updatedAt: 1,
  deleted: false,
}

/** 内存版 DataLayer 替身：只实现 StorageLayer 用到的方法，其余抛错以暴露越界调用。 */
function fakeDataLayer(over: Partial<DataLayer> = {}) {
  const todos = new Map<string, Todo>()
  const articles = new Map<string, Article>()
  const layer: DataLayer = {
    saveTodo: vi.fn(async (t: Todo) => void todos.set(t.id, t)),
    saveArticle: vi.fn(async (a: Article) => void articles.set(a.id, a)),
    getTodo: vi.fn(async (id: string) => todos.get(id) ?? null),
    getArticle: vi.fn(async (id: string) => articles.get(id) ?? null),
    listTodo: vi.fn(async () => ({ items: [...todos.values()], total: todos.size })),
    listArticle: vi.fn(async () => ({ items: [...articles.values()], total: articles.size })),
    saveAll: vi.fn(),
    saveArticles: vi.fn(),
    saveTodos: vi.fn(),
    deleteTodo: vi.fn(),
    deleteArticle: vi.fn(),
    readIndex: vi.fn(),
    isEmpty: vi.fn(),
    clear: vi.fn(),
  } as unknown as DataLayer
  return Object.assign(layer, over)
}

/** 内存版图云层替身：记录 put/delete 调用。 */
function fakeCloud() {
  return {
    put: vi.fn(async (_b: Blob) => `images/fake-${Math.random().toString(36).slice(2)}`),
    delete: vi.fn(async (_k: string) => {}),
    resolve: vi.fn(async (k: string) => k),
  } satisfies ImageCloudLayer & { put: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> }
}

// 一个可被 data: 还原的最小 1x1 png（base64 仅用于测试，不要求合法 png）
const SAMPLE_PNG = 'iVBORw0KGgo='

describe('StorageLayer 双写（P1 ③）', () => {
  it('SaveTodo / SaveArticle 都是「写本地 + 触发远端同步」同一条路径', async () => {
    const db = fakeDataLayer()
    const push = vi.fn()
    const cloud = fakeCloud()
    const storage = createStorageLayer(db, push, cloud)

    await storage.SaveTodo(todo)
    await storage.SaveArticle(article)

    expect(db.saveTodo).toHaveBeenCalledWith(todo)
    expect(db.saveArticle).toHaveBeenCalledWith(article)
    expect(push).toHaveBeenCalledTimes(2)
  })

  it('Delete* 写入墓碑而非物理删除，并触发同步（软删可传播）', async () => {
    const db = fakeDataLayer()
    const push = vi.fn()
    const cloud = fakeCloud()
    const storage = createStorageLayer(db, push, cloud)
    await storage.SaveTodo(todo)
    push.mockClear()

    await storage.DeleteTodo(todo.id)

    const saved = (db.saveTodo as any).mock.calls.at(-1)[0] as Todo
    expect(saved.deleted).toBe(true)
    expect(saved.updatedAt).toBeGreaterThanOrEqual(todo.updatedAt)
    expect(db.deleteTodo).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledTimes(1)
  })

  it('本地不可用时静默降级，仍触发同步（不抛给调用方）', async () => {
    const db = fakeDataLayer({
      saveArticle: vi.fn(async () => {
        throw new Error('IDB 不可用')
      }),
      getArticle: vi.fn(async () => {
        throw new Error('IDB 不可用')
      }),
    })
    const push = vi.fn()
    const cloud = fakeCloud()
    const storage = createStorageLayer(db, push, cloud)

    await expect(storage.DeleteArticle('a1')).resolves.toBeUndefined()
    expect(push).toHaveBeenCalledTimes(1)
  })

  it('同步引擎异常不阻断本地写入', async () => {
    const db = fakeDataLayer()
    const cloud = fakeCloud()
    const storage = createStorageLayer(db, () => {
      throw new Error('引擎异常')
    }, cloud)

    await expect(storage.SaveTodo(todo)).resolves.toBeUndefined()
    expect(db.saveTodo).toHaveBeenCalled()
  })

  it('List* 透传到 DataLayer 分页（不做二次过滤）', async () => {
    const db = fakeDataLayer()
    const cloud = fakeCloud()
    const storage = createStorageLayer(db, vi.fn(), cloud)
    await storage.SaveArticle(article)

    const r = await storage.ListArticle(1, 10)
    expect(r.total).toBe(1)
    expect(db.listArticle).toHaveBeenCalledWith(1, 10)
  })
})

describe('StorageLayer 图片协调（P2 ⑥ §6）', () => {
  it('SaveArticle 把内嵌 data: 图上传并替换为 key，本地落盘的是 key 而非 base64', async () => {
    const db = fakeDataLayer()
    const cloud = fakeCloud()
    const storage = createStorageLayer(db, vi.fn(), cloud)
    const a: Article = { ...article, content: `![x](data:image/png;base64,${SAMPLE_PNG})` }

    await storage.SaveArticle(a)

    expect(cloud.put).toHaveBeenCalledTimes(1)
    const saved = (db.saveArticle as any).mock.calls.at(-1)[0] as Article
    expect(saved.content).not.toContain('data:image')
    expect(saved.content).toMatch(/!\[\]\(images\/fake-/)
  })

  it('SaveArticle 删除正文里被丢弃的图片引用（孤儿回收）', async () => {
    const db = fakeDataLayer()
    // 旧版本正文含一张图
    await db.saveArticle({ ...article, content: '![x](images/old.png)' })
    const cloud = fakeCloud()
    const storage = createStorageLayer(db, vi.fn(), cloud)

    await storage.SaveArticle({ ...article, content: 'no image now' })

    expect(cloud.delete).toHaveBeenCalledWith('images/old.png')
  })

  it('SaveTodo 同样协调 desc 里的图片（删除被丢弃引用）', async () => {
    const db = fakeDataLayer()
    await db.saveTodo({ ...todo, desc: '![x](images/old.png)' })
    const cloud = fakeCloud()
    const storage = createStorageLayer(db, vi.fn(), cloud)

    await storage.SaveTodo({ ...todo, desc: '' })

    expect(cloud.delete).toHaveBeenCalledWith('images/old.png')
  })

  it('DeleteArticle 仅置墓碑，不删图（软删 + 后续 GC，避免误删共享图）', async () => {
    const db = fakeDataLayer()
    await db.saveArticle({ ...article, content: '![x](images/keep.png)' })
    const cloud = fakeCloud()
    const storage = createStorageLayer(db, vi.fn(), cloud)

    await storage.DeleteArticle('a1')

    expect(cloud.delete).not.toHaveBeenCalled()
    const saved = (db.saveArticle as any).mock.calls.at(-1)[0] as Article
    expect(saved.deleted).toBe(true)
  })
})
