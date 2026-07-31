# 个人工作台 —— 重构设计文档

> 日期：2026-07-31 | 作者：AI 协作产出，待 Guoxin.Liu 评审
> 基线 commit：`cf46195` | 现状架构详见 [architecture.md](docs/architecture.md)
> 状态：**已评审**（4 项决策已确认，见第 9 节）

---

## 1. 背景与目标

### 1.1 为什么要重构

现有实现是一套**完全手写的零依赖前端**：Markdown 渲染器、力导向图谱、DOM 操作、状态管理、事件总线全部自造，共 3185 行。这套方案在项目启动期是对的——零构建、零依赖、push 即上线，卖点鲜明。

但它现在有三个结构性问题：

| 问题 | 具体表现 | 后果 |
|---|---|---|
| **无验证手段** | 零测试、零类型检查、零 lint | LWW 合并这类核心算法一旦回归会**静默丢数据**，且多端异步场景人工极难复现 |
| **重复造轮子** | `markdown.js` 203 行、`graph.js` 202 行都在做成熟库已解决的事 | 维护成本高，功能受限（如标题只支持到 h3、图谱 O(n²)） |
| **全局命名空间耦合** | 8 个 IIFE 挂 `window.WB`，依赖靠 `index.html` 的 `<script>` 行序隐式维护 | 改动无静态检查，错误只在运行时暴露；单个文件最大 483 行，修改需通读全文 |

### 1.2 本次重构的目标

1. **用成熟生态替换手写轮子**，把精力集中在项目真正的差异化价值上（GitHub 同步引擎）
2. **建立 AI 可用的反馈闭环**——类型检查 + 单元测试 + 构建校验，让"改完不知道对不对"成为过去时
3. **功能严格对齐现有实现**，不增不减（详见第 2 节清单，即验收基线）

### 1.3 明确的非目标

- ❌ 不新增业务功能（第 9 节确认后可另议）
- ❌ 不改变产品定位（仍是零后端、数据主权归用户的个人工具）
- ❌ 不改 `proxy/cloudflare-worker.js`（独立组件，与前端重构无关，原样保留）

---

## 2. 需求识别（现状功能全清单）

> 本节从代码逐行反推而来，是重构的**验收基线**。每项后标注现状实现位置，重构后须逐项对照验收。

### 2.1 待办管理

| # | 功能 | 行为细节 | 现状位置 |
|---|---|---|---|
| T1 | 快速创建 | 输入框回车或点「添加」；空标题时聚焦不创建；创建后清空并保持聚焦 | `todos.js:119-127` |
| T2 | 8 色分类 | blue 常规 / red 紧急 / amber 重要 / green 推进中 / purple 思考 / teal 协作 / pink 个人 / slate 待定，各含主色与背景色 | `store.js:15-24` |
| T3 | 3 档状态 | todo 待办 / doing 进行中 / done 已完成 | `store.js:28` |
| T4 | 卡片排序 | 未完成在前，同组内按 `updatedAt` 倒序 | `todos.js:143-147` |
| T5 | 状态筛选 | 全部 / 待办 / 进行中 / 已完成 四段切换 | `todos.js:30-35` |
| T6 | 颜色筛选 | 点击色块只看该色，**再点同色取消**；首块为「全部颜色」渐变块 | `todos.js:97-116` |
| T7 | 关键词搜索 | 匹配标题 + 描述，大小写不敏感，**160ms 防抖** | `todos.js:37-40` |
| T8 | 一键切换完成 | 卡片左侧圆圈，done ↔ todo 互切 | `todos.js:178-185` |
| T9 | 编辑抽屉 | 标题 / 描述 / 颜色 / 状态 / 截止日期 / 关联笔记展示 | `todos.js:237-260` |
| T10 | 抽屉快捷键 | `Esc` 关闭、`Cmd/Ctrl+Enter` 保存 | `todos.js:70-73` |
| T11 | 遮罩关闭 | 点击遮罩空白区关闭（`mousedown` 判定 target 自身） | `todos.js:44-46` |
| T12 | 逾期高亮 | `due < 今天` 且状态非 done → 显示「已逾期」红色标签，否则显示「截止 日期」 | `todos.js:218-224` |
| T13 | 删除确认 | 卡片迷你按钮与抽屉删除均需 `confirm`，文案含标题 | `todos.js:200`、`todos.js:52-58` |
| T14 | 空状态区分 | 有筛选条件时提示「没有符合条件的待办」，无条件时提示「还没有待办…」 | `todos.js:150-159` |
| T15 | 保存校验 | 标题为空时 toast 报错且不保存 | `todos.js:270` |

### 2.2 笔记

| # | 功能 | 行为细节 | 现状位置 |
|---|---|---|---|
| N1 | 列表展示 | 按 `updatedAt` 倒序；显示更新时间、出链数 `↗n`、入链数 `↙n`、「来自待办」徽章 | `notes.js:103-141` |
| N2 | 搜索 | 匹配标题 + 正文，**150ms 防抖** | `notes.js:24-27` |
| N3 | 新建 | 默认名「未命名笔记」；**同名自动追加 ` 2`/` 3`**；建后进编辑模式并全选标题 | `notes.js:307-319` |
| N4 | 阅读/编辑双模式 | 阅读只显示预览；编辑时 textarea + 预览并存（桌面分栏） | `notes.js:245-253` |
| N5 | 自动保存 | 正文/标题输入 **700ms 防抖**；失焦、切笔记、返回列表、同步前均 `flushNow()` 立即落盘 | `notes.js:18,58-66,145` |
| N6 | 编辑防打断 | 编辑中置 `suppressRender`，外部数据变更只刷列表不重渲染详情 | `notes.js:16,473-480` |
| N7 | 元信息 | 创建时间 · 更新时间 · **字数（去空白字符计数）** · 源自待办（标题截断 20 字） | `notes.js:173-181` |
| N8 | 标题去重 | 改名撞已有标题时自动改为 `原名 (2)` 并 toast 告知 | `notes.js:266-273` |
| N9 | 删除 | `confirm` 确认，提示「其它笔记中的引用将标记为未创建」；删除后解除待办关联 | `notes.js:39-48`、`store.js:227-230` |
| N10 | 移动端布局 | `.detail` 类切换列表/详情视图，含返回按钮 | `notes.js:34-37` |

### 2.3 双向链接（项目核心特色）

| # | 功能 | 行为细节 | 现状位置 |
|---|---|---|---|
| L1 | 语法 | `[[标题]]` 与 `[[标题\|别名]]` | `markdown.js:8` |
| L2 | 标题寻址 | 用 `slug()` 归一化匹配：trim + 转小写 + 空白折叠 | `util.js` / `store.js:200-203` |
| L3 | 出链面板 | 「引用了」列出目标笔记 + 正文摘要（24 字） | `notes.js:211-218` |
| L4 | 入链面板 | 「被引用」列出来源笔记 + **引用所在行的上下文摘录（60 字，别名替换后）** | `notes.js:234-241`、`markdown.js:28-41` |
| L5 | 未创建引用 | 引用了不存在的标题 → 出链区橙色「＋ 标题（未创建）」，**点击立即创建并跳转** | `notes.js:219-229` |
| L6 | 计数显示 | 出链数附带 `(+n 待建)`，入链数纯计数 | `notes.js:205-206` |
| L7 | 预览区跳转 | 点击 `.wikilink` 跳转；目标不存在时 `confirm` 询问创建 | `notes.js:69-74,321-329` |
| L8 | 缺失链接样式 | 不存在的目标渲染为 `.wikilink.missing` | `markdown.js:55-60` |
| L9 | 忽略自引用 | 笔记引用自身不计入图 | `notes.js:91` |
| L10 | 引用去重 | 同一目标在同篇中多次引用只算一条 | `markdown.js:20-21` |
| **L11** | **改标题联动改引用** | 改标题时自动重写**其它所有笔记**中的 `[[旧标题]]`（保留别名部分），包在 `batch()` 里只触发一次同步，完成后 toast 告知影响篇数 | `notes.js:286-304` |

### 2.4 `[[` 自动补全

| # | 功能 | 行为细节 | 现状位置 |
|---|---|---|---|
| A1 | 触发 | 输入第二个 `[` 时**自动补全为 `[[]]`** 并把光标置于中间 | `notes.js:341-354` |
| A2 | 候选列表 | 排除当前笔记，按关键词过滤，按 `updatedAt` 倒序，**最多 8 条** | `notes.js:367-370` |
| A3 | 新建选项 | 输入的标题不存在时追加「＋ 新建「X」」选项 | `notes.js:373-375` |
| A4 | 键盘操作 | `↑`/`↓` 移动（循环）、`Enter`/`Tab` 应用、`Esc` 关闭 | `notes.js:333-339` |
| A5 | 光标跟随定位 | **用镜像 div 测算光标像素坐标**；面板超出下边界时翻转到上方；右侧防溢出 | `notes.js:398-431` |
| A6 | 智能闭合 | 光标后已有 `]]` 则不重复插入 | `notes.js:444-447` |
| A7 | 选新建即创建 | 选中「新建」项时立刻创建该笔记并 toast | `notes.js:454-459` |

### 2.5 Markdown 渲染

支持语法：标题（`#`~`######`，**当前实现降级到 h3 封顶**）、粗体、斜体、删除线、`==高亮==`、行内代码、围栏代码块（带 lang 属性）、引用块（**递归渲染**）、无序列表、有序列表（`1.` 与 `1)`）、任务列表（`[x]`/`[ ]`，渲染为 disabled checkbox）、表格（含对齐分隔行）、分隔线、图片、链接、**裸 URL 自动识别**。

**安全策略**：`inline()` 第一行即整体 `esc()` 转义，再套规则；行内代码先占位保护避免内部内容被二次处理。（`markdown.js:44-81`）

### 2.6 关联图谱

| # | 功能 | 现状位置 |
|---|---|---|
| G1 | 力导向布局（斥力 + 引力 + 向心 + 阻尼，260 帧模拟） | `graph.js:86-125` |
| G2 | SVG 渲染节点与连线 | `graph.js:133-155` |
| G3 | 节点拖拽 | `graph.js` |
| G4 | 视图缩放 | `graph.js` |
| G5 | 点击节点跳转对应笔记 | `graph.js:196` |
| G6 | 「重新布局」按钮 | `index.html:136` |
| G7 | 空状态提示「还没有笔记之间的引用关系」 | `index.html:140` |
| G8 | 切到图谱视图时才渲染（延迟 30ms） | `app.js:74` |

### 2.7 GitHub 同步（项目核心资产）

| # | 功能 | 行为细节 | 现状位置 |
|---|---|---|---|
| S1 | 配置项 | 仓库 `owner/repo`、分支、数据文件路径、PAT、API 代理地址、轮询间隔、启用开关 | `store.js:31-39` |
| S2 | 空值双重回落 | 加载时逐项回落 + 引擎侧 `normCfg()` 再回落，防止历史脏数据把默认值盖成空 | `store.js:74-77`、`github.js:34-41` |
| S3 | 自动推送 | 任何变更后 **1.5s 防抖** 推送 | `github.js:237` |
| S4 | 定时拉取 | 默认 20s（钳制 5–300s）；`document.hidden` 时跳过 | `github.js:240-249` |
| S5 | 前台/网络恢复即同步 | `visibilitychange` + `online` 事件触发静默同步 | `app.js:44-47` |
| S6 | 手动同步 | 点顶栏胶囊，先 flush 编辑器再非静默同步 | `app.js:95-99` |
| S7 | **逐条 LWW 合并** | 以 `id` 为主键；远端有本地无 → 插入；两端都有 → `updatedAt` 大者胜；合并后按 `createdAt` 倒序 | `store.js:265-294` |
| S8 | **软删除墓碑** | 删除置 `deleted:true` 并刷新 `updatedAt`，保证删除可传播 | `store.js:186-192` |
| S9 | **墓碑清理** | 序列化时丢弃 30 天前的墓碑 | `store.js:312-321` |
| S10 | **sha 乐观锁 + 冲突重试** | PUT 带 sha；遇 409/422 重新拉取合并后重试，**最多 3 次**，退避 `350ms × attempt` | `github.js:139-143,192-197` |
| S11 | **并发排队** | 静默调用复用进行中的 Promise；用户主动调用排队等完再跑一次 | `github.js:220-232` |
| S12 | 请求超时 | 统一 12s（`AbortController`），诊断步骤 10s | `github.js:67-91` |
| S13 | 错误码映射 | 401 令牌失效 / 403+ratelimit 频率超限 / 404 仓库或权限问题，均中文化 | `github.js:93-103` |
| S14 | 网络错误识别 | 用 `e.name === 'TypeError'` 判定（跨 realm 安全），标记 `err.net` | `github.js:80-81` |
| S15 | 状态机 + 顶栏指示 | `idle`/`syncing`/`ok`/`error`/`off` → 胶囊四态（同步中/已同步/待同步/同步失败/本地模式） | `app.js:102-118` |
| S16 | 相对时间刷新 | 每 30s 刷新一次「已同步 X」的相对时间 | `app.js:121-124` |
| S17 | 测试连接 | `GET /repos/{o}/{r}` 并**校验 `permissions.push`** | `github.js:261-265` |
| S18 | **五步诊断** | 配置检查 → 网络连通 → 令牌有效性 → 仓库访问与写权限 → 数据文件；**逐步回调渲染，失败即中断并给出处置建议** | `github.js:284-368` |
| S19 | 导出备份 | 下载 `workbench-YYYY-MM-DD.json` | `app.js:188-195` |
| S20 | 离场保护 | `beforeunload` 先 flush，若 dirty 且同步已启用则弹原生确认框 | `app.js:48-55` |
| S21 | 保存配置流程 | 校验 `owner/repo` 格式与 token 非空 → 保存 → 重启轮询 → 立即关窗 → toast 播报同步结果 | `app.js:168-186` |
| S22 | 本地模式降级 | 配置无效时进入 `off`，**功能完整仅不同步** | `github.js:222` |

### 2.8 全局与其它

| # | 功能 | 现状位置 |
|---|---|---|
| X1 | 三视图路由（待办/笔记/图谱），localStorage 记忆上次视图 | `app.js:68-80` |
| X2 | 移动端底部导航（与顶部 tabs 同步高亮） | `app.js:63-65` |
| X3 | 首次使用播种示例数据（3 篇互相引用的笔记 + 4 条待办），`wb.seeded` 标记只播一次 | `app.js:22-25,269-286` |
| X4 | Toast 通知（ok / err / info 三档） | `util.js:105-116` |
| X5 | PWA manifest（添加到主屏幕） | `manifest.json` |
| X6 | 设置面板显示当前版本号 | `app.js:204-206` |
| X7 | 待办 → 笔记转换（带入颜色/状态/截止日期作引用块 + 描述 + 固定骨架「## 记录 / ## 关联」，标题去重，双向记录 `noteId`/`fromTodo`） | `store.js:235-260` |

### 2.9 非功能需求

- **零后端**：数据主权完全归用户，不经任何第三方服务器
- **静态托管**：GitHub Pages 可直接部署
- **移动端适配**：手机浏览器可用，支持添加到主屏幕
- **令牌安全**：不落库（`serialize()` 只输出 4 个字段）、不落日志、不硬编码、输入框 `type=password`
- **XSS 防护**：所有用户内容渲染前转义
- **离线可用**：同步未配置或网络不可达时，本地模式功能完整

### 2.10 数据模型（建议原样保留，见 4.1）

```ts
interface WorkbenchData {
  version: 1
  todos: Todo[]
  notes: Note[]
  updatedAt: number
}

interface Todo {
  id: string; title: string; desc: string
  color: ColorKey                        // 8 色枚举
  status: 'todo' | 'doing' | 'done'
  due: string                            // 'YYYY-MM-DD'，空串表示无
  noteId: string                         // 关联笔记，空串表示无
  createdAt: number; updatedAt: number
  deleted: boolean                       // 软删除墓碑
}

interface Note {
  id: string; title: string; content: string
  fromTodo: string                       // 来源待办 id
  createdAt: number; updatedAt: number
  deleted: boolean
}

// 仅存本地，永不上传
interface Config {
  enabled: boolean; repo: string; branch: string; path: string
  token: string; poll: number; apiBase: string
}
```

---

## 3. 重构方案

### 3.1 技术选型

> 版本为 2026-07-31 查询的 npm latest。初始化时以脚手架实际生成为准。

| 用途 | 选型 | 版本 | 替换掉什么 |
|---|---|---|---|
| 框架 | Vue 3 | `3.5.40` | 全部手写 DOM 操作与全量重渲染 |
| 构建 | Vite | `8.2.0` | `bump-version.sh` + `?v=` 缓存机制 |
| 语言 | TypeScript | **`~5.9.3`**（见下方说明） | 无类型的裸 JS |
| 状态 | Pinia | `4.0.2` | `store.js` 的事件总线 |
| 路由 | Vue Router | `5.2.0`（**hash 模式**） | `app.js` 的 class 切换 + localStorage 记忆 |
| 测试 | Vitest | `4.1.10` | 无 |
| Markdown | marked | `18.0.7` | `markdown.js` 的块级/行内渲染器 |
| 消毒 | DOMPurify | `3.4.12` | `util.esc()` 全量转义 |
| 图布局 | d3-force | `3.0.0` | `graph.js` 的手写力导向 |
| 工具集 | VueUse | latest | `util.js` 的 debounce 等 |
| UI 组件 | Element Plus | latest | 手写抽屉/开关/段控件/色板/toast/confirm 等 |

**为什么 TypeScript 锁 5.9 而不用 latest 的 7.0.2**：TS 7.0.2 发布于 2026-07-08（距今 3 周），是编译器的 Go 原生重写版。`vue-tsc@3.3.8` 虽声明 `peerDependencies: typescript >=5.0.0`，但 Volar 工具链对 tsgo 的适配需要观察期。**建议初始化后实测一次 TS 7，通过则升级，不通过用 5.9 LTS**——这个验证成本只有几分钟，收益是避免踩在生态迁移期的坑上。

**引入 Element Plus 作为 UI 组件库**（经评审确认，推翻原"不引入"建议）。理由：抽屉、开关、段控件、确认框、Toast、Tabs 等通用件库已成熟，用库能省下大量样板并提升可维护性；组件库按需自动导入（unplugin-vue-components + unplugin-auto-import）控制体积。**仍自定义的部分**：8 色分类色板与卡片视觉是业务专属，组件库不提供，保持手写；主题通过覆盖 Element Plus 设计变量（CSS 变量）与现有 `variables.css` 融合，观感不漂移。

### 3.2 目标架构

```
workbench/
├── index.html                    ← Vite 入口（不再手写 script 标签）
├── package.json / vite.config.ts / tsconfig.json / vitest.config.ts
├── .github/workflows/deploy.yml  ← 构建 + 部署到 Pages
├── proxy/cloudflare-worker.js    ← 原样保留，不改
├── public/                       ← manifest.json / icon.svg / .nojekyll
└── src/
    ├── main.ts
    ├── App.vue
    ├── types/index.ts            ← Todo / Note / Config / 同步状态
    ├── router/index.ts           ← hash 路由：/todos /notes/:id? /graph
    ├── stores/
    │   ├── data.ts               ← todos + notes CRUD、batch、dirty
    │   ├── sync.ts               ← 同步状态机 + 配置
    │   └── ui.ts                 ← 筛选条件、编辑模式等视图态
    ├── services/
    │   ├── github/
    │   │   ├── client.ts         ← 请求封装：超时、错误映射、代理基址
    │   │   ├── contents.ts       ← fetchRemote / pushRemote
    │   │   └── diagnose.ts       ← 五步诊断
    │   └── sync/
    │       ├── merge.ts          ← ★ LWW 合并（纯函数，重点测试）
    │       ├── serialize.ts      ← ★ 墓碑清理（纯函数，重点测试）
    │       └── engine.ts         ← 编排：重试、排队、轮询、防抖
    ├── lib/
    │   ├── markdown/
    │   │   ├── index.ts          ← marked 实例 + DOMPurify
    │   │   ├── wikilink.ts       ← ★ [[双链]] marked extension
    │   │   └── highlight.ts      ← ★ ==高亮== marked extension
    │   ├── links.ts              ← ★ 双链图构建（出链/入链/缺失）
    │   └── slug.ts               ← ★ 标题归一化
    ├── composables/
    │   ├── useAutoSave.ts        ← 700ms 防抖 + flushNow
    │   └── useWikiAutocomplete.ts← [[ 补全（含光标坐标测算）
    ├── components/
    │   ├── todos/  TodoCard.vue · TodoComposer.vue · TodoFilters.vue · TodoEditSheet.vue
    │   ├── notes/  NoteList.vue · NoteEditor.vue · NotePreview.vue · LinksPanel.vue · WikiAutocomplete.vue
    │   ├── graph/  GraphCanvas.vue
    │   └── common/ SyncChip.vue · SettingsSheet.vue · DiagnosePanel.vue · BaseSheet.vue · ToastHost.vue
    ├── views/      TodosView.vue · NotesView.vue · GraphView.vue
    └── styles/     variables.css · base.css
```

★ = 纯函数模块，单测重点覆盖对象。

**分层规则**：`views → components → composables/stores → services → lib`，禁止反向依赖。与现状最大的不同是——**依赖关系由 `import` 静态声明，编译器会校验**，不再依赖 `<script>` 行序。

### 3.3 核心模块设计

#### 3.3.1 数据层（`stores/data.ts`）

对应现状 `store.js`。用 Pinia 重写，但**算法逐条移植不改语义**：

- CRUD 保持软删除语义，`removeNote` 仍需解除关联待办的 `noteId`
- `batch()` 对应 Pinia 里的批量标记，批内只触发一次持久化与推送
- 持久化到 localStorage（键名可沿用 `wb.data.v1`）
- **纯算法（merge / diffFromRemote / serialize）抽到 `services/sync/` 作为无副作用函数**，便于测试——这是相对现状的结构改进

#### 3.3.2 同步引擎（`services/sync/`）—— 核心资产，只移植不重写

现状 `github.js` 的 375 行里，真正有价值的是**业务逻辑**而非 HTTP 封装。移植时逐条对齐 S1–S22，其中这几处是**踩坑换来的，必须原样保留**：

| 必须保留的行为 | 原因 |
|---|---|
| 并发排队（而非"忙就返回 false"） | commit `81429d7` 修的 bug：轮询撞手动同步导致"网络正常却报同步失败" |
| 空同步返回真值对象 | 同上：`merged` 为 false 时成功的空同步被误报失败 |
| 配置空值双重回落 | commit `253bc3b`/`6427394`：历史脏数据把默认仓库盖成空 |
| `e.name === 'TypeError'` 判定网络错误 | fetch 可能来自其它 realm，`instanceof` 会漏判 |
| 12s 超时 | 无超时会导致请求永久挂起 |

**改进点**：统一 `sync()` 返回值为 `{ ok: boolean; merged: boolean; pushed: boolean }`，消除现状"三种返回类型"的踩坑点（architecture.md §12 已列为技术债）。TypeScript 会强制所有调用方正确处理。

#### 3.3.3 Markdown（`lib/markdown/`）

marked 18 + 两个自定义 extension + DOMPurify。

- **`[[wiki]]` extension**：解析 `[[标题]]` / `[[标题|别名]]`，通过 resolver 判断目标是否存在，输出 `<a class="wikilink[ missing]" data-wiki="...">`
- **`==高亮==` extension**：输出 `<mark>`
- **安全模型变化**：现状是"全量转义"（等于完全不支持 HTML）；新方案是 marked 渲染后交 DOMPurify 白名单过滤。**这比现状更安全也更宽容**——既挡住 XSS，又不会把用户写的合法内容错误转义。
- **行为差异（属改进，需你确认接受）**：现状标题降级封顶 h3（`Math.min(h[1].length, 3)`），marked 会正常渲染 h4–h6。

#### 3.3.4 双链图（`lib/links.ts`）

现状 `buildGraph()` 在 `notes.js` 里，被列表、详情、图谱三处调用，**每次调用都全量重算**（扫描所有笔记正文）。

新方案抽为纯函数 + **Pinia `computed` 缓存**，笔记数据不变时不重算。这是相对现状的性能改进，且让它可被单测。

`renameRefs`（L11 改标题联动改引用）同样抽为纯函数：输入笔记数组与新旧标题，输出需要更新的笔记列表——**这是最值得测试的逻辑之一**，正则一旦写错会批量破坏用户数据。

#### 3.3.5 图谱（`components/graph/GraphCanvas.vue`）

- 布局交给 `d3-force`（内置 Barnes-Hut 近似，解决现状 O(n²)）
- 拖拽用 `d3-drag`，缩放用 `d3-zoom`
- **渲染改为 Vue 模板的 `v-for` + `:transform` 绑定**，替代现状的字符串拼 SVG + `innerHTML` 整树重绘（architecture.md §12 两项技术债一并解决）

#### 3.3.6 UI 组件

按 2.1–2.8 清单逐项实现。通用件交给 Element Plus，业务件保持自定义：

- **抽屉**：`el-drawer`（待办编辑、设置面板），统一遮罩 / `Esc` 关闭 / 点击外部关闭
- **Toast**：`el-message` / `el-notification`（X4 三档 ok/err/info）
- **确认框**：`el-message-box.confirm`（T13 / N9 删除确认、L7 缺失链接创建确认）
- **段控件 / Tabs**：`el-segmented` / `el-tabs`（T5 状态筛选、X1 三视图）
- **开关**：`el-switch`（S1 同步启用开关）
- **8 色色板**：业务专属，**自定义**实现（`TodoFilters` + 编辑抽屉颜色选择），组件库不提供
- **`[[` 补全的光标坐标测算**（A5）：镜像 div 方案原样移植到 `useWikiAutocomplete`，纯 DOM 计算无库可替
- **编辑防打断**（N6）：现状 `suppressRender` 标志改为**编辑器内容由本地 ref 持有，仅 flush 时写回 store**，机制上消除打断

---

## 4. 关键决策与权衡

### 4.1 数据 schema：结构不变、清空重来（**已裁定：2026-07-31**）

评审结论：**schema 结构保持不变（标题寻址），但"清空重来"——不保留任何旧数据的兼容/迁移代码，生产数据仓库以全新状态起步。**

- 双链寻址经确认**保持「标题寻址」**（与现有功能 1:1 一致，L11 改名联动逻辑保留），不改为 id 寻址，以降低重写风险
- 既然无需兼容，所有 `normalize` / `normTodo` / `normNote` 等历史脏数据回落与迁移分支**一律不移植**，数据层只实现"当前格式"的读写
- 生产数据仓库 `data/workbench.json` 视为可覆盖：首次同步会用新版结构写入，旧数据由用户自行决定是否先导出备份（S19 导出功能保留）
- 本地 localStorage 键名可沿用 `wb.data.v1` / `wb.cfg.v1`（仅本地，不涉及跨版本兼容）

### 4.2 路由：hash 模式

GitHub Pages 是纯静态托管，history 模式刷新子路径会 404（需要 404.html 兜底 hack）。**hash 模式（`/#/notes/xxx`）天然规避**，且带来现状没有的能力：笔记可以直接用 URL 分享/收藏。

现状的"localStorage 记忆上次视图"（X1）由路由自然承担。

### 4.3 缓存策略：Vite content hash 取代 `bump-version.sh`

现状靠手工执行 `bump-version.sh` 刷 `?v=` 时间戳，且**该脚本在 Linux/WSL 上因 BSD sed 语法直接报错**（architecture.md 列为 🔴 高危技术债，漏刷会导致线上跑旧代码）。

Vite 构建产物自带内容 hash（`app.a1b2c3d4.js`），**这个问题从机制上消失**，同时 AGENTS.md 红线 3 可以移除。

### 4.4 部署：GitHub Actions

```
push main → Actions: npm ci → type-check → test → build → deploy Pages
```

代价是 push 后需等约 1 分钟。收益是**每次发布都自动跑类型检查和测试**——这才是质量门禁该待的地方（现状全靠本地 git hook，可被 `--no-verify` 绕过）。

`vite.config.ts` 设 `base: './'` 保持相对路径特性，无需为 Pages 子路径做额外配置。

### 4.5 AGENTS.md 红线需同步修改（**需你批准**）

| 红线 | 现状 | 重构后 |
|---|---|---|
| 红线 2 禁引构建工具/框架/npm | 与本次重构直接冲突 | **需删除或改写** |
| 红线 3 改 js/css 必跑 `bump-version.sh` | 脚本将被删除 | **需删除** |
| 红线：`<script>` 顺序不可调 | 不再有手写 script 标签 | **需删除** |
| 红线：禁绕过 store.js / github.js | 语义仍然成立 | 改为指向新模块路径 |
| 红线：令牌不落库不落日志 | 仍然成立 | 保留 |

---

## 5. 实施顺序

你选择了「一次性重写」，因此下列是**开发顺序**而非分阶段发布计划。旧代码在新版验收通过前保持可运行（见第 8 节）。

| 步骤 | 内容 | 产出验证 |
|---|---|---|
| 1 | 脚手架 + TS 配置 + 目录骨架 + CI | `npm run build` 通过 |
| 2 | 类型定义 + 数据层 + 纯算法（merge/serialize/slug/links/renameRefs） | **单测全绿**（此步最关键） |
| 3 | 同步引擎移植（client/contents/diagnose/engine） | 单测（mock fetch）+ 对真实测试仓库联调 |
| 4 | Markdown（marked extension + DOMPurify） | 单测覆盖各语法 + 双链解析 |
| 5 | 基础组件与样式迁移（BaseSheet / Toast / 布局 / CSS 变量） | 视觉比对 |
| 6 | 待办视图（T1–T15） | 逐项对照验收 |
| 7 | 笔记视图 + 双链 + 自动补全（N1–N10, L1–L11, A1–A7） | 逐项对照验收 |
| 8 | 图谱视图（G1–G8） | 逐项对照验收 |
| 9 | 设置面板 + 诊断 + 导出（S17–S21） | 逐项对照验收 |
| 10 | 全量回归 + 移动端验证 + 部署上线 | 第 2 节清单全绿 |

**步骤 2、3 是重中之重**——数据合并算法出错会静默丢数据，且是唯一无法靠肉眼验收的部分。

---

## 6. 测试策略

现状零测试。新方案分三层，**不追求覆盖率数字，只覆盖"错了会丢数据/难以人工发现"的部分**：

| 层 | 工具 | 覆盖对象 |
|---|---|---|
| 单元测试 | Vitest | **LWW 合并**（远端新增/本地更新/时间戳相等/墓碑传播）、**serialize 墓碑清理**（30 天边界）、**diffFromRemote**、**renameRefs**（别名保留、正则边界）、slug 归一化、标题去重、Markdown 各语法 + wiki 解析、错误码映射 |
| 组件测试 | Vitest + @vue/test-utils | 筛选与搜索组合、卡片状态切换、自动补全键盘交互 |
| 类型检查 | `vue-tsc --noEmit` | 全量，CI 强制 |

同步引擎的网络层用 mock fetch 测重试与排队逻辑；真实链路验证走手动（对照 `.harness/docs/integration_test/integration_test.md` 的 29 条清单）。

**⚠️ 测试环境隔离**：现有代码在 repo/path 留空时会回落到生产数据仓 `GuoxinL/workbench-data`（`store.js:75-77`）。跑联调测试**必须显式指定测试仓库**，否则会写到你的真实数据。新版应在开发模式下对此加一道显式提示。

---

## 7. 收益与代价

**收益**

- 类型检查 + 单测 + CI 三层反馈闭环，AI 改动可自动验证
- 消除 architecture.md 列出的 6 项技术债（无测试、BSD sed、sync 返回值、全量重渲染、图谱 O(n²)、SVG 重绘）
- 单文件从 483 行降到组件级（预计每个 < 150 行）
- 依赖关系编译期可查，不再靠 script 行序

**代价**（如实列出）

| 代价 | 说明 | 缓解 |
|---|---|---|
| 失去"零构建"卖点 | 源码不再等于产物 | 部署仍全自动，用户侧无感知 |
| 新增 Node 开发依赖 | 需要 npm install | 你机器已有 Node v24.13.0；npmmirror 已验证可用 |
| 发布延迟约 1 分钟 | Actions 构建时间 | 换来自动质量门禁 |
| 引入 6+ 个运行时依赖 | Vue/Pinia/Router/marked/DOMPurify/d3-force/VueUse + **Element Plus** | 均为主流长期维护库；Element Plus 按需自动导入，产物预计 250–350KB gzip（含组件库，较纯手写 +150KB 左右） |
| 一次性重写有回归风险 | 3185 行行为需逐条对齐 | 第 2 节清单即验收基线；旧代码保留至验收通过 |

---

## 8. 风险与应对

| 风险 | 等级 | 应对 |
|---|---|---|
| **重写遗漏现有行为** | 🔴 高 | 第 2 节 70+ 项清单逐条验收；细节行为（如颜色筛选二次点击取消、光标坐标翻转）已在清单中固化 |
| **同步算法移植出错致丢数据** | 🔴 高 | 纯函数化 + 单测先行（步骤 2）；联调用独立测试仓库，**绝不指向生产数据仓** |
| TS 7 生态适配未就绪 | 🟡 中 | 锁 5.9 LTS，初始化时实测 7.0 再决定 |
| Vite 8 / Pinia 4 / Router 5 均为较新主版本 | 🟡 中 | 用官方脚手架 `npm create vue@latest` 生成，避免手工拼版本 |
| marked 行为与手写渲染器有差异 | 🟡 中 | 单测覆盖 2.5 节全部语法；差异项（h4-h6）已提前标注 |
| npm 安装受网络影响 | 🟢 低 | npmmirror 已验证可达 |

**旧代码处理**：你选择了「直接替换」。鉴于上次 `_wbtest.py` 误删且无法恢复的教训，我的执行方式是——**旧代码在整个重写期间原地保留并保持可运行**，直到第 10 步全量验收通过；删除时**先向你确认**，且确保删除内容已在 git 历史中（当前 `.harness/`、`AGENTS.md` 等尚未提交，建议先提交一次再动手）。

---

## 9. 需要你拍板的事项（**已于 2026-07-31 评审确认**）

| # | 事项 | 结论 |
|---|---|---|
| **1** | 数据 schema | **清空重来**：结构不变（标题寻址），不移植兼容/迁移代码，生产数据仓库全新起步（见 4.1） |
| **2** | 修改 AGENTS.md 红线 | **批准**：红线 2/3 与「script 顺序」删除或改写，令牌安全红线保留（见 4.5，实施时同步改） |
| **3** | UI 组件库 | **引入 Element Plus**（按需自动导入），8 色色板等业件仍自定义 |
| **4** | Markdown h4–h6 | **接受**：marked 正常渲染 h1–h6，属修复 |

另外确认一下：现在这套 `.harness/` 文档和 `AGENTS.md` 还没提交到 git（`git status` 显示全是未跟踪）。**已建议先提交一次再开始重构**，这样旧代码和文档都有明确的回溯点（见下一节执行）。

---

**评审已通过，4 项决策已确认。下一步：先提交 `.harness/` + `AGENTS.md` 基线，再按第 5 节顺序开始实施，从步骤 1 脚手架开始。**
