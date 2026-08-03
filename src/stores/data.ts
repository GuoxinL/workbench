import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Article, ColorKey, Config, Manifest, SyncPhase, Todo, TodoStatus, WorkbenchData } from '@/types'
import { slug } from '@/lib/slug'
import { dedupTitle, renameRefs } from '@/lib/links'
import { cleanupTombstones } from '@/services/sync/serialize'
import { createSyncEngine, type SyncAdapter } from '@/services/sync/engine'
import {
  fetchArticles,
  fetchManifest,
  fetchTodos,
  publishToMirror,
  pushRemote,
  pushImage,
  deleteImage,
  unpublishFromMirror,
} from '@/services/github/contents'
import { createIndexedDBDataLayer, createImageStore } from '@/services/db'
import { createStorageLayer } from '@/services/storage/storageLayer'
import { createImageCloudLayer } from '@/services/image'

const DATA_KEY = 'wb.data.v1'
const MANIFEST_SHA_KEY = 'wb.manifestSha.v1'
const CFG_KEY = 'wb.cfg.v1'

/**
 * 本机主存储（IndexedDB）承载层（P0）。store 仍保留内存快照作为同步可用的快速视图，
 * 每次实体变更写穿透到 DataLayer（单实体存储 + 分页索引），对外暴露 listTodos/listArticles 分页。
 * wb.data.v1 继续作为即时加载持久层（零配置启动测试契约要求），IndexedDB 提供结构化 + 分页能力。
 */
const db = createIndexedDBDataLayer()

function emptyData(): WorkbenchData {
  return { version: 1, todos: [], articles: [], updatedAt: Date.now() }
}

/**
 * 一次性迁移：Note→Article 重命名后，旧 `wb.data.v1` 里待办的 `noteId`
 * 字段需映射为 `articleId`，否则历史关联会丢失。
 */
function migrateData(d: WorkbenchData): WorkbenchData {
  const todos = (d.todos ?? []).map((t: any) => {
    if (!t || typeof t !== 'object') return t
    const next = { ...t }
    // Note→Article 字段重命名（旧 wb.data.v1 兼容）
    if ('noteId' in next && !('articleId' in next)) {
      next.articleId = next.noteId
      delete next.noteId
    }
    // 新增可编辑 time 字段的兼容：缺省用 createdAt
    if (!('time' in next)) next.time = next.createdAt ?? Date.now()
    return next
  })
  return { ...d, todos }
}

function loadData(): WorkbenchData {
  try {
    const raw = localStorage.getItem(DATA_KEY)
    if (raw) {
      const d = JSON.parse(raw) as WorkbenchData
      if (d && Array.isArray(d.todos) && Array.isArray(d.articles)) {
        const migrated = migrateData(d)
        // 防止历史残留：当所有文章/待办均为墓碑时，清除以触发播种恢复
        // 正常情况（有存活 + 有墓碑）则保留墓碑供同步引擎做远端删除传播
        if (migrated.articles.length > 0 && !migrated.articles.some((a) => !a.deleted)) {
          migrated.articles = []
        }
        if (migrated.todos.length > 0 && !migrated.todos.some((t) => !t.deleted)) {
          migrated.todos = []
        }
        return migrated
      }
    }
  } catch {
    /* 损坏数据回落到空 */
  }
  return emptyData()
}

function loadConfig(): Config {
  try {
    const raw = localStorage.getItem(CFG_KEY)
    if (raw) return JSON.parse(raw) as Config
  } catch {
    /* 忽略 */
  }
  return { enabled: false, repo: '', branch: 'main', path: '', token: '', poll: 20000, apiBase: 'https://api.github.com' }
}

function loadManifestSha(): string | undefined {
  try {
    const raw = localStorage.getItem(MANIFEST_SHA_KEY)
    return raw ? raw : undefined
  } catch {
    return undefined
  }
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/**
 * LWW 合并：按 id 去重，updatedAt 大者胜出。
 * 用于响应同域其它标签页的 localStorage 变更时的无冲突合并。
 */
function mergeLWW<T extends { id: string; updatedAt: number }>(current: T[], incoming: T[]): T[] {
  const map = new Map<string, T>()
  for (const it of current) map.set(it.id, it)
  for (const it of incoming) {
    const old = map.get(it.id)
    if (!old || it.updatedAt > old.updatedAt) map.set(it.id, it)
  }
  return [...map.values()]
}

export const useDataStore = defineStore('data', () => {
  const data = ref<WorkbenchData>(loadData())
  const dirty = ref(false)
  const manifestSha = ref<string | undefined>(loadManifestSha())
  const phase = ref<SyncPhase>('idle')

  const todos = computed(() => data.value.todos)
  const articles = computed(() => data.value.articles)
  const articleById = (id: string) => data.value.articles.find((n) => n.id === id && !n.deleted)
  const todoById = (id: string) => data.value.todos.find((t) => t.id === id && !t.deleted)

  function persist() {
    data.value.updatedAt = Date.now()
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(cleanupTombstones(data.value)))
    } catch {
      /* 配额或不可用：忽略 */
    }
  }
  /** 标记脏并落盘（对应 store.js 的 commit/batch 后广播） */
  function touch() {
    dirty.value = true
    persist()
  }
  /** 批量变更：批内只触发一次持久化与脏标记（对应 batch()） */
  function batch(fn: () => void) {
    fn()
    touch()
  }
  function clearDirty() {
    dirty.value = false
  }

  // ── Todo ──────────────────────────────────────────────
  function addTodo(partial: Partial<Todo> = {}): Todo {
    const t: Todo = {
      id: uid(),
      title: partial.title ?? '',
      desc: partial.desc ?? '',
      color: (partial.color ?? 'blue') as ColorKey,
      status: (partial.status ?? 'todo') as TodoStatus,
      due: partial.due ?? '',
      time: partial.time ?? Date.now(),
      articleId: partial.articleId ?? '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deleted: false,
    }
    data.value.todos = [t, ...data.value.todos]
    touch()
    void storage.SaveTodo(t)
    return t
  }
  function updateTodo(id: string, patch: Partial<Todo>) {
    const i = data.value.todos.findIndex((t) => t.id === id)
    if (i < 0) return
    data.value.todos[i] = { ...data.value.todos[i], ...patch, updatedAt: Date.now() }
    touch()
    void storage.SaveTodo(data.value.todos[i])
  }
  function removeTodo(id: string) {
    const i = data.value.todos.findIndex((t) => t.id === id)
    if (i < 0) return
    data.value.todos[i] = { ...data.value.todos[i], deleted: true, updatedAt: Date.now() }
    touch()
    void storage.SaveTodo(data.value.todos[i])
  }

  // ── Article（知识库文章） ─────────────────────────────
  function addArticle(title?: string): Article {
    const base = title && title.trim() ? title.trim() : '未命名文章'
    const existing = data.value.articles.filter((n) => !n.deleted).map((n) => n.title)
    const finalTitle = dedupTitle(base, existing)
    const a: Article = {
      id: uid(),
      title: finalTitle,
      content: '',
      fromTodo: '',
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deleted: false,
    }
    data.value.articles = [a, ...data.value.articles]
    touch()
    void storage.SaveArticle(a)
    return a
  }
  /**
   * 改标题联动改引用（L11）。返回受影响的其它文章数量，供 toast 播报。
   */
  function updateArticle(id: string, patch: Partial<Article>): { affected: number } {
    const i = data.value.articles.findIndex((n) => n.id === id)
    if (i < 0) return { affected: 0 }
    const article = data.value.articles[i]
    let affected = 0
    let finalTitle: string = patch.title ?? article.title
    if (patch.title !== undefined && slug(patch.title) !== slug(article.title)) {
      // N8：改名撞已有标题时自动去重（"原名 (2)"）
      const others = data.value.articles.filter((n) => n.id !== id).map((n) => n.title)
      finalTitle = dedupTitle(patch.title, others, (i) => ` (${i})`)
    }
    const next: Article = { ...article, ...patch, title: finalTitle, updatedAt: Date.now() }
    if (patch.title !== undefined && slug(finalTitle) !== slug(article.title)) {
      const before = data.value.articles
      const renamed = renameRefs(
        article.title,
        finalTitle,
        before.filter((n) => n.id !== id),
      )
      affected = renamed.filter((r) => {
        const orig = before.find((o) => o.id === r.id)!
        return orig.content !== r.content
      }).length
      data.value.articles = before.map((n) => (n.id === id ? next : renamed.find((r) => r.id === n.id) ?? n))
    } else {
      data.value.articles = data.value.articles.map((n) => (n.id === id ? next : n))
    }
    touch()
    void storage.SaveArticle(next)
    return { affected }
  }
  function removeArticle(id: string) {
    const i = data.value.articles.findIndex((n) => n.id === id)
    if (i < 0) return
    data.value.articles[i] = { ...data.value.articles[i], deleted: true, updatedAt: Date.now() }
    // 解除关联待办的 articleId（N9）
    const detached = data.value.todos.filter((t) => t.articleId === id)
    data.value.todos = data.value.todos.map((t) =>
      t.articleId === id ? { ...t, articleId: '', updatedAt: Date.now() } : t,
    )
    touch()
    void storage.SaveArticle(data.value.articles[i])
    // 解绑的待办同样要落盘，否则本地 IDB / 远端仍保留失效的 articleId
    for (const t of detached) {
      const cur = data.value.todos.find((x) => x.id === t.id)
      if (cur) void storage.SaveTodo(cur)
    }
  }

  // ── 发布到公开镜像库（只读分享） ──────────────────────
  /** 设置文章发布状态：published=true 镜像 push 到公开库；false 移除。 */
  async function setPublished(id: string, published: boolean): Promise<void> {
    const i = data.value.articles.findIndex((n) => n.id === id)
    if (i < 0) return
    data.value.articles[i] = { ...data.value.articles[i], published, updatedAt: Date.now() }
    touch()
    void storage.SaveArticle(data.value.articles[i])
    const cfg = loadConfig()
    if (!cfg.token) return
    try {
      if (published) await publishToMirror(data.value.articles[i], cfg)
      else await unpublishFromMirror(id, cfg)
    } catch (e) {
      // 镜像失败不阻断本地保存；回滚 published 状态避免误导
      data.value.articles[i] = { ...data.value.articles[i], published: !published }
      touch()
      throw e
    }
  }

  // ── Todo → Article（X7） ─────────────────────────────
  function todoToArticle(todoId: string): Article | null {
    const t = todoById(todoId)
    if (!t) return null
    if (t.articleId) return articleById(t.articleId) ?? null
    const base = t.title.trim() || '未命名文章'
    const existing = data.value.articles.filter((n) => !n.deleted).map((n) => n.title)
    const title = dedupTitle(base, existing)
    const content = [t.desc ? t.desc : '', '', '## 记录', '', '## 关联', ''].join('\n')
    const a: Article = {
      id: uid(),
      title,
      content,
      fromTodo: todoId,
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deleted: false,
    }
    data.value.articles = [a, ...data.value.articles]
    updateTodo(todoId, { articleId: a.id })
    touch()
    void storage.SaveArticle(a)
    return a
  }

  // ── 同步适配器（SyncAdapter）：store 即本地数据源 ──────
  const adapter: SyncAdapter = {
    getConfig: () => loadConfig(),
    isEnabled: () => loadConfig().enabled,
    getLocalArticles: () => data.value.articles,
    getLocalTodos: () => data.value.todos,
    getLocalManifestSha: () => manifestSha.value,
    applyRemote(remoteArticles: Article[], _manifest: Manifest) {
      data.value.articles = remoteArticles
      persist()
      void db.saveArticles(remoteArticles)
    },
    applyRemoteTodos(remoteTodos: Todo[], _manifest: Manifest) {
      data.value.todos = remoteTodos
      persist()
      void db.saveTodos(remoteTodos)
    },
    setPhase: (p: SyncPhase) => {
      phase.value = p
    },
    setManifestSha: (sha: string) => {
      manifestSha.value = sha
      try {
        localStorage.setItem(MANIFEST_SHA_KEY, sha)
      } catch {
        /* 忽略 */
      }
    },
  }

  const engine = createSyncEngine(adapter, { fetchManifest, fetchArticles, fetchTodos, pushRemote })

  // P1 ③ StorageLayer：Todo/Article 共用「本地 IDB + 远端同步」双写路径，store 统一经它落盘/触发同步
  // P2 ⑥ 图云层：按 config 在「极简（本地 IDB）/ 同步（git images/）」间路由，作为图片存储唯一隔离面
  const imageStore = createImageStore()
  const cloud = createImageCloudLayer({
    imageStore,
    gitContents: { pushImage, deleteImage },
    getConfig: loadConfig,
  })
  const storage = createStorageLayer(db, () => engine.schedulePush(), cloud)

  // 启动：先拉一次远端（合并进本地缓存），再开启轮询
  engine.sync()
  engine.startPolling()

  // ── 配置（S1 / S17-S21） ───────────────────────────────
  function getConfig(): Config {
    return loadConfig()
  }
  function saveConfig(cfg: Config) {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify(cfg))
    } catch {
      /* 忽略 */
    }
    engine.stopPolling()
    engine.startPolling()
    engine.sync(true)
  }
  /** S19：导出备份为 workbench-YYYY-MM-DD.json */
  function exportBackup() {
    const json = JSON.stringify(cleanupTombstones(data.value), null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `workbench-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // X3：首次使用播种示例数据（3 篇互相引用的文章 + 4 条待办），仅一次
  function seedIfEmpty() {
    if (localStorage.getItem('wb.seeded')) return
    if (data.value.articles.length || data.value.todos.length) {
      localStorage.setItem('wb.seeded', '1')
      return
    }
    const a = addArticle('欢迎使用工作台')
    updateArticle(a.id, {
      content:
        '这是你的个人知识库。试着在正文里写 `[[双链说明]]` 来建立双向链接。\n\n- 支持 **Markdown** 与 ==高亮==\n- 改标题会自动改写所有引用（L11）',
    })
    const b = addArticle('双链说明')
    updateArticle(b.id, { content: '工作台的核心特色是 [[欢迎使用工作台]] 展示的双链；也可用 [[标签示例]]。' })
    const c = addArticle('标签示例')
    updateArticle(c.id, { content: '给文章打标签，在「标签」视图查看聚合。见 [[欢迎使用工作台]]。', tags: ['示例', '入门'] })
    addTodo({ title: '阅读欢迎文章', color: 'blue', status: 'todo' })
    addTodo({ title: '建立第一条双链', color: 'purple', status: 'doing' })
    addTodo({ title: '配置 GitHub 同步', color: 'amber', status: 'todo' })
    addTodo({ title: '已完成示例', color: 'green', status: 'done' })
    localStorage.setItem('wb.seeded', '1')
  }
  seedIfEmpty()

  // P0：首次使用时把历史 wb.data.v1 数据回填进 IndexedDB（单实体存储 + 分页索引），
  // 仅当 IDB 为空库才回填，避免覆盖已在 IDB 中的更新。失败静默忽略。
  void db
    .isEmpty()
    .then((empty) => {
      if (empty && (data.value.todos.length || data.value.articles.length)) {
        return db.saveAll(data.value.todos, data.value.articles)
      }
    })
    .catch(() => {})

  // T18：响应同域其它标签页的 localStorage 变更，LWW 合并避免竞态覆盖
  window.addEventListener('storage', (e) => {
    if (e.key !== DATA_KEY || !e.newValue) return
    try {
      const incoming = JSON.parse(e.newValue) as WorkbenchData
      if (!incoming || !Array.isArray(incoming.articles) || !Array.isArray(incoming.todos)) return
      data.value = {
        ...data.value,
        articles: mergeLWW(data.value.articles, incoming.articles),
        todos: mergeLWW(data.value.todos, incoming.todos),
        updatedAt: Date.now(),
      }
      // 不调 touch()/persist()，避免跨标签 ping-pong
    } catch {
      /* 忽略损坏数据 */
    }
  })

  // P0：分页读取（§4）——经 IndexedDB 索引驱动，避免全量遍历。供视图虚拟列表 / 远程按页拉取复用。
  function listTodos(page: number, size: number) {
    return db.listTodo(page, size)
  }
  function listArticles(page: number, size: number) {
    return db.listArticle(page, size)
  }

  // ── 图片（P2 ⑥ 图云层接入点） ───────────────────────
  /** 上传一张图片（粘贴/拖拽进编辑器时由视图调用），返回可引用 key（极简=local-img:<sha>，同步=images/<sha>）。 */
  function uploadImage(blob: Blob): Promise<string> {
    return cloud.put(blob)
  }
  /** 把图片 key 解析为可显示的 URL（本地生成 object URL，git 组装 raw 直链），供渲染 <img src>。 */
  function resolveImage(key: string): Promise<string> {
    return cloud.resolve(key)
  }

  return {
    data,
    dirty,
    phase,
    todos,
    articles,
    articleById,
    todoById,
    batch,
    clearDirty,
    addTodo,
    updateTodo,
    removeTodo,
    addArticle,
    updateArticle,
    removeArticle,
    setPublished,
    todoToArticle,
    listTodos,
    listArticles,
    uploadImage,
    resolveImage,
    sync: (manual = false) => engine.sync(manual),
    getConfig,
    saveConfig,
    exportBackup,
  }
})
