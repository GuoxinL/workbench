# 业务术语表

> 状态：已梳理（2026-08-04 对齐 Vue3 + Vite + TS + Pinia 重构后代码） | 维护者：Guoxin.Liu <lgx31@sina.cn>
>
> Source（以磁盘真实代码为准）：`src/stores/data.ts`、`src/services/sync/engine.ts`、`src/services/sync/merge.ts`、`src/services/sync/serialize.ts`、`src/services/storage/storageLayer.ts`、`src/services/db/*`、`src/services/github/*`、`src/lib/markdown/*`、`src/lib/links.ts`、`src/lib/slug.ts`、`src/lib/colors.ts`、`proxy/cloudflare-worker.js`
> Last-verified: 2026-08-04

## 范围

**只收录本项目私有的、非公知的术语。** 行业通用概念（localStorage、PWA、CORS、Markdown、Base64、Wiki 链接、乐观锁、防抖、ESM、力导向布局 等）和编程语言标准术语**不在本表范围**——AI 和工程师都已经知道这些。

本表的价值在于：一个熟练的高级工程师首次接触本项目时，哪些词他**无法靠经验推断**其含义，或者**会按通用含义理解从而误读代码**。

## 使用规则

- 代码/文档中首次使用本表中的术语时，用全称或括号注明缩写含义
- 新创缩写必须先在本表注册，禁止在代码中直接使用未登记的私有缩写
- 发现同义词混用时，在「易混术语对照」段统一约定，后续只用一种
- AI 遇到不认识的项目特有词汇时，应主动查阅本表或追问

## 术语表

| 术语 | 英文/缩写 | 别名（旧称） | 定义（本项目语境） | 出处/代码路径 |
|------|-----------|-------------|-------------------|--------------|
| **本地模式** | off | 未配置态 | 同步配置校验不通过（未启用 / 无 token / 仓库格式非 `owner/repo` / 无 branch）时进入的**降级运行态**：待办、文章、双链**功能完整**，只是数据不上云。它是**正常状态而非错误状态**——顶栏 SyncChip 不点红点，只显示「本地模式」。误把它当故障处理是最常见的误读 | `src/services/sync/engine.ts:82-90`（`isEnabled()` / `isConfigComplete()` 守卫）；`src/components/common/SyncChip.vue` |
| **脏标记** | dirty / 待推送 | 待同步标记 | 「本地存在尚未推送到 GitHub 的领先变更」。**当前实现中不再是持久化的 localStorage 标志位**：同步引擎每轮 `doSync` 经 `planSync(local, 目录树索引, wb.syncState.v1 基线)` 按 blob sha 三态算出本地相对远端有哪些 id 需要 `push`，无领先变更则整轮不写远端（避免空 commit）；本地优先写已先落 IndexedDB，所以变更**不会因未推送而丢失**。任何经 `storageLayer` 的 Save/Delete 都会触发 `schedulePush()` 安排下一轮同步 | `src/services/sync/diff.ts`（`planSync`）；`src/services/sync/engine.ts`（`aPlan.push`）；`src/services/storage/storageLayer.ts`（`schedulePush` 调用） |
| **逐条 LWW 合并** | per-record LWW | 冲突合并 | 远端数据并入本地的算法：以记录 `id` 为主键，**远端有而本地无 → 插入**；**两端都有 → 仅当 `remote.updatedAt > local.updatedAt` 才整条覆盖**。关键约束：① 合并粒度是**单条记录**不是整文件，所以两端同时改*不同*条目不会互相丢数据；② 合并**只吸收远端、从不删除本地多出的记录**，本地独有条目会在随后的推送里带上去 | `src/services/sync/merge.ts`（`mergeArticles` / `mergeTodos`） |
| **软删除墓碑** | tombstone | 墓碑 | 删除**永远不物理删**，而是置 `deleted:true` 并刷新 `updatedAt`，让"删除"这个动作本身能经 LWW 传播到其它设备（否则会被别端的旧数据"复活"）。墓碑在 `cleanupTombstones` 时按**过期窗口**清理，只影响推送到远端的内容，本地数组不动。看到 `DeleteTodo/DeleteArticle` 请勿理解为物理删除 | `src/services/storage/storageLayer.ts`（`Delete*` → 置墓碑）；清理 `src/services/sync/serialize.ts`（`cleanupTombstones`） |
| **并发排队** | inFlight queue | — | `sync()` 的并发策略：复用进行中的 `inFlight` Promise，而非"忙就 return false"——避免把"正忙"误判成"同步失败"（历史上早期实现有此 bug）。静默调用（轮询、防抖推送）与用户主动调用都汇入同一条 `inFlight`，保证刚编辑的内容一定被推上去 | `src/services/sync/engine.ts:161-169`（`sync()` 复用 `inFlight`） |
| **双向链接** | 双链 / wikilink | — | 语法 `[[文章标题]]` 或 `[[文章标题\|显示名]]`。本项目关键私有约定：**链接以「标题」而非文章 id 寻址**，匹配键走 `slug()` 归一化。由此派生三条行为——改标题时会自动重写其它文章中的 `[[旧标题]]`（否则改名即断链）；指向不存在标题的链接是**合法的「待建」链接**；自引用（指向自己）被忽略不计入图 | 语法/提取 `src/lib/markdown/*`（`scan-wikilinks.ts`、`wikilink.ts`）；改名联动 `src/lib/links.ts`（`renameRefs`） |
| **`slug()`** | — | — | ⚠️ **不是**通常意义的 URL slug（不转拼音、不转连字符、不去标点）。本项目 `slug()` 只做三件事：`trim` + 转小写 + 把连续空白折叠成单个空格。它是**双链标题匹配与文章查重的唯一键**，因此「My Note」「my  note」被视为同一篇。按 URL slug 理解会得出完全错误的匹配结论 | `src/lib/slug.ts` |
| **待办转文章** | todoToArticle | 转为笔记（旧称） | 一个**幂等**的项目专有动作，不是简单"新建一篇笔记"：① 若该待办已有关联文章则直接返回既有文章；② 建立 `todo.articleId` ↔ `article.fromTodo` 反向指针。早期版本字段名是 `noteId`/`fromTodo`（笔记=note），重构后重命名为 `articleId`/`fromTodo`（文章=article），旧 `wb.data.v1` 里的 `noteId` 由 `migrateData()` 自动映射为 `articleId` | `src/stores/data.ts`（`migrateData` 字段重映射）；反向指针 `articleId` / `fromTodo` |
| **`wb.*` 键族** | — | — | 本项目在 localStorage 占用的 **3 个** key：`wb.data.v1`（主数据快照，即时加载层 + 零配置启动契约）、`wb.cfg.v1`（同步配置，**含明文 token，永不上传**、永不打日志、永不硬编码）、`wb.syncState.v1`（本地同步基线，`path → blob sha` 字典，如 `{"kb/1.md":"abc…","todos/2.json":"def…"}`；替代旧的单值 `wb.manifestSha.v1`）。红线「禁止绕过 `stores/data.ts` 直接读写 `wb.*`」针对这 3 个 | `src/stores/data.ts:22-24`（键名常量 `DATA_KEY` / `SYNC_STATE_KEY` / `CFG_KEY`） |
| **8 色分类** | ColorKey | 颜色标签 | 待办的分类维度，**每个色号绑定固定语义**，不是纯装饰：`blue`=常规、`red`=紧急、`amber`=重要、`green`=推进中、`purple`=思考、`teal`=协作、`pink`=个人、`slate`=待定。代码里只会看到色号（如 `color:'amber'`），语义只存在于 `ColorKey` 表的 `name` 字段里。非法色号一律回落成 `blue` | 定义 `src/lib/colors.ts`（ColorKey 类型与色名表） |
| **双白名单** | — | — | 代理 Worker 的两层**互相独立**的准入控制，必须区分：**路径白名单** `ALLOW`（正则，限制"能转发哪些 GitHub 接口"，防 Worker 被当公共代理滥用，含 `/repos/{o}/{r}/contents/**` 因此图云 `images/` 也覆盖）与**来源白名单** `ALLOW_ORIGINS`（限制"谁能调用这个 Worker"，默认仅 `https://guoxinl.github.io`）。两者任一不过都返回 403，但含义与排查方向完全不同 | `proxy/cloudflare-worker.js`（`ALLOW` 路径、`ALLOW_ORIGINS` 来源） |
| **五步诊断** | diagnose | 同步诊断 | 把笼统的"同步失败"拆成**有序且遇错即中断**的 5 步定位流程：配置检查 → 网络连通（**不带 token 的纯连通性探测**）→ 令牌有效性 → 仓库访问与写权限 → 数据文件（＋可选公开库 `workbench-public` 检查）。语义关键点：**返回的步骤数组长度本身就是信息**——中断在第几步即根因所在，后续步骤不会执行 | `src/services/github/diagnose.ts`（`runDiagnose`）；UI 在 `src/components/common/SettingsSheet.vue` |
| **图云层** | image cloud | 图片云 | 图片存储的隔离抽象层（`services/image` 的 `ImageCloudLayer`），在「极简 / 同步」两支间路由。**极简模式**把图片存浏览器 IndexedDB 图片 store，引用键 `local-img:<sha>`（仅本地可用）；**同步模式**把图片推到 git 分支 `images/<hash>.<ext>`，引用键 `images/<hash>.<ext>`（跨端可用，`ShareView` 拼 `raw.githubusercontent.com` 直链渲染）。视图/组件不直接碰图片 store 或 Contents API，统一经 `stores/data.ts.uploadImage/resolveImage` | `src/services/image/index.ts`（`createImageCloudLayer`，按 `isConfigComplete` 路由）；`src/stores/data.ts:438-446` |
| **`kb/<id>.md`** | — | — | 远端数据仓库里**每篇文章一个**的 Markdown 文件，frontmatter 承载 `title/tags/...`，正文为 Markdown；同步按 id 差分 GET/PUT，**取代早期单文件 `data/workbench.json`** | `src/services/github/contents.ts`（`kb/${id}.md`） |
| **目录树 blob sha 索引** | — | 中央 `manifest.json`（旧称，已废弃） | 同步时**现拉现用**的轻量索引：`GET contents/kb`、`GET contents/todos` 两个目录树，取每个文件的 **blob sha** 作为该 id 的远端指纹，再按差异拉正文 / 推送；PUT/DELETE 的乐观锁 sha 也取自刚拉到的目录树（`treeShaByPath`）。**2026-08-04 起取代旧的中央 `manifest.json`**——后者已不再写入/播种，`manifest.ts` 仅保留 `@deprecated` 的 `getManifest` 只读兼容既有仓库遗留文件 | `src/services/github/listDir.ts`（`fetchIndex`）；`src/services/github/contents.ts`；判定 `src/services/sync/diff.ts` |
| **IndexedDB 数据层** | db layer | — | `services/db` 提供的结构化本地存储（单实体存储 + 分页索引）+ 图片 store；与 `wb.data.v1`（即时加载层）构成**本地双重存储**。`storageLayer` 的 Save/Delete 先写它，毫秒级返回、离线可用 | `src/services/db/*`（`indexeddb.ts` / `schema.ts` / `types.ts`） |
| **storageLayer 双写** | — | — | `services/storage/storageLayer.ts`：视图与底层存储之间的**唯一可写入口**，把「本地 IndexedDB（立即落盘）」与「远端 GitHub（后台异步同步）」收敛成统一接口（Save*/List*/Delete*）。视图/组件只调 `stores/data.ts` mutator，不直接碰 `wb.*` 或 GitHub API | `src/services/storage/storageLayer.ts` |
| **Vite 内容 hash** | — | bump 版本（旧称，已弃用） | 构建产物 `assets/index-<hash>.js` 等带内容哈希文件名，**缓存失效由构建机制保证**，取代早期手工 `?v=` 版本参数 / `bump-version.sh`。改任何源码后只需重新构建，无需手工 bump | `vite.config.ts`（`base:'./'`、构建输出） |

> 收录标准：高级工程师首次看到这个词，能否不查资料就理解？不能 → 收录。能 → 不收录。

## 项目缩写速查

| 缩写 | 全称 | 说明 |
|------|------|------|
| `S` / `GH` / `SYNC` | `stores/data` / `services/github` / `services/sync` | 领域模块前缀，见到 `src/stores`、`src/services/github`、`src/services/sync` 即对应 |
| `ac*` | autocomplete | 文章编辑器里 `[[` 触发的标题自动补全状态（候选 / 高亮项 / 待替换区间） |
| `LWW` | last-write-wins | 仅在「逐条 LWW 合并」语境下使用，本项目含义见术语表 |
| `IDB` | IndexedDB | 经 `services/db` 访问的结构化本地存储层 |

## 易混术语对照

| 术语 A | 术语 B | 区别 | 本项目统一用 |
|--------|--------|------|-------------|
| **待办**（实体 Todo） | **待办**（状态 `status='todo'`） | 同一个中文词指两样东西：前者是数据实体（`todos[]` 里的一条记录），后者是该实体三档状态之一（`todo`/`doing`/`done` → 待办/进行中/已完成） | 指实体写「待办卡片」，指状态写「待办态」或直接用 `status='todo'` |
| **引用了**（`outMap`） | **被引用**（`inMap`） | UI 名 ↔ 代码名不一致：文章详情里「引用了」= 本篇正文里出现的 `[[X]]` 所指向的文章；「被引用」= 其它文章正文里引用了本篇。`missing` 是本篇引用了但目标尚不存在的（UI 计在「引用了 (+N 待建)」，不计入 `outMap` 长度） | 代码用 `outMap`/`inMap`/`missing`，UI 文案用「引用了」/「被引用」/「待建」 |
| **路径白名单**（`ALLOW`） | **来源白名单**（`ALLOW_ORIGINS`） | 都在 Worker 里、都返回 403，但一个管"转发到 GitHub 的哪些接口"（正则匹配 `url.pathname`，含 contents 路径与图云 `images/`），一个管"哪个站点能调用本 Worker"（匹配 `Origin` 头）。新增一个 GitHub 接口要改前者，换部署域名要改后者 | 必须带前缀说「路径白名单」/「来源白名单」，禁止只说「白名单」 |
| **同步内部态 `ok`** | **UI「已同步」** | **不是一一对应**：内部状态机只有 `idle`/`syncing`/`ok`/`error`/`off` 五态，但 `ok` 态下 UI 会再看一眼本轮 diff——有领先变更则随后推完显示「已同步」，无变更直接「已同步」。**「本地模式」对应 `off` 而非 `error`** | 谈状态机用 `ok`/`error`/`off`，谈界面用「已同步」/「同步中」/「同步失败」/「本地模式」 |
| **色号**（`color:'amber'`） | **颜色展示名**（「橙 · 重要」） | 数据里只存色号；`ColorKey` 的 `name` 是「色名 · 语义」合成串。UI 两处用法还不同：色块 hover 提示用**全称**，卡片底部标签只取语义半段「重要」 | 代码里一律用色号；文档描述分类时写「橙 · 重要」全称 |
| **`todo.articleId`** | **`article.fromTodo`** | 待办转文章时同时写下的**一对反向指针**，方向相反：`articleId` 是待办 → 文章，`fromTodo` 是文章 → 待办。删除文章时只清空 `articleId`，`fromTodo` 会指向一个已成墓碑的待办，读取时须判空 | 按方向直呼字段名，勿统称「关联 id」 |
| **代码仓库 `workbench`** | **数据仓库 `workbench-data`** | 两个不同的 GitHub 仓库：前者放源码、**必须公开**（GitHub Pages 要求）；后者只放 `kb/<id>.md` + `todos/<id>.json`（+ 图云 `images/<hash>.<ext>`）、`必须私有`（存的是个人待办与文章）。同步指向的永远是后者 | 明确写「代码仓库」/「数据仓库」，禁止只说「仓库」 |
| **极简模式** | **同步模式**（图云） | 图云层按 `isConfigComplete(cfg)` 路由：未配置 GitHub → 图片存本地 IndexedDB（`local-img:<sha>`，仅本机）；已配置 → 图片推 git（`images/<hash>.<ext>`，跨端）。同一张图在不同模式下键不同，切换配置时由协调逻辑处理 | 谈图云明确说「极简 / 同步」模式，禁止只说「图片」 |

## 弃用术语

| 旧术语 | 弃用日期 | 替换为 | 原因 |
|--------|----------|--------|------|
| **bump 版本 / `?v=` 参数 / `bump-version.sh`** | 2026-07-31 | Vite 内容 hash | 重构引入 Vite 构建流水线，产物自带内容 hash，缓存失效由构建机制保证，手工 bump 脚本已移除 |
| **`data/workbench.json` 单文件数据载体** | 2026-07-31 | `kb/<id>.md` + `todos/<id>.json` | 重构后远端按文章/待办拆分，索引驱动差分同步，降低配额消耗与冲突面 |
| **中央 `manifest.json` 索引 / `wb.manifestSha.v1`** | 2026-08-04 | 目录树 blob sha 索引 + `wb.syncState.v1`（`path → sha`） | 中央索引本身成为写入热点与冲突源；改为现拉 `kb/`、`todos/` 目录树取每文件 blob sha，同步链路不再写 `manifest.json`（`manifest.ts` 仅留 `@deprecated` 只读兼容） |
| **笔记 / Note（`noteId`）** | 2026-07-31 | 文章 / Article（`articleId`） | 术语重命名，`wb.data.v1` 旧 `noteId` 由 `migrateData()` 自动映射 |
| **`window.WB` 全局 IIFE 命名空间 / `js/*.js`** | 2026-07-31 | ES Module + Vue SFC（`src/**`） | 重构为 Vite + Vue3 标准工程 |
| **`wb.dirty` / `wb.device.v1` 键** | 2026-07-31 | 引擎内 diff（现为 `sync/diff.ts` 的 `planSync`）；设备标识未沿用 | 脏标记改为每轮 diff 计算；设备维度标识在重构后未保留 |

## 不收录清单（提醒）

以下类型的术语**不要**添加到本表：

- 行业标准：API、SDK、REST、CI/CD、CORS、PWA、Base64、Markdown、Wiki 链接...
- 语言/浏览器标准：localStorage、Promise、`AbortController`、`fetch`、ESM、防抖（debounce）...
- 通用分布式/存储概念：乐观锁、CAS、最终一致性、软删除、tombstone 的通用定义...
- 通用设计模式：MVC、单例、观察者、事件总线...
- **公开文档定义的第三方概念**：GitHub Contents API 的 `sha` 字段语义、PAT / 细粒度令牌、GitHub Pages、Cloudflare Worker、`.nojekyll`...
- **名字自解释的标识符**：`apiBase`（API 根地址）、`poll`（轮询间隔）、`repo`/`branch`/`token`...
- 任何一个高级工程师不用查就能理解的词
- 任何搜索引擎搜一下就能找到准确定义的词
