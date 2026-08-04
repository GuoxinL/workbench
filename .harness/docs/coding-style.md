# 编码规范

> 状态：定稿 | 维护者：Guoxin.Liu <lgx31@sina.cn> | 最后更新：2026-08-04（对齐 2026-07-31 Vue3+Vite+TS+Pinia 重构）

## 范围

适用于本仓库全部代码：

| 语言 | 文件 | 说明 |
|------|------|------|
| TypeScript（Vue3 SFC `<script setup lang="ts">` + `src/**/*.ts`） | `src/**/*.ts`、`src/**/*.vue` | ES Module，经 Vite `@` 别名（`@` → `src`）引用 |
| TypeScript（Cloudflare Worker） | `proxy/cloudflare-worker.js` | Worker 运行时要求 ESM，仓库内唯一允许 `export default` 的文件 |
| CSS | `src/**/*.vue` 的 `<style>` / `src/style.css` | 单文件全局样式 + 组件 scoped 样式 |
| HTML | `index.html` | Vite 单页入口 |
| Shell | `scripts/*.sh` | git hooks（pre-commit / commit-msg / pre-push） |

本规范条款**从现有代码归纳**而来（抽样：`src/stores/data.ts`、`src/services/sync/engine.ts`、`src/services/github/diagnose.ts`、`src/lib/markdown/render.ts`、`src/style.css`），后续改码以「与现有代码风格一致」为最高原则。

> 安全相关条款见本文件 §7「安全编码」。接口层约定见 [apis/api-standards.md](apis/api-standards.md)。

## 1. 强制规范（违反 = 阻断合入）

| # | 项 | 要求 | 证据/工具 |
|---|----|------|-----------|
| 1 | 类型与构建通过 | `npm run build`（= `vue-tsc --noEmit && vite build`）零错误、`npm test`（Vitest）全绿 | CI（`deploy.yml`）跑 `npm run build` |
| 2 | 不手改缓存版本号 | Vite 产物自带内容哈希（`app.<hash>.js`），缓存失效由构建机制保证；**已无 `bump-version.sh`**（2026-07-31 重构移除） | `vite.config.ts` `base:'./'`；AGENTS.md 红线 3 已作废 |
| 3 | pre-commit 检查通过 | 敏感文件 / 构建产物 / 冲突标记 / >5MB 大文件 / 调试代码检测 | `.git/hooks/pre-commit` → `scripts/pre_commit_check.sh`（已软链安装） |
| 4 | 新增代码禁止 `console.log/warn/debug/info` | pre-commit 的调试代码检查会阻断**新增行**中的这四种调用（测试文件除外）；错误输出用 `console.error`（不在阻断名单），用户提示用 Pinia store 的 toast / ElMessage | `scripts/pre_commit_check.sh` Check（console 拦截，排除测试文件） |
| 5 | 模块组织遵循分层 | 数据层 `stores/data.ts` + `services/storage/*` + `services/db/*`；同步层 `services/sync/*`；GitHub 层 `services/github/*`；纯函数 `lib/*`；组合式 `composables/*`；视图 `views/*`；组件 `components/*` | AGENTS.md 模块分层 |
| 6 | 缩进 | TS/Vue/HTML 统一 **2 空格**；禁止 Tab 与空格混用 | 现有代码 |
| 7 | ES Module，`import`/`export` 常态 | 全部源码为 ESM；`index.html` 只引 `<script type="module" src="/src/main.ts">`；唯一例外 `proxy/cloudflare-worker.js` 用 ESM `export default` | `src/main.ts` |

说明：
- 项目**没有** eslint / prettier / .editorconfig，`npm run lint` 之类命令不存在，禁止臆造；类型安全由 `vue-tsc` 把关。
- pre-commit 对 JS/TS 的格式化检查依赖本机 prettier/deno，当前环境未安装，该项实际为 no-op——格式一致性靠人工/AI 遵守本文档保证。

## 2. TypeScript / Vue 规范（从现有代码归纳）

### 2.1 模块组织（ESM + 分层）

```ts
// src/services/sync/merge.ts
import type { Article, WorkbenchData } from '@/types'
import { isConfigComplete } from '@/services/github/diagnose'

/** 逐条 LWW 合并：远端有本地无→插入；updatedAt 大者胜；墓碑随 LWW 传播。 */
export function mergeInto(local: WorkbenchData, remote: WorkbenchData): MergeResult {
  // ...
}
```

- 文件头块注释写清职责与要点（现有 `*.ts` 普遍如此）。
- 跨模块依赖用 `@/` 别名引入；同模块内短函数可就近定义。
- 新增持久化/同步能力优先放进对应 `services/*` 子目录，UI 只调 `stores/*` 暴露的 action。

### 2.2 命名

| 对象 | 风格 | 现有示例 |
|------|------|----------|
| 函数 / 变量 | `camelCase` | `mergeInto`、`runDiagnose`、`schedulePush` |
| 类型 / 接口 / 组件 | `PascalCase` | `Config`、`WorkbenchData`、`TodosView`、`LinksPanel` |
| 模块级常量 | `UPPER_SNAKE_CASE` | `MAX_RETRY`、`PUSH_DEBOUNCE`、`MIN_POLL`（`engine.ts`） |
| localStorage 键 | `wb.<name>.v<n>` 字符串常量 | `wb.data.v1`、`wb.cfg.v1`、`wb.manifestSha.v1`、`wb.seeded`（`stores/data.ts`） |
| CSS 类名 | `kebab-case` | `.sync-chip`、`.icon-btn`、`.note-item` |
| 事件名（Pinia/自定义） | `名词:动词` 或动作语义 | `change`、`dirty`、`sync` |

### 2.3 语法与格式

- **单引号**字符串；插值用模板字符串。
- **语句必须带分号**（TS/ESM 风格，与旧 `js/*.js` 一致）。
- `const` 优先，可变用 `let`；避免 `any`（类型检查 `vue-tsc` 会拦）；可用类型断言但需谨慎。
- 箭头函数用于回调；具名逻辑用 `function` 声明或 `export function`。
- async/await 用于网络 / IO 流程（`services/github/*`、`services/sync/engine.ts`）。
- **早返回**减少嵌套；对象字面量批量返回允许一行多属性。
- 降级容错允许空 catch，但必须让语义自明或加注释。
- `import` 顺序建议：外部依赖 → `@/` 别名 → 相对路径；AutoImport 已注入 `vue`/`element-plus` API，无需手写部分 import（见 `auto-imports.d.ts`）。

### 2.4 注释（中文为默认语言）

- **文件头**：块注释，格式为 `文件名 —— 一句话职责` + 要点列表。
- 行内注释解释 **Why 而非 What**，用中文，可含排障背景（如 `engine.ts` 对 `manifestSha` 乐观锁的注释）。
- 禁止保留被注释掉的代码（除非附 `TODO(name): 删除时机`）。

### 2.5 错误处理与用户反馈

- 面向用户的失败：经 Pinia store / `ElMessage` 弹中文 `message`；成功提示同理。
- 面向开发者的诊断：`console.error('[模块名] 描述', e)`，前缀统一 `[sync]`/`[storage]` 方括号模块名。
- 网络错误消息必须**中文 + 可操作建议**（见 `services/github/diagnose.ts` 的超时/不可达分支）；HTTP 状态码翻译为业务语义（401→令牌无效、404→仓库不存在或无权限）。
- 冲突等控制流错误用标记属性：`const e = new Error('conflict'); e.conflict = true; throw e;`（如 `engine.ts` 的乐观锁冲突重试）。

## 3. 数据层与同步约定（架构强制，AGENTS.md 红线 4）

- localStorage 键 `wb.*` **只允许** `stores/data.ts` 读写；其余模块经 `useDataStore()` API 操作。
- 结构化数据走 IndexedDB（`services/db/*` + `services/storage/storageLayer.ts` 双写）。
- GitHub Contents API **只允许** `services/github/*` + `services/sync/*` 调用，数据载体为远端 `kb/<id>.md`（frontmatter + 正文）+ 根目录 `manifest.json`（轻量索引）。
- 新增持久化字段：必须同时考虑 LWW 合并逻辑（`services/sync/merge.ts` 的 `mergeTodos`/`mergeArticles`）与本地落盘（`cleanupTombstones`），并确认 `manifest.json` 是否应包含该字段。
- 数据变更走 store action，批量修改避免多次同步；同步由 `engine.ts` 统一编排（防抖推送 + 轮询 + 并发排队）。

## 4. CSS 规范（从现有代码归纳）

- **设计令牌集中在 `:root`**（`src/style.css`）：颜色/圆角/阴影/字体走 CSS 变量；组件内用 scoped `<style>`。
- 类名 **kebab-case**；状态用**修饰类叠加**：`.tab.active`、`.sync-dot.ok`、`.btn.primary`。
- 紧凑书写允许一行多声明（`display:flex;align-items:center;gap:16px;`）。
- 新颜色/尺寸先看 `:root` 有无现成变量，禁止散落硬编码色值。

## 5. HTML 规范（`index.html`）

- Vite 单页结构，`lang="zh-CN"`，2 空格缩进。
- 只保留 `<div id="app">` + `<script type="module" src="/src/main.ts">`；入口不做业务挂载。
- 交互元素文案一律中文。
- 内联 SVG 图标直接写在组件模板中（无 icon 字体/图片依赖）。

## 6. Shell 规范

- git hooks 脚本（`scripts/*.sh`）：`#!/usr/bin/env bash` + `set -euo pipefail`，结构化输出 `[BLOCK]/[WARN]/[INFO]`。
- 中文注释说明用途与用法；任何绕过钩子的逃生口（`SKIP_*` / `DISABLE_*`）必须在任务 `00-overview.md` 记录原因。

## 7. 安全编码（本项目真实红线）

1. **GitHub Token 只存 `wb.cfg.v1`**（localStorage 配置，由 `SettingsSheet` 写入）：
   - **禁止**进入同步载荷——`manifest.json` 仅含轻量索引字段（`version/updatedAt/articles/todos`），新增字段时严禁把 `cfg` 或 token 混入；
   - **禁止** `console.log` 打印 token / 完整请求头；
   - **禁止**硬编码进源码、写入仓库或任何 git（AGENTS.md 红线 5）。pre-commit 的敏感文件检查是最后防线。
2. **XSS：用户内容渲染前必须转义**：
   - Markdown 渲染经 `@milkdown/kit` + `DOMPurify` 兜底，新增渲染规则必须沿用「先转义/DOMPurify 净化、再生成标签」；
   - **禁止**把未转义的用户输入（文章/待办标题、内容）拼进 `innerHTML`；优先用 Vue 的 `{{ }}` 文本插值（textContent 天然安全）；
   - 外链统一 `target="_blank" rel="noopener"`。
3. **Worker 代理白名单**（`proxy/cloudflare-worker.js`）：
   - 转发路径必须命中白名单正则数组（rate_limit / repos 元数据 / contents），新增接口先加白名单，**禁止**开放任意 URL 中转；
   - 来源限制走 `ALLOW_ORIGINS`；Worker 只透传 `Authorization` 等指定头，**不存储、不记录**令牌。
4. **网络请求必须带超时**：统一走 `services/github/diagnose.ts` 的 `repoFetch`（AbortController，默认 12s），避免请求无限挂起。

## 8. 参考阈值（无 lint 强制，供 Review 判断）

| 项 | 参考值 | 现状基线 |
|----|--------|----------|
| 单文件行数 | ≤500 行 | SFC/服务模块普遍 ≤400 |
| 行长 | ≤120 列为宜 | 个别 URL 拼接/正则行超长可接受 |
| 嵌套深度 | ≤4 层，优先早返回 | 现有代码普遍 ≤3 |
| 魔法数字 | 时间量用命名常量 | `engine.ts` 的 `PUSH_DEBOUNCE=1500`、`MAX_RETRY=3`、`MIN_POLL=5000` |

## 9. 工具链（如实记录）

| 工具/手段 | 用途 | 触发时机 | 状态 |
|-----------|------|----------|------|
| `npm run build` | 类型检查 + 构建（`vue-tsc --noEmit && vite build`） | 改码后、提交前、CI | ✅ 必须 |
| `npm test` | Vitest 单测（jsdom + fake-indexeddb） | 改码后、CI（待接入） | ✅ 必须 |
| `npm run type-check` | `vue-tsc --noEmit` 纯类型检查 | 开发中 | ✅ 可用 |
| `npm run dev` | Vite dev server `:5173` | 开发中 | ✅ 唯一运行时验证方式 |
| `scripts/pre_commit_check.sh` | 敏感文件/产物/冲突标记/大文件/调试代码 | git commit（已软链为 pre-commit hook） | ✅ 已安装 |
| `scripts/commit_msg_check.sh` | commit message 格式校验（Conventional Commits） | git commit | ✅ 已安装 |
| `scripts/pre_push_check.sh` | 依赖/构建类提醒 | git push | ✅ 已安装 |
| eslint / prettier / .editorconfig | 机器格式化与静态检查 | — | ❌ 未采用（类型安全靠 vue-tsc） |

## 10. 例外与豁免

项目无 lint 工具，故无 `lint:disable` 机制。需违反本文档条款时：
1. 在代码处加中文注释写明理由（参照 §2.4 的 Why 注释范例）；
2. 在 MR 描述中说明影响面；
3. 人工 Review 二次确认（见 [code-review.md](code-review.md)）。

## 参考

- 单元测试规范：[unittest/unittest.md](unittest/unittest.md)
- 接口文档与规范：[apis/api-standards.md](apis/api-standards.md)
- Code Review 检查清单：[code-review.md](code-review.md)
- 架构与模块分层：[architecture.md](architecture.md)
- 历史故障：[failures.md](failures.md)
