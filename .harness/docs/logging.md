# 日志规范

> 维护者：Guoxin.Liu <lgx31@sina.cn> | 最后更新：2026-07-31
>
> Source: `js/store.js`、`js/github.js`、`js/util.js`、`js/app.js`、`proxy/cloudflare-worker.js`、`scripts/pre_commit_check.sh`
> Last-verified: 2026-07-31

---

## 1. 范围与形态判定

本项目是**纯静态前端 PWA，无后端、无日志库、无日志采集系统**（无 `package.json`、无服务端进程、无日志文件、无 ELK/APM，见 `architecture.md` §9）。因此本文档**不适用**传统服务端日志规范（FATAL/INFO 分级、动态调级、结构化 JSON、traceId 传播一律 **N/A**）。

本项目真实存在的是**三条运行时输出通道**，其中后两条（用户可见反馈）在无后端场景下承担了日志的主要职责：

| # | 通道 | 载体 | 受众 | 留存 | 代码位置 |
|---|------|------|------|------|---------|
| 1 | **浏览器 Console** | `console.error` / `console.warn` | 开发者（自己） | 会话级，刷新即丢 | `js/store.js:58,67,72`（**全仓库仅此 3 处**） |
| 2 | **Toast 提示** | `U.toast(msg, type, ms)`，`ok`/`err`/`info` 三档 | 使用者 | 2.2–3.2 秒后消失 | 定义 `js/util.js:105-116`；**17 个调用点**（见 §3.2） |
| 3 | **同步状态胶囊 + 五步诊断面板** | 顶栏四态圆点 + 设置面板逐步检测结果 | 使用者 | 常驻（胶囊）/ 面板关闭即清 | 胶囊 `js/app.js:102-118`；诊断引擎 `js/github.js:284-368`、渲染 `js/app.js:144-166,242-260` |

**唯一具备持久留存的"日志"**：数据仓库 `workbench-data` 的 commit 历史——每次成功推送产生一条 commit，message 为 `workbench: sync <本地时间>`（`js/github.js:127`）。它是本项目**唯一可事后回溯的时间线**，排查"数据什么时候变的 / 哪次同步丢了内容"必须先看它。

---

## 2. 级别使用约定

项目只使用 `console` 的两个级别，**其余级别被 pre-commit 钩子硬拦截**。

| 级别 | 是否可用 | 语义与使用场景 | 现有证据 |
|------|---------|---------------|---------|
| `console.error` | ✅ 可用 | **吞掉的异常**：捕获后不再向上抛、且不打断主流程的错误。当前唯一场景是事件总线里单个监听器抛错——必须记录，否则该监听器静默失效且无人知晓 | `js/store.js:58` |
| `console.warn` | ⚠️ 存量可用，**新增被钩子拦截** | **降级可继续**：本地持久化数据/配置解析失败，回落到默认值后功能仍完整 | `js/store.js:67`（数据解析失败）、`js/store.js:72`（配置解析失败） |
| `console.log` / `console.info` / `console.debug` | ❌ 禁止 | 调试残留 | — |
| `console.trace` / `console.table` / `console.group` | ❌ 禁止 | 同上 | — |

### 2.1 pre-commit 硬约束（必读）

`scripts/pre_commit_check.sh:421-423` 对 `.js` 暂存**新增行**执行正则拦截：

```
console\.(log|warn|debug|info)\(
```

命中即 `return 1` 阻断提交（`scripts/pre_commit_check.sh:462-469`）。三点推论：

1. **新代码里写 `console.warn` 会被拒绝提交**——需要告警语义时用 `console.error`，或改走 toast。
2. `console.error` **不在**拦截正则内，是唯一能新增的 console 级别。
3. 检查只看**新增行**（`git diff --cached -U0`，`scripts/pre_commit_check.sh:401-403`），`js/store.js:67,72` 两条历史 `console.warn` 因此得以存量保留；**不要把它们当作"新增 warn 是允许的"依据**。

### 2.2 无构建 = 无"生产降级"，只能不写

项目零构建（AGENTS.md 红线 2），仓库里的 `js/*.js` 就是 GitHub Pages 上跑的那份文件，**不存在 dead-code elimination、不存在 `NODE_ENV` 分支、不存在运行时日志级别开关**。因此：

- **禁止**"先加调试 log，上线前删"的工作方式——忘删即上线，且没有任何机制兜底。
- **禁止**引入 `DEBUG` 开关变量做条件日志（等于给自己留一个必然被遗忘的开关，也无处配置）。
- 临时调试请用 DevTools 断点 / Watch / Logpoint（**不落代码**），或在 Console 里直接调 `WB.store` / `WB.gh` 暴露的接口（`js/store.js:347-360`、`js/github.js:374`）。

---

## 3. 必须 / 禁止输出的场景

### 3.1 必须有输出的场景

| # | 场景 | 通道 | 现状 |
|---|------|------|------|
| 1 | 捕获后吞掉的异常（不再上抛且不中断主流程） | `console.error` | ✅ `js/store.js:58` |
| 2 | 本地持久化读写失败 | `console.warn`（存量）+ toast | ✅ 读失败 `js/store.js:67,72`；写失败 toast `js/store.js:92` |
| 3 | 同步失败 | 状态胶囊转红 + 非静默时 toast | ✅ `js/github.js:203-204`、`js/app.js:112` |
| 4 | 同步成功 / 数据落库 | 状态胶囊 + toast | ✅ `js/github.js:189`、`js/app.js:98,180` |
| 5 | 降级为本地模式（配置不完整） | 状态胶囊 `off` + toast | ✅ `js/github.js:222,243`、`js/app.js:184` |
| 6 | 外部调用失败的**可执行归因** | 诊断面板逐步结果 | ✅ 五步诊断，失败即中断并给出处置建议（`js/github.js:297-365`） |
| 7 | 用户的破坏性/不可逆操作 | toast | ✅ 删除、转笔记、批量改引用等（`js/todos.js:57,65`、`js/notes.js:47,302`） |

**错误消息质量要求**（本项目把"错误消息"当日志用，因此要求高于普通 UI 文案）：错误必须**中文化 + 指出处置动作**，禁止直接抛英文原文或裸状态码。已建立三层：网络层 `req()` 把 `Failed to fetch` / `AbortError` 翻成含处置建议的中文（`js/github.js:74-86`）→ 协议层 `readErr()` 把 401/403/404 映射成人话（`js/github.js:93-103`）→ 展示层决定进 toast 还是诊断行。新增外部调用必须复用这三层，不要另起一套。

### 3.2 禁止 / 限制输出的场景

| # | 规则 | 原因 |
|---|------|------|
| 1 | **禁止**输出任何令牌相关内容 | 见 §4，本项目最高优先级红线 |
| 2 | **禁止**新增 `console.log/warn/info/debug` | pre-commit 拦截（§2.1）；且无构建 = 必然上线 |
| 3 | **禁止**在高频路径打日志 | 轮询默认 20s（`js/github.js:244`）、防抖推送 1.5s（`js/github.js:237`）、`change` 事件触发全量重渲染（`js/app.js:27-30`）——这些路径加日志会刷屏并掩盖真实错误 |
| 4 | **禁止**输出完整数据文档 | `data` 含全部笔记正文，属用户隐私内容；需要看时在 Console 手动 `WB.store.data` 即可，不要写进代码 |
| 5 | **禁止**为"正常但少见"的分支报错 | 如"远端文件尚未创建"（`js/github.js:111`）、"两端已一致无需推送"（`js/github.js:181`）都是成功路径。历史上正是把成功当失败报出过 bug（`js/github.js:178-180` 注释、`architecture.md` §10 决策 5/6） |
| 6 | **限制**静默同步的用户可见反馈 | 轮询/防抖推送传 `silent:true`，失败只点红胶囊不弹 toast（`js/github.js:204`）；否则断网时每 20 秒弹一次 |
| 7 | **禁止**在 Worker 里打印请求头或请求体 | 见 §4 风险点 F |

---

## 4. 脱敏红线：GitHub PAT

> 通用条款遵循 [coding-style.md](coding-style.md) §10「密钥与敏感信息」——其中「**【禁止】** 日志输出：密码、密钥、Token、指针值」为本节上位规则，此处不复制，只补充**本项目特有的具体风险点**。
> 上位约束另见 AGENTS.md 红线 5、`architecture.md` §11。

**红线**：GitHub PAT **绝对禁止**出现在任何 console 输出、错误消息、toast、诊断行、Worker 日志、`data/workbench.json` 与源码中。令牌泄漏 = 交出 GitHub 账户写权限。

### 4.1 点名风险点（含令牌的对象在此流转，任何一处加 console 即泄漏）

| 标记 | 位置 | 风险载体 | 说明 |
|------|------|---------|------|
| **A** | `js/github.js:54-60` `headers(c)` | 返回对象含 `Authorization: 'Bearer ' + c.token` | **最高危**。调用点 5 处：`js/github.js:109`、`135`、`261`、`321`、`335`。打印 `headers(c)`、打印 `req()` 的 `init` 参数、或 `JSON.stringify(init)` 均直接泄漏明文令牌 |
| **B** | `js/github.js:67-91` `req(url, init, ms)` | `init.headers.Authorization` | catch 块（`:73-87`）里当前只用 `e.message` 构造新错误，**正确**。若改成打印 `init` 或 `{url, init, e}` 即泄漏 |
| **C** | `js/store.js:70` `loadLocal()` | 局部变量 `raw` 是 `wb.cfg.v1` 的原始 JSON 串，**含 token 明文** | `js/store.js:72` 当前只打印异常对象 `e`，**正确**。若为排查解析失败而改成 `console.warn(..., raw)` 就会把令牌打进 Console。**这是本项目最容易踩的一脚** |
| **D** | `js/store.js:96-101` `saveCfg` / `js/store.js:351` `get cfg()` | `cfg` 对象含 `token` 字段（`js/store.js:31-39`） | `console.log(S.cfg)` / `console.log(next)` 即泄漏。`saveCfg` 的 catch（`:98`）当前**空实现**，正确——不要"顺手"补成打印 `cfg` |
| **E** | `js/app.js:229-239` `readCfg()` | 返回对象含 `token: $('#cfgToken').value.trim()` | 该对象被传入 `WB.gh.test(c)`（`js/app.js:140`）与 `WB.gh.diagnose(readCfg(), ...)`（`js/app.js:155`）。任何位置 `console.log(c)` 即泄漏 |
| **F** | `proxy/cloudflare-worker.js:73-77` | `headers` 与 `request.headers` 均含 `Authorization` | Worker 当前**无任何 console 调用**，且 `:72` 注释明示"Worker 自身不存储、不记录令牌"。一旦加 `console.log(headers)` / `console.log([...request.headers])`，令牌将进入 Cloudflare 实时日志（平台侧留存，不在使用者掌控内），**破坏 `proxy/cloudflare-worker.js:5`「令牌只经过你自己的 Worker」的承诺** |
| **G** | `js/app.js:210` | `$('#cfgToken').value = c.token \|\| ''` | 非 console，但令牌明文回填进 DOM。`index.html:235` 的 `type="password"` **只是视觉遮蔽**，DevTools Elements 面板与 `document.querySelector('#cfgToken').value` 都能读到。截图 / 录屏 / 远程协助场景需先关设置面板 |

### 4.2 已建立的正确做法（新增代码照此执行，勿破坏）

- **令牌只判空、不回显**：诊断第 1 步只输出"未填写访问令牌"（`js/github.js:301`），回显的是 `repo`/`branch`/`path`（`js/github.js:303`）——**永远不回显 token 本身，哪怕是脱敏后的前后 4 位**（PAT 前缀 `github_pat_` / `ghp_` 本身即可暴露令牌类型，且本项目无任何需要"确认是哪个令牌"的多令牌场景）。
- **令牌不参与序列化**：`serialize()` 只输出 `version/updatedAt/todos/notes`（`js/store.js:312-321`），`cfg` 结构性隔离在外，因此导出功能（`js/app.js:188-195`）也天然不带令牌。**新增持久化字段时务必确认没把 cfg 的任何字段掺进来**。
- **错误消息只用服务端 message**：`readErr()` 取 `j.message`（`js/github.js:97`），不回显请求头。

---

## 5. 可观测手段

### 5.1 浏览器侧（主战场）

| 手段 | 路径 | 看什么 | 备注 |
|------|------|--------|------|
| **Console** | DevTools → Console | 仅 3 条日志点（`js/store.js:58,67,72`）+ 未捕获异常堆栈 | 日志极少是设计使然，Console 干净 → 未捕获异常一眼可见 |
| **Network** | DevTools → Network，过滤 `api.github.com` 或代理域名 | 实际最有效的"请求日志"：GET/PUT 的 URL、状态码、耗时、响应体、`x-ratelimit-remaining` / `x-oauth-scopes` 响应头 | ⚠️ 请求头里**有令牌明文**，共享 HAR 文件 / 截图前必须删掉 `Authorization` 行 |
| **Application → Local Storage** | DevTools → Application → Local Storage | `wb.data.v1`（全量数据）、`wb.dirty`（是否有未推送变更）、`wb.device.v1`（设备标识）、`wb.cfg.v1`（配置，**含令牌明文，勿截图**）、`wb.view` / `wb.seeded`（UI 态） | 键的归属见 `architecture.md` §3 |
| **诊断面板** | 应用内：设置 → 诊断 | 五步逐项检测：配置检查 → 网络连通 → 令牌有效性 → 仓库访问与写权限 → 数据文件；失败即中断并给处置建议 | 面向使用者的一等排查入口，**同步类问题先跑它**（README.md:93-122） |
| **版本号** | 应用内：设置面板右下角 `#wbVersion`，来自 `<meta name="wb-version">` | 确认浏览器当前跑的是哪次发版 | 排查"改了没生效"必看——先比对它与 `index.html` 里的时间戳，命中缓存旧代码是本项目有前科的故障（AGENTS.md 红线 3、`failures.md`） |

### 5.2 Worker 侧（仅在使用了 API 代理时）

| 手段 | 可用性 | 说明 |
|------|--------|------|
| Worker 自身日志 | **无** | `proxy/cloudflare-worker.js` 全文无 console 调用；错误只以 HTTP 响应体返回（`:56`、`:64`、`:89`），使用者在浏览器 Network 里就能看到 |
| Cloudflare Dashboard 实时日志 | 平台能力，需在自己的 Cloudflare 账号内查看 | Worker 由使用者手动在 dash.cloudflare.com 粘贴部署（`proxy/cloudflare-worker.js:7-11`、`devops/deployment.md:178`），Dashboard 侧的请求日志属平台自带，无需改代码 <!-- TODO(sop.init): 具体入口路径（Workers & Pages → 对应 Worker → Logs）未在本机实测，首次使用时核实后补录 --> |
| `wrangler tail` | **未验证** | 仓库内**不存在 `wrangler.toml`**、无 CLI 部署链路（`devops/test-env-deploy.md:115`、`devops/deployment.md:178`），需自行安装 wrangler 并登录同一账号才可能用 <!-- TODO(sop.init): 未实测，勿在排障文档中当作既定手段 --> |

> ⚠️ 无论用哪种 Worker 侧手段，**都禁止为了排查而打印请求头**（§4 风险点 F）。需要确认"请求有没有到 Worker"时，看 HTTP 状态码与响应体即可——白名单拒绝会明确返回 403 + 原因（`proxy/cloudflare-worker.js:56,64`）。

### 5.3 远端持久线索

| 手段 | 说明 |
|------|------|
| 数据仓库 commit 历史 | `workbench-data` 每次成功推送一条 commit，message `workbench: sync <本地时间>`（`js/github.js:127`）。**本项目唯一可事后回溯的时间线**：数据何时变更、变更了什么（diff）、是否发生过覆盖，全靠它 |
| GitHub 令牌用量 | GitHub 设置页可看 PAT 的最近使用时间；`/rate_limit` 响应头 `x-ratelimit-remaining` 可判断是否被轮询打满（认证配额 5000/小时） |

---

## 6. 无 trace-id 时如何定位问题

项目**不存在也不需要** traceId：无后端、无跨服务调用、无并发请求上下文（`architecture.md` §6「无 traceID / 无请求链路标识（无后端，不适用）」）。**禁止**为"规范完整性"生造一个 traceId 字段。

多设备场景下的定位靠以下三个维度组合：

1. **设备维度 — `deviceId`**：`wb.device.v1`，格式 `dev_<base36时间>_<随机6位>`（`js/store.js:79-83`、`js/util.js:9-13`）。
   - 读取：DevTools Console 执行 `WB.store.deviceId`（`js/store.js:353` 暴露），或 Application → Local Storage 看 `wb.device.v1`。
   - ⚠️ **它不参与任何自动输出**——合并算法只看 `updatedAt`，全项目无消费方（`architecture.md` §12 列为技术债）。定位时只能**人工**在每台设备上读出来做区分，不要以为日志里会带上它。
2. **时间维度 — `updatedAt`**：每条 todo/note 都带毫秒级 `updatedAt`（`js/store.js:113-138`），根文档也有一个（`js/store.js:48`）。跨设备比对同一 `id` 的 `updatedAt`，即可判断 LWW 合并时谁赢了、谁的写入被丢弃。
3. **发版维度 — `wb-version`**：确认各设备跑的是不是同一份代码（§5.1 末行）。

**推荐排查顺序**（以"某条笔记在 A 设备改了、B 设备没生效"为例）：

```
① 两端设置面板对版本号 → 排除缓存旧代码
② 两端跑「诊断」→ 排除网络/令牌/权限
③ 看数据仓库 commit 历史 → 确认 A 的改动到底有没有推上去
④ 若已推上去：B 端 Application 里看 wb.data.v1 中该 id 的 updatedAt，
   与远端 JSON 比对 → 判断是没拉到，还是拉到了但被 LWW 判定为「本地更新」
⑤ 记下两端 deviceId 与各自的 updatedAt，作为归因结论写进 failures.md
```

---

## 7. 生产环境（GitHub Pages）保留策略

生产 = `main` 分支源码本身，**与开发环境同一份文件**，无环境变量、无差异化构建。

| 项 | 策略 |
|----|------|
| 保留的 console 日志 | 仅 `js/store.js:58`（`console.error`，监听器异常）与 `js/store.js:67,72`（`console.warn`，本地解析失败）三条。它们均属"静默失效"类问题，无输出则无从发现，必须保留 |
| 日志级别开关 | **不存在**，也不要引入（§2.2） |
| 日志留存 | **无**。Console 随页面刷新丢失，toast 秒级消失。需要留证据只能：手动复制 Console 输出 / 保存 HAR（**先删 `Authorization` 头**）/ 截图（**先关设置面板**）→ 归档到 `failures.md` |
| 采集上报 | **无，且不引入**。任何埋点/日志上报 SDK 都会违反 AGENTS.md 红线 2（禁引依赖），且需要一个本项目刻意不存在的后端 |
| 用户侧自助排查 | 依赖内建「诊断」，这是无日志采集条件下的替代方案（README.md:93-122）。**新增外部调用时应同步在 `diagnose()` 里加一步**（`js/github.js:284-368`），否则该失败面对使用者不可见 |

---

## 8. Code Review 检查清单

- [ ] 新增代码是否引入了 `console.log` / `console.info` / `console.debug` / `console.warn`？（前三者禁止；`warn` 会被 pre-commit 拦截，改用 `console.error` 或 toast）
- [ ] 是否有任何位置打印了 `cfg` / `readCfg()` 返回值 / `headers(c)` / `req()` 的 `init` / `store.js:70` 的 `raw`？（§4 风险点 A–E，**一票否决**）
- [ ] Worker 是否新增了 console 调用或请求头打印？（§4 风险点 F，**一票否决**）
- [ ] 新增的错误消息是否中文化并给出了处置动作，而非裸抛英文原文 / 状态码？（复用 `req()` + `readErr()` 三层，勿另起一套）
- [ ] 捕获后吞掉的异常是否有 `console.error`？空 catch 块必须有明确注释说明为何可以静默
- [ ] 是否在轮询 / 防抖推送 / `change` 重渲染等高频路径上加了输出？
- [ ] 静默同步（`silent:true`）路径是否误加了 toast？（会导致断网时反复弹窗）
- [ ] 成功但少见的分支（远端文件不存在、无需推送）是否被误报成错误？（历史 bug，见 `js/github.js:178-180`）
- [ ] 新增外部调用是否同步在 `diagnose()` 中补了对应检测步骤？
- [ ] 新增持久化字段后，`serialize()` 是否仍不含任何 `cfg` 字段？（`js/store.js:312-321`）

---

## 参考

- 编码规范（§10 密钥与敏感信息为本文脱敏条款的上位规则）：[coding-style.md](coding-style.md)
- 架构文档（§9 横切关注点 / §11 不变式）：[architecture.md](architecture.md)
- 接口规范（错误消息与响应约定）：[apis/api-standards.md](apis/api-standards.md)
- 部署与运维（§8 日志规范、代理 Worker 部署）：[devops/deployment.md](devops/deployment.md)
- 本地环境与排查（DevTools 使用、配置项说明）：[devops/env.md](devops/env.md)
- 历史故障复盘：[failures.md](failures.md)
