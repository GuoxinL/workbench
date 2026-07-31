# 编码规范

> 状态：定稿 | 维护者：Guoxin.Liu <lgx31@sina.cn> | 最后更新：2026-07-31

## 范围

适用于本仓库全部代码：

| 语言 | 文件 | 说明 |
|------|------|------|
| JavaScript（原生 ES2017+，浏览器端） | `js/{util,store,github,app,todos,notes,markdown,graph}.js` | IIFE + `window.WB` 全局命名空间，**非 ES Module** |
| JavaScript（Cloudflare Worker） | `proxy/cloudflare-worker.js` | Worker 运行时要求 ESM，是仓库内唯一允许 `export default` 的 JS 文件 |
| CSS | `css/style.css` | 单文件，CSS 变量驱动 |
| HTML | `index.html` | 单页入口 |
| Shell | `bump-version.sh`、`scripts/*.sh` | 发版脚本 + git hooks |

本规范全部条款**从现有代码归纳**而来（抽样：`js/store.js`、`js/github.js`、`js/notes.js`、`js/util.js`、`js/markdown.js`、`css/style.css`），后续改码以「与现有代码风格一致」为最高原则。

> 安全相关条款见本文件 §7「安全编码」。接口层约定见 [apis/api-standards.md](apis/api-standards.md)。

## 1. 强制规范（违反 = 阻断合入）

| # | 项 | 要求 | 证据/工具 |
|---|----|------|-----------|
| 1 | JS 语法合法 | `node --check <file>` 通过（本机 node v24.13.0，全部 9 个 js 文件已验证通过） | 手工执行，无 CI |
| 2 | 改 js/css 后必须 bump 版本 | 提交前执行 `./bump-version.sh`（更新 `index.html` 的 `?v=` 与 `wb-version` meta） | AGENTS.md 红线 3；注意脚本是 BSD sed 语法，Linux/WSL 需手工执行 GNU 等效命令 `sed -i -E ...` |
| 3 | pre-commit 检查通过 | 敏感文件 / 构建产物 / 冲突标记 / >5MB 大文件 / 调试代码检测 | `.git/hooks/pre-commit` → `scripts/pre_commit_check.sh`（已软链安装） |
| 4 | 新增代码禁止 `console.log/warn/debug/info` | pre-commit 的 debug_code 检查会阻断**新增行**中的这四种调用；错误输出用 `console.error`（不在阻断名单），用户提示用 `U.toast()` | `scripts/pre_commit_check.sh` Check 6 |
| 5 | 禁止引入构建工具 / 框架 / npm 依赖 | 无 package.json、无打包器、无 CDN 大型框架 | AGENTS.md 红线 2 |
| 6 | 缩进 | JS/HTML 统一 **2 空格**；禁止 Tab 与空格混用 | 全部现有代码 |
| 7 | 浏览器端 JS 禁止 `import`/`export` | 模块通过 IIFE 挂载到 `window.WB`，`index.html` 按依赖顺序引入 `<script>` | 唯一例外：`proxy/cloudflare-worker.js` |

说明：
- 项目**没有** eslint / prettier / .editorconfig，`npm run lint` 之类命令不存在，禁止臆造。
- pre-commit 对 JS 的格式化检查依赖本机 `prettier` 或 `deno`，当前环境两者均未安装，该项实际为 no-op——格式一致性靠人工/AI 遵守本文档保证。
- 建议（**未采用**）：如未来需要机器强制格式，可引入 prettier 单文件校验；引入前需评估与现有紧凑风格（见 §2/§4）的冲突。

## 2. JavaScript 规范（从现有代码归纳）

### 2.1 模块组织（IIFE + 全局命名空间）

```js
/* ============================================================
 * store.js —— 统一数据仓库
 *   - 职责要点一
 *   - 职责要点二
 * ============================================================ */
(function (WB) {
  const U = WB.util;          // 依赖模块取短别名

  // ... 模块私有函数与状态 ...

  WB.store = {                // 文件末尾一次性挂载公共 API
    listTodos, getTodo, addTodo,
    get cfg() { return cfg; } // 只读状态用 getter 暴露
  };
})(window.WB);
```

- `js/util.js` 负责创建命名空间：`window.WB = window.WB || {};`，其余模块一律 `(function (WB) { ... })(window.WB);`。
- 新增模块必须：① 文件头块注释；② IIFE 包裹；③ 末尾 `WB.<name> = {...}` 挂载；④ 在 `index.html` 按依赖顺序加 `<script src="js/xxx.js?v=...">`（util → store → github → 视图层）。
- 模块间依赖用**单大写字母/短别名**引用：`const U = WB.util, S = WB.store, MD = WB.md;`。

### 2.2 命名

| 对象 | 风格 | 现有示例 |
|------|------|----------|
| 函数 / 变量 | `camelCase` | `loadLocal`、`fetchRemote`、`suppressRender` |
| 模块级常量 | `UPPER_SNAKE_CASE` | `LS_DATA`、`DEFAULT_CFG`、`WIKI_RE`、`DEFAULT_API`、`COLORS` |
| 模块别名 | 单大写字母 | `U`（util）、`S`（store）、`MD`（md） |
| DOM 工具 | `$` / `$$` / `el`（来自 `U`） | `const $ = U.$, el = U.el;` |
| DOM 元素 id | `camelCase`（按钮/控件带语义前缀 `btn`/`sync`/`note`） | `btnAddNote`、`syncChip`、`noteSearch`；视图容器例外用 kebab：`view-todos` |
| localStorage 键 | `wb.<name>.v<n>` 字符串常量 | `wb.data.v1`、`wb.cfg.v1`、`wb.dirty` |
| 事件名 | `名词:动词` 小写 | `todo:add`、`note:remove`、`merge` |

### 2.3 语法与格式

- **单引号**字符串；需要插值/多段拼接时用模板字符串（如 `github.js` 的 `apiUrl`）；简单拼接允许 `+`。
- **语句必须带分号**。
- `const` 优先，可变用 `let`；**不使用** `var`、**不使用** `class`。
- 箭头函数用于回调（`arr.forEach(c => ...)`）；具名逻辑用 `function` 声明。
- async/await 用于网络流程（`github.js`）；Promise 链不作为主要风格。
- **短函数允许单行体**：`function now() { return Date.now(); }`；简单卫语句允许单行 if：`if (!b) return;`。
- **早返回**减少嵌套；对象字面量批量返回/挂载时允许一行多个属性（见 `util.js` 末尾 return）。
- 降级容错场景允许空 catch，但必须让语义自明或加注释：`try { ... } catch (e) { }`（如 `saveCfg` 写盘失败静默）。
- 对齐美化允许：常量表可用空格对齐（见 `store.js` 的 `COLORS` 数组）。

### 2.4 注释（中文为默认语言）

- **文件头**：`/* ==== ... ==== */` 块注释，格式为 `文件名 —— 一句话职责` + 要点列表（全部 8 个 js 文件均如此）。
- **节分隔**：`/* ---------- 小节名 ---------- */`（小节）与 `/* ==== 大节名 ==== */`（大节）。
- 行内注释解释 **Why 而非 What**，用中文，可含排障背景。范例（`github.js:79-80`）：
  ```js
  // fetch 在网络不可达 / DNS 失败 / 被 CORS 拒绝时抛 TypeError，原文是英文的 "Failed to fetch"
  // 用 name 而非 instanceof：fetch 若来自其它 realm（polyfill、扩展注入），instanceof 会失效
  ```
- 行尾短注释标注状态机取值：`let mode = 'read';          // read | edit`。
- 禁止保留被注释掉的代码（除非附 `TODO(name): 删除时机`）。

### 2.5 错误处理与用户反馈

- 面向用户的失败：`U.toast('中文消息：' + e.message, 'err')`；成功提示 `U.toast('已删除', 'ok')`。
- 面向开发者的诊断：`console.error('[模块名] 描述', evt, e)`，前缀统一 `[store]`/`[sync]` 方括号模块名。
- 网络错误消息必须**中文 + 可操作建议**（见 `github.js` 的超时/不可达分支）；HTTP 状态码翻译为业务语义（401→Token 无效、404→仓库不存在或无权限）。
- 冲突等控制流错误用标记属性：`const e = new Error('conflict'); e.conflict = true; throw e;`。

## 3. 数据层与同步约定（架构强制，AGENTS.md 红线 4）

- localStorage 键 `wb.*` **只允许** `js/store.js` 读写；其余模块经 `WB.store` API 操作。
- GitHub Contents API **只允许** `js/github.js` 调用。
- 新增持久化字段：必须同时更新 `normalize()/normTodo()/normNote()`（缺省值兜底）与 LWW 合并逻辑（`mergeInto`/`diffFromRemote`），并确认 `serialize()` 是否应包含该字段。
- 数据变更走 `commit(reason)`，批量修改包 `batch(fn)`，避免多次渲染/同步。

## 4. CSS 规范（从 `css/style.css` 归纳）

- **设计令牌集中在 `:root`**：颜色/圆角/阴影/字体全部走 CSS 变量（`--bg`、`--text-2`、`--radius`、`--shadow-sm`）；卡片色板成对定义 `--c-<name>` / `--c-<name>-bg`，且与 `store.js` 的 `COLORS` 表保持同步。
- 类名 **kebab-case**：`.sync-chip`、`.icon-btn`、`.note-item`；状态用**修饰类叠加**而非新类名：`.tab.active`、`.sync-dot.ok`、`.btn.primary`、`.btn.ghost.danger`。
- **紧凑书写**：一行多声明、冒号后不留空格（`display:flex;align-items:center;gap:16px;`）；相关规则可多选择器一行。
- 区块用 banner 注释分隔：`/* ===================== 顶栏 ===================== */`。
- 新颜色/尺寸先看 `:root` 有无现成变量，禁止散落硬编码色值（渐变、hover 微调色除外，现有代码有少量特例）。

## 5. HTML 规范（`index.html`）

- 单页结构，`lang="zh-CN"`，2 空格缩进。
- 区块注释：`<!-- ============ 顶部栏 ============ -->`。
- 所有 js/css 引用必须带 `?v=<时间戳>` 参数，由 `bump-version.sh` 统一刷写，**禁止手改或遗漏**。
- 交互元素必须有 id（camelCase）供 js 绑定；文案一律中文。
- 内联 SVG 图标直接写在 HTML 中（无 icon 字体/图片依赖）。

## 6. Shell 规范

- 面向用户的简单脚本（`bump-version.sh`）：`#!/bin/sh` + `set -e`，中文注释说明用途与用法。
- git hooks 脚本（`scripts/*.sh`）：`#!/usr/bin/env bash` + `set -euo pipefail`，结构化输出 `[BLOCK]/[WARN]/[INFO]`。
- ⚠️ `bump-version.sh` 是 BSD sed 语法（`sed -i ''`），在 GNU sed（Linux/WSL）环境执行会报错，需改用 `sed -i -E ...` 等效命令（见 AGENTS.md）。

## 7. 安全编码（本项目真实红线）

1. **GitHub Token 只存 `wb.cfg.v1`**（localStorage 配置）：
   - **禁止**进入 `serialize()` 输出——`store.js:312` 的 `serialize()` 只导出 `{version, updatedAt, todos, notes}`，新增字段时严禁把 `cfg` 或 token 混入；
   - **禁止** `console.log` 打印 token / 完整请求头；
   - **禁止**硬编码进源码、写入 `data/workbench.json` 或任何 git 仓库（AGENTS.md 红线 5）。pre-commit 的敏感文件检查是最后防线，不是许可。
2. **XSS：用户内容渲染前必须转义**：
   - 唯一转义入口是 `util.js` 的 `esc()`（转义 `& < > " '`）；
   - `markdown.js` 的模式是**先 `esc()` 整体转义、再生成标签**（行内代码占位回填、属性值单独 `replace(/"/g,'&quot;')`），新增渲染规则必须沿用此模式；
   - **禁止**把未转义的用户输入（笔记/待办标题、内容）拼进 `innerHTML`；DOM 构造优先用 `U.el(tag, {text: ...})`（textContent 天然安全）；
   - 外链统一 `target="_blank" rel="noopener"`。
3. **Worker 代理白名单**（`proxy/cloudflare-worker.js`）：
   - 转发路径必须命中 `ALLOW` 正则数组（rate_limit / repos 元数据 / contents），新增接口先加白名单，**禁止**开放任意 URL 中转；
   - 来源限制走 `ALLOW_ORIGINS`；Worker 只透传 `Authorization` 等指定头，**不存储、不记录**令牌。
4. **网络请求必须带超时**：统一走 `github.js` 的 `req()`（AbortController，默认 12s），避免请求无限挂起。

## 8. 参考阈值（无 lint 强制，供 Review 判断）

| 项 | 参考值 | 现状基线 |
|----|--------|----------|
| 单文件行数 | ≤500 行 | 最大 `js/notes.js` 483 行 |
| 行长 | ≤120 列为宜 | 个别 URL 拼接/正则行超长可接受（如 `github.js:51`） |
| 嵌套深度 | ≤4 层，优先早返回 | 现有代码普遍 ≤3 |
| 魔法数字 | 时间量用 `86400e3` 这类自明写法或命名常量 | `store.js` 墓碑清理 `30 * 86400e3` |

## 9. 工具链（如实记录）

| 工具/手段 | 用途 | 触发时机 | 状态 |
|-----------|------|----------|------|
| `node --check <file>` | JS 语法检查 | 改码后手工执行 | ✅ 可用（node v24.13.0） |
| `./bump-version.sh` | 静态资源版本号刷写 | 每次改 js/css 后、提交前 | ✅ 必须（注意 GNU sed 环境改写命令） |
| `scripts/pre_commit_check.sh` | 敏感文件/产物/冲突标记/大文件/调试代码 | git commit（已软链为 pre-commit hook） | ✅ 已安装 |
| `scripts/commit_msg_check.sh` | commit message 格式校验 | git commit | ✅ 已安装 |
| `scripts/pre_push_check.sh` | 按 manifest 检测 build/lint/test（本项目无 package.json，多数检查自动跳过） | git push | ✅ 已安装 |
| `python3 -m http.server 8000` + 浏览器刷新 | 功能验证 | 开发中 | ✅ 唯一运行时验证方式 |
| eslint / prettier / .editorconfig | 机器格式化与静态检查 | — | ❌ 未采用（建议项，引入需评估） |

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
- 历史故障（缓存版本号事故）：[failures.md](failures.md)
