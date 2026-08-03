/**
 * Vitest 全局测试 setup。
 * - fake-indexeddb/auto：jsdom 默认无 IndexedDB，store 初始化会打开 ImageStore / DataLayer，
 *   需注入浏览器兼容的 IDB 实现，否则 useDataStore() 在组件测试里抛错。
 * - 每个用例前 setActivePinia，使任何挂载的组件都能正常调用 useDataStore()。
 */
import 'fake-indexeddb/auto'
import { beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  // 释放当前 pinia 实例，避免跨用例状态泄漏
  setActivePinia(undefined)
})
