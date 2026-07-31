# 单元测试规范（环境 / 生成 / 运行调试）

> 让任意成员（或 AI Agent）能在本项目把单元测试**搭得起、写得对、跑得通、出错查得到**。
> 三段式结构：① 环境搭建 / ② 生成规范 / ③ 运行调试。
>
> **本项目不是 Go 项目**：无 `go.mod`、无 `*.go`、无 `Makefile`、无 `package.json`、无 CI。本文已按真实技术栈（零构建原生 JS + IIFE 全局命名空间）重写，不再包含任何 Go 工具链内容。
>
> **与集成测试的边界**（详见 §二.2）：
> - 单元测试（本文）：**函数级**，被测对象是 `WB.*` 命名空间上导出的纯函数与内存态逻辑，**禁止**真实 DOM 交互、**禁止**真实网络、**禁止**真实 localStorage，全部替身。
> - 集成测试（`.harness/docs/integration_test/integration_test.md`）：浏览器 UI → store/localStorage → github.js → GitHub Contents API → 数据仓库 JSON 的**真实端到端链路**。
>
> **若仓库出现 `.codebuddy/rules/unittest_*.md`，那是权威来源**：本文以摘录 + 链接形式承接，不另起冲突。
> 2026-07-31 核查：仓库**不存在** `.codebuddy/rules/` 目录（`ls .codebuddy/rules/` 为空），故本文即当前基线。

> Source: `js/util.js`、`js/store.js`、`js/markdown.js`、`js/github.js`、`js/notes.js`、`js/app.js`、`index.html`、`.harness/docs/architecture.md`、AGENTS.md（红线 2/4/5）
> Last-verified: 2026-07-31（对应 commit `cf46195`）；结论均由实机执行核验，非推断

---

## 一、环境搭建与依赖安装

### 0. 当前自动化现状（如实记录，勿据此臆造命令）

2026-07-31 全量核查结论：

| 核查项 | 结论 | 证据 |
|--------|------|------|
| 现有单测用例 | **零** | `git ls-files \| grep -iE "test\|spec"` 无任何命中；工作区仅有 `.harness/docs/{unittest,integration_test}/` 两篇规范文档 |
| 测试框架 | **无** | 无 `package.json` / `node_modules` / 任何 runner |
| 断言库 / Mock 库 | **无** | 同上；AGENTS.md 红线 2 明令禁止引入 npm 依赖 |
| 覆盖率工具 | **无** | 无 nyc / c8 / istanbul 痕迹 |
| CI 流水线 | **无** | 无 `.github/workflows/`；质量门禁只有本地 git hooks（`scripts/pre_commit_check.sh` / `commit_msg_check.sh` / `pre_push_check.sh`） |
| 本地可用运行时 | **有** | `node --version` → `v24.13.0`；`python3 --version` → `3.12.3`（后者仅用于起静态服务，不参与单测） |

> **因此：本项目当前的单元测试形态 = 「不存在」**，`.harness/docs/architecture.md:412` 已把它列为 🔴 高危技术债（核心 LWW 合并 / 墓碑清理 / Markdown 渲染均为纯函数，极易测却零覆盖）。
> 本文**不提供** `make test` / `npm test` / `go test` 之类命令——它们在本项目中不存在。可行方案见 §一.2，**全部标注为「建议 / 待定」**，需维护者拍板后才落地。

### 1. 前置事实：模块导出方式决定了单测怎么写

8 个 JS 文件全部是 **IIFE 自执行 + 挂载到全局 `window.WB`**，**不是 ES Module**，没有 `export` / `module.exports`：

| 文件 | 挂载语句 | 可否被独立 import |
|------|---------|------------------|
| `js/util.js` | `window.WB = window.WB \|\| {}`（`js/util.js:4`）、`WB.util = (function(){...})()`（`js/util.js:6,128-133`） | ❌ 无 export，只能整文件求值后读全局 |
| `js/store.js` | `WB.store = {...}`（`js/store.js:347-360`），闭包内 `const U = WB.util`（`js/store.js:8`）**在加载期即捕获** | ❌ 同上，且**必须**在 `util.js` 之后加载 |
| `js/markdown.js` | `WB.md = { render, inline, extractLinks, linkContext, plain }`（`js/markdown.js:202`） | ❌ 同上 |
| `js/github.js` | `WB.gh = { sync, schedulePush, restartPoll, test, status, cfgValid, fetchRemote, diagnose, DEFAULT_API }`（`js/github.js:374`） | ❌ 同上；`API_BASE` / `normCfg` / `apiUrl` / `headers` / `host` / `readErr` 是**闭包私有**（`js/github.js:14,34,48,54,62,93`），**没有导出，因此当前不可被单测直接触达** |
| `js/notes.js` | `WB.notes = { init, render, renderList, open, createNote, buildGraph, flush }`（`js/notes.js:483`） | ❌ 同上 |
| `js/todos.js` / `js/graph.js` | `WB.todos = { init, render, openSheet }`、`WB.graph = {...}` | ❌ 同上 |
| `js/app.js` | `WB.app = { boot, go, openNote, renderAll }`（`js/app.js:288`） | ❌ 同上，**且加载期即读 `document.readyState`**（`js/app.js:290`） |

**结论（实机验证，非推断）**：

1. **可以**用 Node 直接加载这些文件——把文件内容当脚本求值，先建好 `globalThis.window = globalThis` 和 `localStorage` 替身即可。2026-07-31 用 `node v24.13.0` 实测：`util.js` / `store.js` / `github.js` / `markdown.js` / `todos.js` / `notes.js` / `graph.js` **7 个文件全部加载成功**，`WB.util.esc()`、`WB.md.extractLinks()`、`WB.store.mergeInto()`、`WB.notes.buildGraph()` 均可直接调用并返回预期结果。
2. **唯一加载失败的是 `js/app.js`**：`js/app.js:290` 在 IIFE 结尾直接读 `document.readyState` 并自动 `boot()`，Node 下抛 `document is not defined`。**`app.js` 因此不在单测范围内**，其逻辑归集成测试。
3. Node 24 原生提供 `btoa` / `atob` / `TextEncoder` / `TextDecoder`，`js/util.js:86-101` 的 Base64 编解码**无需任何 polyfill** 即可在 Node 中往返验证（实测 `b64Decode(b64Encode('中文✓')) === '中文✓'`）。
4. **需要 `document` 的函数不可在纯 Node 下测**：`U.$`（`js/util.js:42`）、`U.$$`（`js/util.js:43`）、`U.el`（`js/util.js:45`）、`U.toast`（`js/util.js:105`）。这四个要么放浏览器内测，要么归集成测试。

### 2. 可行方案评估（**均为建议 / 待定，尚未采用**）

<!-- TODO(sop.init): 以下三案需维护者选定后才可落地；在此之前仓库内不应出现任何测试文件与运行命令。 -->

| # | 方案 | 是否引入 npm 依赖 | 优点 | 缺点 | 推荐度 |
|---|------|------------------|------|------|--------|
| **A** | **Node 内置 `node:test` + `node:assert/strict`**，配一个约 20 行的加载 shim（建 `window` / `localStorage` / 可选 `document` 替身后逐个求值 `js/*.js`） | **否**（Node 标准库自带，无 `package.json`、无 `node_modules`） | 有 runner、有 `describe/it`、有 diff 断言、有内置 `--test` 并发与过滤；**已实机验证 `require('node:test')` 与 `require('node:assert/strict')` 在 v24.13.0 可用**；纯命令行，可被 git hook 调用 | 引入一个隐性前置依赖（本地需装 Node）；需要维护 shim；测不到 DOM 相关函数 | ⭐ **首选** |
| **B** | **浏览器内 `test.html` + 自写极简断言函数**，用与 `index.html:269-276` 相同顺序的 `<script>` 引入 `js/*.js`，页面上打印通过/失败 | 否 | 与生产运行环境完全一致（真浏览器，有真 `document`）；`U.el` / `U.esc` + DOM 相关函数也能覆盖；零外部运行时依赖，`python3 -m http.server 8000` 后打开即跑 | 无 runner、无过滤、无覆盖率；必须人工开页面看结果，**无法被 git hook 自动拦截**；页面本身也要维护 | ⭐ 备选（可与 A 并存，专测 DOM 部分） |
| **C** | 引入 Jest / Vitest / Playwright 等 | **是** | 生态成熟 | **直接违反 AGENTS.md 红线 2**（禁止引入 npm 依赖 / 构建工具） | ❌ **禁止** |

> **方案 A 的 shim 要点**（说明性描述，不是既成代码）：
> 1. `globalThis.window = globalThis`——`js/util.js:4` 与各文件末尾 `})(window.WB)` 都依赖 `window` 存在；
> 2. 提供内存版 `localStorage`（`getItem` / `setItem` / `removeItem`）——`js/store.js:63-94` 在 `loadLocal()` / `saveLocal()` 中直接调用；
> 3. 按 `index.html:269-276` 的**固定顺序**求值 `util → store → github → markdown → todos → notes → graph`（**跳过 `app.js`**，理由见 §一.1 第 2 条）——`.harness/docs/architecture.md:398` 已把该顺序列为不变式；
> 4. 每个测试文件独立建一份全新 shim，避免 `WB.store` 的模块级 `data` / `cfg` / `listeners`（`js/store.js:42-46`）在用例间串味。

### 3. 环境变量与配置

**本项目单测不需要任何环境变量**。理由：无后端、无配置文件、无凭证注入路径；`js/store.js:31-39` 的 `DEFAULT_CFG` 是硬编码默认值，运行时配置只存在于浏览器 localStorage `wb.cfg.v1`。

> ⚠️ **禁止**在单测里读写真实 `wb.cfg.v1`：其中含 GitHub Token（AGENTS.md 红线 5）。单测一律使用内存替身（§二.4）。

---

## 二、单元测试生成规范

### 1. 通用强制条款（红线）

| # | 红线 | 为什么 |
|---|------|--------|
| 1 | **不修改被测业务代码以让测试通过** | 测试是照妖镜，不是化妆品 |
| 2 | **不引入任何 npm 依赖 / 构建工具 / 测试框架**（Jest、Vitest、jsdom、chai…） | AGENTS.md 红线 2；破坏"零构建直出 GitHub Pages"模型 |
| 3 | **不发起真实网络请求**：`fetch` 必须替身 | UT 不碰真实链路；真实往返归集成测试 |
| 4 | **不读写浏览器真实 localStorage**：必须用内存替身 | 真实键含 Token（红线 5）；且会污染开发者本地数据 |
| 5 | **不在用例间共享可变状态 / 不依赖执行顺序** | `WB.store` 的 `data` / `cfg` / `listeners` 是模块级单例（`js/store.js:42-46`），必须每个用例重新加载或重置 |
| 6 | **不删除已有测试，只追加**；新 helper / fixture 追加到对应文件**尾部** | 保护既有覆盖 |
| 7 | **不硬编码真实仓库名 / 分支 / 路径 / 任何 Token 形态的字符串** | 避免误触真实数据仓库；避免"看起来像凭证"的内容进 git |
| 8 | **不 monkey-patch 生产函数的内部实现**（如直接改写 `WB.util.esc`） | 会掩盖真实回归；依赖应从入参或全局替身注入 |
| 9 | **不测 `js/app.js`**（`js/app.js:290` 加载期即读 `document`、自动 `boot()`） | 它是编排层，天然属于集成测试 |
| 10 | **不因为写测试而改动 `index.html` 的 `<script>` 顺序** | 该顺序是不变式（`.harness/docs/architecture.md:398`） |

### 2. UT / IT 分层边界（禁止重叠）

| 被测对象 | 归属 | 判据 |
|---------|------|------|
| `U.esc` / `U.slug` / `U.truncate` / `U.fmtTime` / `U.b64Encode` / `U.b64Decode` | **UT** | 纯函数，输入→输出，无外部依赖 |
| `MD.render` / `MD.inline` / `MD.extractLinks` / `MD.linkContext` / `MD.plain` | **UT** | 纯函数（仅依赖 `U`，允许真实调用） |
| `S.normalize` 路径（经 `mergeInto` / `replaceAll` 间接触达）、`S.mergeInto` / `S.diffFromRemote` / `S.serialize` / `S.stats` | **UT** | 纯内存态运算，localStorage 用替身 |
| `S.addTodo` / `updateTodo` / `removeTodo` / `addNote` / `updateNote` / `removeNote` / `todoToNote` / `batch` / 事件 `on`/`emit` | **UT** | 内存 CRUD + 事件广播，localStorage 用替身 |
| `WB.notes.buildGraph()`（`js/notes.js:80-100`） | **UT** | 实测在 Node 下可直接调用，只依赖 `S.listNotes()` + `MD.extractLinks()`，**不碰 DOM** |
| `WB.gh.cfgValid()`（`js/github.js:43`，已导出） | **UT** | 纯判定 |
| `WB.gh.fetchRemote` / `sync` / `test` / `diagnose` | **IT**（或待 fetch 替身方案确定后再议） | 真实 HTTP 语义、超时、409/422 重试；UT 侧不重复覆盖 |
| `U.$` / `U.$$` / `U.el` / `U.toast` | **IT** 或方案 B 浏览器内 | 需要真实 `document` |
| `WB.todos.render` / `WB.notes.render` / `WB.graph.render` / 全部 `init()` | **IT** | 直接操作真实 DOM 节点 |
| 顶栏同步状态、设置抽屉、`?v=` 缓存刷新、跨端同步一致性 | **IT** | 真实链路，见 `integration_test.md` |

> **重叠红线**：任何"起真实浏览器 / 打真实 GitHub API"的场景**一律不写进 UT**；任何"纯函数输入输出"的场景**一律不写进 IT**。

### 3. 优先单测模块清单（按投入产出比排序）

> 依据 `.harness/docs/architecture.md:412` 与 `:432`——合并算法回归会**静默丢数据**，且多端异步场景人工极难复现，故排第一。

| 优先级 | 模块 / 函数 | 代码位置 | 必测点 |
|--------|------------|---------|--------|
| **P0** | `store.mergeInto` | `js/store.js:265-294` | 远端有本地无 → 插入；两端都有且远端 `updatedAt` 更大 → 覆盖；远端更旧 → **不动**；`updatedAt` 相等 → 不动（当前语义是 `>` 严格大于）；墓碑（`deleted:true`）随 LWW 传播；合并后按 `createdAt` 新→旧排序（`js/store.js:285`）；无变更时返回 `false` 且不 emit |
| **P0** | `store.serialize` | `js/store.js:312-321` | 30 天前的墓碑被清理、30 天内的墓碑保留、未删除记录一律保留；**输出字段只有 `version/updatedAt/todos/notes`——绝不含 `cfg`/`token`**（红线 5 的机器化守卫） |
| **P0** | `store.diffFromRemote` | `js/store.js:297-309` | 本地多一条 → `true`；本地某条更新 → `true`；两端完全一致 → `false`；远端多出但本地没有 → `false`（该函数只判"是否需要推"） |
| **P0** | `markdown.inline` 的转义链 | `js/markdown.js:44-81` | `<script>` / `"` / `'` 输入渲染后不产生可执行标签；行内代码占位符 `\u0000CODE<n>\u0000`（`js/markdown.js:49-52,79`）不被其它规则破坏；`[[a\|b]]` 中的 `"` 被二次转义（`js/markdown.js:59`） |
| **P1** | `markdown.extractLinks` | `js/markdown.js:11-25` | `[[标题]]` / `[[标题\|别名]]` 两种形态；按 `U.slug` 去重（`js/markdown.js:19-21`）；空 target 跳过；**连续两次调用结果一致**（`WIKI_RE` 是带 `g` 的模块级正则，`js/markdown.js:8`，靠 `lastIndex=0` 复位，是典型踩坑点） |
| **P1** | `markdown.render` 块级 | `js/markdown.js:84-187` | 代码块 / 分隔线 / h1-h3（`Math.min(h[1].length,3)`，`js/markdown.js:114`）/ 引用递归 / 表格 / 任务列表 / 有序列表 / 段落换行转 `<br>`；未闭合代码块的边界行为 |
| **P1** | `store.normTodo` / `normNote`（经 `mergeInto`/`replaceAll` 触达） | `js/store.js:113-138` | 非法 `color` 回落 `blue`；非法 `status` 回落 `todo`；缺 `updatedAt` 时回落 `createdAt`；`deleted` 强制布尔；缺 `title` 时笔记回落"未命名笔记" |
| **P1** | `util.slug` / `util.truncate` | `js/util.js:119-126` | `slug`：trim + 小写 + 连续空白折叠为单空格（双链寻址键，改动即断链）；`truncate`：恰好等长不加省略号、超长加 `…` |
| **P1** | `util.b64Encode` / `b64Decode` | `js/util.js:86-101` | 中文 / emoji 往返一致；空串；跨 `0x8000` 分块边界的长字符串（`js/util.js:89-92`）；`b64Decode` 对含空白字符的输入容错（`js/util.js:97`） |
| **P1** | `notes.buildGraph` | `js/notes.js:80-100` | 单向引用建立 out/in；自引用被忽略（`js/notes.js:91`）；目标不存在进 `missing`；同一目标重复引用不重复入边（`js/notes.js:92-94`）；`inMap` 项带 `ctx` 摘要 |
| **P2** | `store` CRUD + 事件 | `js/store.js:166-232` | 软删除只置 `deleted` 不 `splice`；`removeNote` 联动清空关联待办的 `noteId`（`js/store.js:228-230`）；`listTodos/listNotes` 过滤墓碑；`commit` 广播 `change`+`dirty`（`js/store.js:143-150`） |
| **P2** | `store.batch` | `js/store.js:153-161` | 批内多次写只触发**一次** `change`；嵌套 `batch` 不重复提交；`fn` 抛异常时 `batching` 仍被复位（`finally`） |
| **P2** | `store.todoToNote` | `js/store.js:235-260` | 已有关联笔记时直接返回旧笔记；标题冲突时追加 `(2)`/`(3)` 去重（`js/store.js:251-255`）；生成的正文含颜色名与状态文案 |
| **P2** | `util.debounce` | `js/util.js:67-83` | `cancel()` 后不执行；`flushNow()` 立即执行并清定时器；`pending()` 状态正确（需可控时钟或 `node:test` 的 timer 能力） |
| **P2** | `gh.cfgValid` | `js/github.js:43-46` | 缺 `token` / 缺 `repo` / `enabled:false` 各返回 `false`；完整配置返回 `true` |
| **P3** | `markdown.plain` / `util.fmtTime` / `fmtDate` / `p2` / `todayStr` | `js/markdown.js:194-200`、`js/util.js:17-39` | 摘要去除代码块与标记；时间分档边界（60s/1h/24h/7d，`js/util.js:21-24`）——**必须注入固定"现在"，禁止依赖真实 `Date.now()`** |

**明确不做 UT 的部分**：`js/app.js` 全部（红线 9）、`js/todos.js` / `js/graph.js` 全部（纯 DOM 渲染与交互）、`js/notes.js` 除 `buildGraph` 外的部分、`proxy/cloudflare-worker.js`（Cloudflare Workers 运行时，本地无等价宿主，归 IT/人工验证）。

### 4. Mock / 替身边界

| 依赖 | 策略 | 说明 |
|------|------|------|
| **`localStorage`** | **必须替身**：一个 `{ getItem, setItem, removeItem }` 内存对象，用例间新建 | 被 `js/store.js:63-94,98,331` 与 `js/app.js:22,24,73,79` 使用。替身还能覆盖一条真实分支：让 `setItem` **抛异常**以验证 `js/store.js:91-93` 的写入失败兜底（注意此路径会调 `U.toast` → 需要 `document` 替身或断言在浏览器方案 B 下做） |
| **`fetch`** | **必须替身**：替换 `globalThis.fetch` 为返回预置 `{ ok, status, headers, json(), text() }` 的函数 | `js/github.js:67-91` 的 `req()` 统一走 `fetch`。⚠️ **当前 UT 不覆盖 github.js 的网络分支**（见 §二.2），此条是方案 A 落地后若要补 `readErr` / 重试逻辑测试的前置约定；且 `readErr` / `req` 未导出（`js/github.js:67,93`），需先做**最小导出改造**才能测——该改造属于独立提案，不得在写测试时顺手改 |
| **`document` / DOM** | **不 Mock、不引 jsdom**（jsdom 是 npm 依赖，红线 2） | 需要 DOM 的函数一律排除出 Node 单测；确需覆盖则走方案 B 浏览器内 `test.html` |
| **时间 `Date.now()`** | **注入而非 patch**：优先构造带显式 `updatedAt` / `createdAt` 的 fixture | `js/store.js:144` `commit()` 与 `js/util.js:15` `now()` 都走 `Date.now()`。断言"时间被刷新"时用 `>= 测试开始时刻` 的宽松区间，**禁止**断言精确毫秒值 |
| **随机 / ID** | **不 Mock**，改为断言格式 | `js/util.js:9-13` `uid()` 含 `Date.now().toString(36)` + `Math.random()`；断言 `/^t_[0-9a-z]+_[0-9a-z]{6}$/` 这类形状，而非具体值 |
| **`WB.util` 等项目内模块** | **默认真实调用，不 Mock** | 都是纯函数，Mock 反而掩盖真实回归 |
| **`console.warn` / `console.error`** | 不 Mock；需要断言时收集 | `js/store.js:58,67,72` 三处 |

### 5. 文件命名与组织（**方案 A 选定后生效，当前为建议**）

<!-- TODO(sop.init): 目录与命名待维护者确认；未拍板前不要创建这些文件。 -->

- 建议测试统一放 `tests/` 目录（与 `js/` 平级），命名 `<被测模块>.test.js`，与被测文件一一对应：`tests/util.test.js` / `tests/store.test.js` / `tests/markdown.test.js` / `tests/notes-graph.test.js`。
- 加载 shim 单独一个文件（如 `tests/_shim.js`），**所有测试共用一份**，避免每个文件抄一遍。
- 同一被测文件的多个函数 / 场景**统一放进同一个 `.test.js`**；新增 → 追加，不新建并列文件。
- 表驱动：用 `const cases = [{name, input, want}, ...]` + `for (const c of cases) test(c.name, ...)`，一个函数一组 case。
- **`tests/` 目录必须不影响 GitHub Pages 部署**：本项目根目录直出，新增目录会被一并发布。落地前需确认是否加进 `.gitignore` 或接受其被公开（两者取舍需维护者拍板）。

### 6. 用例设计自检清单

> 详见 `.harness/plans/_template/04-ut.md` § 用例设计清单。每个被测函数至少覆盖：
> - **正常路径**：典型输入 → 期望输出
> - **边界值**：`null` / `undefined` / 空字符串 / 空数组 / 单元素 / 超长（如 Base64 的 `0x8000` 分块边界）
> - **异常路径**：非法枚举值（`color`/`status`）、格式错误的 JSON、`localStorage.setItem` 抛异常
> - **幂等性**：同一输入重复调用结果一致（`extractLinks` 的正则 `lastIndex` 是真实风险点）
> - **安全性**（本项目特有，**必测**）：① 任何用户内容路径的 XSS 转义（`js/util.js:60`、`js/markdown.js:45`）；② `serialize()` 输出**永不含 token**（`js/store.js:312`）
> - **数据安全性**（本项目特有，**必测**）：删除只置墓碑、不从数组移除（`js/store.js:189,225`）——否则删除动作无法传播到其它设备

### 7. 与项目 rules 承接

- 若仓库出现 `.codebuddy/rules/unittest_*.md`：本文 §二 改为指向该 rules 锚点，不重复写。
- 2026-07-31 核查：**该目录不存在**，本文即最低基线。

---

## 三、运行与调试规范

### 1. 当前可用命令（如实记录）

**本项目目前没有任何单元测试运行命令**。以下是相关的**真实**命令，勿与"测试命令"混淆：

```bash
# 起本地静态服务（用于人工验证 / 未来方案 B 的 test.html），来自 AGENTS.md
python3 -m http.server 8000     # 然后访问 http://localhost:8000

# 改动 js/css 后必须刷新版本号（AGENTS.md 红线 3）
./bump-version.sh
# ⚠️ 该脚本用 BSD sed 语法（sed -i ''），Linux/WSL 会报错，见 architecture.md:413
```

### 2. 方案 A 落地后的命令（**建议 / 待定，尚不可用**）

<!-- TODO(sop.init): 以下命令在维护者选定方案 A 之前不存在，禁止在其它文档/产物中当作既成事实引用。 -->

```bash
# 全量（node:test 内置 runner，无需 package.json）
node --test tests/

# 单文件
node --test tests/store.test.js

# 按名称过滤
node --test --test-name-pattern "mergeInto" tests/

# 详细输出 / 只看失败
node --test --test-reporter spec tests/
```

> 覆盖率：Node 内置 `--experimental-test-coverage`（v24 仍带 experimental 前缀）。**当前不设覆盖率门槛**——零测试的项目谈门禁没有意义；待有第一批 P0 用例后再由维护者定基线。**禁止**在本文写死一个未经确认的百分比。

### 3. 调试套路

| 现象 | 优先排查 | 手段 |
|------|---------|------|
| `WB is not defined` / `Cannot read properties of undefined (reading 'util')` | shim 未建 `globalThis.window`，或文件求值顺序错 | 严格按 `util → store → github → markdown → todos → notes → graph` 求值（`index.html:269-276`） |
| `document is not defined` | 测到了 DOM 依赖函数，或误加载了 `js/app.js` | 该用例改归 IT / 方案 B；确认 shim 已跳过 `app.js`（`js/app.js:290`） |
| `localStorage is not defined` | 忘了装内存替身 | `js/store.js:65,79,84,89` 在 `loadLocal()`/`saveLocal()` 中直接用 |
| 用例单跑过、连跑挂 | `WB.store` 模块级单例串味（`js/store.js:42-46`） | 每个用例重新求值一遍模块，或加 `replaceAll(emptyData)` 式重置 |
| `extractLinks` 第二次调用少了结果 | 模块级带 `g` 的正则 `lastIndex` 残留（`js/markdown.js:8`） | 这正是要覆盖的 bug 形态，不要靠"加个 reset"绕过——先确认生产代码 `js/markdown.js:15,32` 的复位是否真的覆盖了所有入口 |
| 时间相关断言偶发失败 | 断言了精确毫秒 | 改成区间断言，或用固定 fixture 时间戳 |
| Markdown 断言在 diff 里全是转义符 | 期望值里手写了 `&lt;` | 用 `assert.match` 断言关键片段，而非整串 `deepEqual` |

### 4. 不要 / 慎用

| 项 | 原因 |
|----|------|
| 新建 `package.json` / 安装任何 npm 包 | AGENTS.md 红线 2，直接阻断合入 |
| 引入 jsdom / happy-dom 做 DOM 替身 | 同上（是 npm 依赖）；DOM 场景走真浏览器（方案 B）或 IT |
| 在单测里跑真实 GitHub API | AGENTS.md 红线 4 的精神 + UT/IT 分层；配额与网络都不可控 |
| 直接改写 `WB.util.*` / `WB.store.*` 的成员来"造场景" | 会让测试与生产实现脱节，掩盖真实回归 |
| 为了让测试通过而调整 `index.html` 的 script 顺序 | 该顺序是不变式（`architecture.md:398`） |
| 把测试产物 / 临时 JSON 写进仓库根目录 | 根目录直出 GitHub Pages，会被一并发布 |
| 跳过用例（`test.skip`）以"让它绿" | 必须在 `04-ut.md` 备注原因 + 跟踪修复 |

### 5. 测试产物

| 产物 | 路径 | 说明 |
|------|------|------|
| 终端摘要 | stdout | 方案 A 下 `node --test` 的 TAP / spec 输出 |
| 页面结果 | 浏览器 | 方案 B 下 `test.html` 的通过/失败列表 |
| 覆盖率报告 | **暂无** | 未设门槛，见 §三.2 |

> 无论哪个方案，**都不得**产生需要提交的二进制/大文件产物；临时产物一律不进 git。

### 6. CI 集成

**本项目无 CI**（无 `.github/workflows/`）。质量门禁只有本地 git hooks：

```
.git/hooks/pre-commit  -> ../../scripts/pre_commit_check.sh
.git/hooks/commit-msg  -> ../../scripts/commit_msg_check.sh
.git/hooks/pre-push    -> ../../scripts/pre_push_check.sh
```

<!-- TODO(sop.init): 方案 A 落地后，是否把 `node --test tests/` 挂进 pre-push（而非 pre-commit，避免每次提交都等）需维护者确认；同时需处理"开发机未装 Node 时如何优雅跳过"的问题。当前不做任何 hook 改动。 -->
