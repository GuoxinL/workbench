# 单元测试规范（环境 / 生成 / 运行调试）

> 让任意成员（或 AI Agent）能在本项目把单元测试**搭得起、写得对、跑得通、出错查得到**。
> 三段式结构：① 环境搭建 / ② 生成规范 / ③ 运行调试。
>
> **当前技术栈**：Vue3 + Vite8 + TypeScript + Pinia + Vitest4（jsdom + fake-indexeddb）。测试运行器是 **Vitest**，不是 `node:test`、不是 Jest、不是浏览器内 `test.html`。本文即当前基线。
>
> **与集成测试的边界**（详见 `integration_test/integration_test.md`）：
> - 单元测试（本文）：**函数 / 模块 / store 级**，被测对象是 ES Module 导出的纯函数、`@/services/*` 逻辑、`@/stores/data` 状态机；`fetch` 一律 `vi.stubGlobal` 替身，`localStorage`/`IndexedDB` 用真实内存实现（jsdom + fake-indexeddb），**不**起真实浏览器、**不**打真实 GitHub API。
> - 集成测试（`integration_test/integration_test.md`）：用 `web-access` 技能驱动真实浏览器（CDP）→ 真实 store/localStorage/IndexedDB → 真实 GitHub Contents API → 真实数据仓库（`kb/<id>.md` + `todos/<id>.json`，目录树每文件 blob sha 索引，无中央 `manifest.json`）的**端到端链路**。
>
> **若仓库出现 `.codebuddy/rules/unittest_*.md`，那是权威来源**：本文以承接 + 链接形式呈现，不另起冲突。
> 2026-08-04 核查：`ls .codebuddy/rules/` 不存在该目录，故本文即当前基线。

> Source：`vite.config.ts`、`src/test/setup.ts`、`package.json`、`src/services/github/__tests__/diagnose.test.ts`、`src/services/sync/__tests__/merge.test.ts`、`src/stores/__tests__/zero-config-startup.test.ts`、AGENTS.md（红线 4/5）
> Last-verified: 2026-08-04（对应 commit `3c64351`）；结论均由实机执行核验，非推断

---

## 一、环境搭建与依赖安装

### 0. 当前自动化现状（如实记录，勿据此臆造命令）

2026-08-04 全量核查结论：

| 核查项 | 结论 | 证据 |
|--------|------|------|
| 测试框架 | **Vitest 4**（jsdom 环境） | `package.json` `devDependencies` 含 `vitest@4`；`vite.config.ts` `test.environment: 'jsdom'` |
| 运行命令 | **`npm test`** → `vitest run` | `package.json` `scripts.test: "vitest run"`；另有 `test:watch` |
| 类型检查 | **`npm run type-check`** → `vue-tsc --noEmit` | `package.json` `scripts.type-check` |
| 既有测试用例 | **有，且持续增多** | `src/**/__tests__/*.test.ts` 共 30 个文件（见 §一.4 清单） |
| 断言库 | Vitest 内置 `expect`（chai 风格） | 所有 `.test.ts` 直接 `import { describe, it, expect } from 'vitest'` |
| 替身能力 | `vi.fn` / `vi.stubGlobal` / `vi.useFakeTimers` | `diagnose.test.ts` 用 `vi.stubGlobal('fetch', ...)` |
| IDB 实现 | `fake-indexeddb/auto` | `src/test/setup.ts:7` 全局注入 |
| 覆盖率工具 | Vitest 内置（`--coverage`），**当前未设门槛** | `vite.config.ts` 无 `test.coverage` 配置；CI 未接入 |
| CI 流水线 | **有**（`.github/workflows/deploy.yml`） | `push main` → `npm ci` → `npm run build` → Pages 发布；⚠️ **未接入 `npm test`**（见 §三.6） |

> **结论**：本项目单元测试已落地，不是「零用例」。核心合并算法（`mergeInto`）、序列化、GitHub 诊断（`diagnose`）、store 状态机、Markdown 渲染、双链解析均有覆盖。本文给出的是**既成事实的运行方式**，不是「建议 / 待定」。

### 1. 前置事实：模块是 ES Module，决定单测怎么写

源码全部是 **ES Module**（`export` / `import`），通过 Vite 的 `@` 别名（`@` → `src`）引用；**没有** `window.WB`、`js/*.js` IIFE、全局命名空间。典型导入：

```ts
import { mergeInto } from '@/services/sync/merge'        // 纯函数
import { useDataStore } from '@/stores/data'             // Pinia store
import { runDiagnose, testConnection } from '@/services/github/diagnose'
import type { Config, WorkbenchData, Todo, Article } from '@/types'
```

**被测对象可独立 import**，无需像旧架构那样用 shim 逐个求值 `js/*.js`。直接在 `.test.ts` 里 `import { fn } from '@/...'` 即可。

### 2. 环境组成（均已就位，无需额外安装）

| 层 | 来源 | 作用 |
|----|------|------|
| 运行器 | `vitest`（devDependency） | `npm test` 启动；jsdom 环境默认提供 `document` / `localStorage` |
| 全局 setup | `src/test/setup.ts`（`vite.config.ts` `test.setupFiles`） | 注入 `fake-indexeddb/auto`；`beforeEach` 建 Pinia（`setActivePinia(createPinia())`），`afterEach` 释放（`setActivePinia(undefined)`） |
| 路径别名 | `vite.config.ts` `resolve.alias['@'] = src` + `vitest` 复用同一配置 | 测试中 `@/...` 解析正常 |
| IDB | `fake-indexeddb/auto`（setup 中 `import 'fake-indexeddb/auto'`） | jsdom 无 IndexedDB，注入浏览器兼容实现；store 初始化打开 ImageStore / DataLayer 不报错 |
| Pinia | `pinia`（dependency） | store 测试靠 `setActivePinia` 提供活动实例 |
| 组件测试 | `@vue/test-utils` | `MilkdownEditor.*.test.ts`、`ArticleEditor.test.ts`、`LinksPanel.test.ts` 用 `mount()` |

> **无需** `node:test`、**无需** `python3 -m http.server`、**无需** `bump-version.sh`（该脚本已随 2026-07-31 重构移除，Vite 产物自带内容哈希）。

### 3. 环境变量与配置

**单元测试不需要任何环境变量、不需要真实 Token、不需要真实仓库名**。

- 配置载体是 `localStorage` 的 `wb.cfg.v1`（含 `token`）；测试一律用 fixture `Config` 对象（`repo: 'o/r'`、`token: 't'` 这类占位值），**绝不**写入或读取真实 `wb.cfg.v1`（AGENTS.md 红线 5：Token 只存浏览器配置，不落日志、不进源码）。
- 网络一律 `vi.stubGlobal('fetch', vi.fn(...))` 替身；`afterEach` 用 `vi.unstubAllGlobals()` 复位。
- 时间相关断言用 fixture 显式时间戳（`updatedAt` / `createdAt`），或 `vi.useFakeTimers()`，避免依赖真实 `Date.now()` 的精确毫秒。

### 4. 既有测试用例清单（2026-08-04，供对齐、勿重复造轮）

路径规则：与被测模块同目录的 `__tests__/` 子目录，命名 `<被测>.test.ts`。

| 领域 | 文件 | 关键被测 |
|------|------|---------|
| lib/markdown | `frontmatter`、`excerpt`、`mark-missing`、`scan-wikilinks`、`serialize-roundtrip`、`render`、`paste-image` | frontmatter 解析 / 摘要 / 缺失链接标记 / 双链扫描 / 序列化往返 / 渲染 / 粘贴图 |
| lib | `slug`、`datetime`、`links` | slug 规则 / 时间分档 / 双链解析 |
| services/github | `diagnose`、`client`、`repoFile`、`contents`、`manifest`、`images` | 连接诊断 / 客户端 / 文件读写 / Contents API / manifest / 图片上传 |
| services/sync | `serialize`、`merge`、`engine` | 序列化（墓碑清理）/ 合并（LWW）/ 同步引擎（off 守卫 / diff / retry） |
| services/storage | `storageLayer` | 双写 + 调度推送 + 软删除墓碑 + 图协调 |
| services/db | `indexeddb` | IndexedDB 数据层 |
| services/image | `cloud` | 图云层路由（极简 / 同步） |
| stores | `data`、`zero-config-startup` | store 状态机 / 零配置 off 不触网 |
| components/kb | `LinksPanel`、`MilkdownEditor.serialize`、`MilkdownEditor.toolbar-rightclick`、`MilkdownEditor.contextmenu-api`、`MilkdownEditor.format-toolbar`、`ArticleEditor` | 组件渲染 + 交互 |

> 新增用例**追加**到对应 `__tests__/`，命名沿用 `<被测>.test.ts`；**不删除**已有测试。

---

## 二、单元测试生成规范

### 1. 通用强制条款（红线）

| # | 红线 | 为什么 |
|---|------|--------|
| 1 | **不修改被测业务代码以让测试通过** | 测试是照妖镜，不是化妆品 |
| 2 | **不引入未经评估的 npm 依赖** | Vitest/jsdom/fake-indexeddb/@vue/test-utils 已在 `package.json`；新增需评估并在 `package.json` 登记 |
| 3 | **不发起真实网络请求**：`fetch` 必须 `vi.stubGlobal` 替身 | UT 不碰真实链路；真实往返归集成测试 |
| 4 | **不读写真实 `wb.cfg.v1` / 不硬编码真实 Token** | 红线 5：Token 只存浏览器配置；用例用 fixture `token:'t'` |
| 5 | **不在用例间共享可变状态**：store 测试每次 `setActivePinia(createPinia())`；`fetch` 替身 `afterEach` 复位 | 避免跨用例串味（见 `src/test/setup.ts` 与 `zero-config-startup.test.ts`） |
| 6 | **不删除已有测试，只追加** | 保护既有覆盖 |
| 7 | **不硬编码真实仓库名 / 分支 / 路径**（除 `repo:'o/r'` 这类占位） | 避免误触真实数据仓库 |
| 8 | **不 monkey-patch 生产函数内部**（如直接改写 `useDataStore` 成员） | 会掩盖真实回归；依赖从入参或全局替身注入 |
| 同 §一.5 边界 | store 测试中**可启用真实同步引擎**，仅在最底层拦截 `fetch` 作为「是否离网」的机器化证据（见 `zero-config-startup.test.ts`） | 验证零配置 → `phase==='off'` 不触网，是架构不变量而非 mock 出来的假象 |

### 2. UT / IT 分层边界（禁止重叠）

| 被测对象 | 归属 | 判据 |
|---------|------|------|
| `mergeInto`（LWW 合并）/ `serialize`（墓碑清理）/ `scan-wikilinks` / `slug` / `render` / `frontmatter` 解析 | **UT** | 纯函数，输入→输出，无真实外部依赖 |
| `storageLayer` 双写 / 软删除 / 图协调 | **UT** | 内存态 + IDB（fake-indexeddb），`fetch` 替身 |
| `useDataStore` 增删改 + 双链标题联动改写 + 落盘 | **UT**（用真实引擎 + fetch 替身） | 状态机 + 本地持久化，验证「零配置不触网」 |
| `diagnose.runDiagnose` / `testConnection` / `client` / `contents` / `manifest` / `images` | **UT**（`fetch` 替身）或 **IT**（真实 API） | 网络分支用 `vi.stubGlobal('fetch', ...)` 覆盖；真实配额 / 多端一致性归 IT |
| `MilkdropEditor` / `ArticleEditor` / `LinksPanel` 组件渲染与交互 | **UT**（jsdom + `@vue/test-utils`） | 真实 DOM（jsdom）即可，无需真实浏览器 |
| 顶栏同步状态芯片、设置抽屉、`SettingsSheet`、跨端同步一致性、真实 GitHub 链路 | **IT** | 见 `integration_test/integration_test.md` |

> **重叠红线**：任何「打真实 GitHub API / 起真实浏览器」的场景**一律不写进 UT**；任何「纯函数输入输出」的场景**一律不写进 IT**。

### 3. 优先单测模块清单（按投入产出比，当前已部分覆盖）

> 依据 `architecture.md` §12 技术债与 `failures.md`——合并算法回归会**静默丢数据**，且多端异步场景人工极难复现，故排第一。

| 优先级 | 模块 / 函数 | 代码位置 | 必测点 |
|--------|------------|---------|--------|
| **P0** | `mergeInto` | `@/services/sync/merge` | 远端有本地无→插入；两端都有且远端 `updatedAt` 大→覆盖；本地更新→保留本地；相等 `updatedAt`→保留本地；墓碑（`deleted:true`）随 LWW 传播；合并后按 `createdAt` 倒序；无变更返回 `merged:false` |
| **P0** | `serialize` | `@/services/sync/serialize` | 过期墓碑清理、未过期墓碑保留、未删除记录全保留；输出字段**绝不含** `cfg`/`token`（红线 5 机器化守卫） |
| **P0** | `engine.doSync` 的 off 守卫 | `@/services/sync/engine` | `!isEnabled()` 或 `!isConfigComplete(cfg)` → `phase='off'`，**不发起任何 fetch**（见 `zero-config-startup.test.ts`） |
| **P0** | `diagnose.testConnection` 配置守卫 | `@/services/github/diagnose` | 配置不完整 → `{ok:false,code:'config'}`，**fetch 不被调用**（零配置不触网） |
| **P1** | `scan-wikilinks` / `extractImageKeys` / `isManagedImageKey` | `@/lib/markdown`、`@/services/image` | `[[标题]]` / `[[标题\|别名]]` 两种形态；图片 key 识别与提取 |
| **P1** | `render`（Markdown→HTML）转义链 | `@/lib/markdown/render` | `<script>` / `"` / `'` 输入渲染后不产生可执行标签；DOMPurify 兜底 |
| **P1** | `slug` | `@/lib/slug` | trim + 小写 + 连续空白折叠为单空格（双链寻址键，改动即断链） |
| **P1** | `storageLayer` 双写 + 软删除 | `@/services/storage/storageLayer` | 写 IndexedDB 立即落盘 + 调度推送；删除只置 `deleted` 不 `splice`（墓碑传播） |
| **P2** | `useDataStore` CRUD + 双链标题联动 | `@/stores/data` | 待办↔文章转换；文章改名联动改写 `[[旧名]]`→`[[新名]]`；软删除墓碑 |
| **P2** | `imageCloudLayer` 路由 | `@/services/image` | `isConfigComplete(cfg)` → git 层；否则 → 极简 IndexedDB 层 |
| **P3** | `datetime` 分档 / `excerpt` 摘要 | `@/lib/datetime`、`@/lib/markdown/excerpt` | 时间分档边界（60s/1h/24h/7d）；摘要去代码块与标记——**注入固定时间，禁依赖真实 `Date.now()`** |

**明确不做 UT 的部分**：`proxy/cloudflare-worker.js`（Cloudflare Workers 运行时，本地无等价宿主，归 IT/人工验证）；真实 GitHub 多端往返（归 IT）。

### 4. Mock / 替身边界

| 依赖 | 策略 | 说明 |
|------|------|------|
| **`fetch`** | **必须替身**：`vi.stubGlobal('fetch', vi.fn(async (url) => new Response(...)))`；`afterEach` 用 `vi.unstubAllGlobals()` 复位（见 `diagnose.test.ts:15-19`） | 所有 GitHub 调用统一走 `fetch`。断言「是否离网」用 `expect(fetchSpy).not.toHaveBeenCalled()` |
| **`localStorage`** | **真实（jsdom 提供）**，不替身 | store 测试直接 `localStorage.clear()` 后 `useDataStore()`；断言落盘用 `JSON.parse(localStorage.getItem('wb.data.v1'))`（见 `zero-config-startup.test.ts:69-71`） |
| **`IndexedDB`** | **真实（fake-indexeddb/auto）**，不替身 | setup 已全局注入；`storageLayer` / `db` 测试直接读写，断言经 fake IDB 往返 |
| **`document` / DOM** | **真实 jsdom**，组件测试用 `@vue/test-utils` `mount()` | 不再需要「方案 B 浏览器内 test.html」 |
| **时间 `Date.now()`** | **注入而非 patch**：构造带显式 `updatedAt`/`createdAt` 的 fixture；或 `vi.useFakeTimers()` 冻结 `startPolling`/`schedulePush` 定时器（见 `zero-config-startup.test.ts:22`） | 断言「时间被刷新」用区间 `>= 测试开始时刻`，**禁止**精确毫秒值 |
| **随机 / ID** | **不 Mock**，断言格式 | `uid()` 含时间戳 + `Math.random()`；断言形状而非具体值 |
| **项目内模块** | **默认真实调用，不 Mock** | 纯函数 / store 均真实，Mock 反而掩盖回归 |
| **`console.warn` / `error`** | 不 Mock；需断言时收集 | 如合并冲突日志 |

### 5. 文件命名与组织

- 测试统一放在**被测模块同级的 `__tests__/` 目录**，命名 `<被测>.test.ts`，与被测文件一一对应：`src/lib/__tests__/slug.test.ts`、`src/services/sync/__tests__/merge.test.ts`、`src/stores/__tests__/data.test.ts`。
- `proxy/` 下测试：`proxy/**/*.{test,spec}.{ts,js}`（`vite.config.ts` `test.include` 已含），用于 Cloudflare Worker 白名单逻辑的本地验证。
- 同一被测文件的多个场景**统一放进同一个 `.test.ts`**；新增 → 追加 `it`，不新建并列文件。
- 表驱动：用 `const cases = [{name, input, want}, ...]` + `for (const c of cases) it(c.name, ...)`。
- `vitest` 配置 `globals: true`，故 `describe/it/expect/vi` 可全局使用，但现有文件统一显式 `import { describe, it, expect, vi } from 'vitest'`（推荐保持显式导入，便于静态分析）。

### 6. 用例设计自检清单

> 详见 `.harness/plans/_template/04-ut.md` § 用例设计清单。每个被测函数至少覆盖：
> - **正常路径**：典型输入 → 期望输出
> - **边界值**：`null` / `undefined` / 空字符串 / 空数组 / 单元素 / 超长
> - **异常路径**：非法枚举值（`color`/`status`）、格式错误 JSON、`fetch` 返回非 2xx（401/404/409）
> - **幂等性**：同一输入重复调用结果一致
> - **安全性**（本项目特有，**必测**）：① 任何用户内容路径的 XSS 转义（`render`/`DOMPurify`）；② `serialize()` 输出**永不含 token**
> - **数据安全性**（本项目特有，**必测**）：删除只置墓碑、不从数组移除——否则删除动作无法传播到其它设备
> - **离网不变量**（本项目特有，**必测**）：零配置（`!isConfigComplete`）下 `engine`/`diagnose` **绝不**发起 `fetch`（用 `fetchSpy` 机器化证明）

### 7. 与项目 rules 承接

- 若仓库出现 `.codebuddy/rules/unittest_*.md`：本文 §二 改为指向该 rules 锚点，不重复写。
- 2026-08-04 核查：**该目录不存在**，本文即最低基线。

---

## 三、运行与调试规范

### 1. 当前可用命令（如实记录）

```bash
# 全量单测（vitest run，一次性退出）
npm test
# 等价于：npx vitest run

# 监视模式（改动即重跑）
npm run test:watch
# 等价于：npx vitest

# 类型检查（vue-tsc --noEmit，构建前门禁）
npm run type-check

# 构建（含类型检查 + vite 打包）
npm run build
```

> 无 `python3 -m http.server` 测试用途、无 `bump-version.sh`、无 `node --test`（这些是旧架构/被移除项，勿在新文档中当作既成事实引用）。

### 2. 运行范围控制

```bash
# 按文件（Vitest 直接吃文件路径）
npx vitest run src/services/sync/__tests__/merge.test.ts

# 按名称过滤（--grep 匹配 describe/it 文本）
npx vitest run --grep "mergeInto"

# 仅跑某个目录
npx vitest run src/lib

# 开启覆盖率（当前未接 CI，本地可选）
npx vitest run --coverage
```

> ⚠️ **覆盖率**：Vitest 内置 `--coverage`（基于 v8），但 `vite.config.ts` 当前未配置 `test.coverage`，CI 也未启用；**不设强制门槛**，避免对未覆盖代码误设门禁。需要基线时由维护者评估后补 `test.coverage` 配置。

### 3. 调试套路

| 现象 | 优先排查 | 手段 |
|------|---------|------|
| `Cannot find module '@/...'` | 别名未解析 | 确认 `vitest` 复用 `vite.config.ts``resolve.alias`；测试文件放 `src/**` 内 |
| `IndexedDB` / `openDB` 报错 | setup 未注入 fake-indexeddb | `src/test/setup.ts` 必须有 `import 'fake-indexeddb/auto'` |
| `useDataStore` 抛「no active Pinia」 | 用例未建 Pinia | 确认 `src/test/setup.ts` 的 `beforeEach` 有 `setActivePinia(createPinia())`；组件测试自己也要 `setActivePinia` 或依赖全局 setup |
| 跨用例状态串味 | `wb.data.v1` 残留 / Pinia 单例 | `afterEach` 复位：`localStorage.clear()` + `setActivePinia(undefined)` + `vi.unstubAllGlobals()` |
| `fetch` 替身不生效 / 误触真实网络 | 替身未 stub 或未被调用 | 用 `vi.stubGlobal('fetch', fetchSpy)`；断言 `expect(fetchSpy).not.toHaveBeenCalled()` 验证离网 |
| 定时器相关断言偶发挂 | `startPolling`/`schedulePush` 真实触发 | 用 `vi.useFakeTimers()` 冻结，并在 `afterEach` `vi.useRealTimers()` |
| 时间相关断言偶发失败 | 断言了精确毫秒 | 改用区间断言或 fixture 显式时间戳 |
| Markdown 断言在 diff 里全是转义符 | 期望值手写 `&lt;` | 用 `expect(str).toContain('关键片段')` 而非整串 `toEqual` |

### 4. 不要 / 慎用

| 项 | 原因 |
|----|------|
| 新建 `package.json` 之外再引入测试框架（Jest / Mocha） | 已有 Vitest，重复引入增加体积与心智负担 |
| 真实打 GitHub API | UT/IT 分层；配额与网络不可控 |
| 读取/写入真实 `wb.cfg.v1` 或硬编码真实 Token | 红线 5；泄漏等于交出 GitHub 写权限 |
| 删改已有测试以「让它绿」 | 掩盖回归；确需跳过须 `it.skip` + 在 `04-ut.md` 备注原因并跟踪修复 |
| 把测试临时 JSON/产物写进仓库根目录 | 根目录直出 GitHub Pages，会被一并发布 |

### 5. 测试产物

| 产物 | 路径 | 说明 |
|------|------|------|
| 终端摘要 | stdout | `vitest run` 的 spec/TAP 输出 |
| 覆盖率报告 | `coverage/`（仅 `--coverage` 时） | 本地查看；**不进 git**（如生成需确认 `.gitignore`） |
| 临时态 | 内存（jsdom + fake-indexeddb） | 不落盘、不进 git |

### 6. CI 集成（如实记录）

**CI 已存在**（`.github/workflows/deploy.yml`）：`push main` → `npm ci` → `npm run build`（含 `vue-tsc --noEmit` 类型检查）→ 上传 `dist/` → Pages 发布。

> ⚠️ **CI 当前未接入 `npm test`**——`deploy.yml` 只跑构建（类型检查 + 打包），**不执行测试套件**。因此测试的主门禁是**本地 `npm test` + 本地 git hooks**（`scripts/pre_*`）。若要让 CI 也跑测试，需在 `deploy.yml` 的 `build` 步骤前/后加 `npm test`（属独立提案，不在此文档擅自改动）。下文「质量门禁」以现实为准：本地 `npm test` 全绿 + `npm run build` 通过方可推送。
