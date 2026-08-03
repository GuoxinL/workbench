import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDataStore } from '@/stores/data'

// 零配置启动集成测试（对应设计文档 §7.6「需求存在性证明」）。
//
// 关键策略：<b>不 mock 同步引擎</b>，使用真实 engine，验证即便真实引擎在零配置下
// 运行（engine.sync() / startPolling() / schedulePush() 全部真实触发），也绝不触达
// GitHub。仅在最底层拦截全局 fetch 作为「是否有网络请求离开浏览器」的机器化证据。
//
// 这正证明了 §7.3 的论断：零配置 → isConfigComplete===false → phase='off'，
// 仅本地路径生效 → 应用完整可运行，是架构不变量而非特例。

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  // 不写入任何 wb.cfg.v1 —— 模拟真正的「零配置」首次启动
  fetchSpy = vi.fn() // 永不应当被调用
  vi.stubGlobal('fetch', fetchSpy)
  setActivePinia(createPinia())
  vi.useFakeTimers() // 冻结 startPolling / schedulePush 的定时器，避免测试期间真实触发
})

afterEach(() => {
  vi.clearAllTimers()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// 让 store 启动时同步触发的 engine.sync() / schedulePush 微任务链跑完
async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('零配置启动集成测试（§7.6）', () => {
  it('零配置下引擎进入 off 态且不发起任何 GitHub 网络请求', async () => {
    const s = useDataStore()
    // doSync 在首个 await 前即因配置不完整而 setPhase('off') 提前返回
    expect(s.phase).toBe('off')
    await flushMicrotasks()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('零配置下本地功能完整可用（增删改 + 双向链接 + 标题联动 + 落盘）', async () => {
    const s = useDataStore()
    await flushMicrotasks()

    // ── Todo 增删改查 ──
    const t = s.addTodo({ title: '买菜' })
    expect(s.todos[0].title).toBe('买菜')
    s.updateTodo(t.id, { status: 'done' })
    expect(s.todos.find((x) => x.id === t.id)?.status).toBe('done')
    s.removeTodo(t.id)
    // 软删除后 todoById 会过滤墓碑，故直接查底层数组验证 tombstone
    expect(s.todos.find((x) => x.id === t.id)?.deleted).toBe(true)

    // ── Article + 双向链接 + 改名联动改写引用（L11）──
    const a1 = s.addArticle('Alpha')
    const a2 = s.addArticle('Beta')
    s.updateArticle(a2.id, { content: 'see [[Alpha]]' })
    s.updateArticle(a1.id, { title: 'Gamma' })
    const a2after = s.articleById(a2.id)!
    expect(a2after.content).toContain('[[Gamma]]')
    expect(a2after.content).not.toContain('[[Alpha]]')

    // ── 本地落盘验证 ──
    const raw = JSON.parse(localStorage.getItem('wb.data.v1') || '{}')
    expect(Array.isArray(raw.todos)).toBe(true)
    expect(Array.isArray(raw.articles)).toBe(true)

    // 整个过程中依然零网络请求
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('零配置下数据可跨重载恢复（本地持久化有效，仍无网络）', async () => {
    const s1 = useDataStore()
    s1.addTodo({ title: '持久化验证' })
    s1.addArticle('持久化文章')
    await flushMicrotasks()
    expect(fetchSpy).not.toHaveBeenCalled()

    // 模拟页面刷新：全新 store 实例从 localStorage 恢复
    setActivePinia(createPinia())
    const s2 = useDataStore()
    await flushMicrotasks()
    expect(s2.todos.some((t) => t.title === '持久化验证')).toBe(true)
    expect(s2.articles.some((a) => a.title === '持久化文章')).toBe(true)
    // 恢复过程同样不触达网络
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
