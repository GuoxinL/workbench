# 日志规范

> 维护者：Guoxin.Liu <lgx31@sina.cn> | 最后更新：2026-08-04（对齐 2026-07-31 Vue3+Vite+TS+Pinia 重构）
>
> Source: `src/stores/data.ts`、`src/services/sync/engine.ts`、`src/services/github/diagnose.ts`、`src/services/github/contents.ts`、`proxy/cloudflare-worker.js`、`scripts/pre_commit_check.sh`
> Last-verified: 2026-08-04（对应 commit `3c64351`）

---

## 1. 范围与形态判定

本项目是**纯静态前端 PWA，无后端、无日志库、无日志采集系统**（无服务端进程、无日志文件、无 ELK/APM，见 `architecture.md` §9）。因此本文档**不适用**传统服务端日志规范（FATAL/INFO 分级、动态调级、结构化 JSON、traceId 传播一律 **N/A**）。

本项目真实存在的是**三条运行时输出通道**，其中后两条（用户可见反馈）在无后端场景下承担了日志的主要职责：

| # | 通道 | 载体 | 受众 | 留存 | 代码位置 |
|---|------|------|------|------|---------|
| 1 | **浏览器 Console** | `console.error` / `console.warn` | 开发者（自己） | 会话级，刷新即丢 | 各服务模块捕获异常处（pre-commit 拦截大部分新增 console 调用，见 §2.1） |
| 2 | **Toast 提示** | Pinia store / `ElMessage`，`ok`/`err`/`info` 档 | 使用者 | 数秒后消失 | 定义在 store / 组件层 |
| 3 | **同步状态 chip + 五步诊断面板** | 顶栏 phase 四态（本地模式 / 同步中 / 已同步 / 同步失败）+ `SettingsSheet` 逐步检测结果 | 使用者 | 常驻（chip）/ 面板关闭即清 | phase 由 `engine.ts` 驱动（`'off'|'syncing'|'ok'|'error'`）；诊断引擎 `diagnose.ts:83-128` |

**唯一具备持久留存的"日志"**：数据仓库 `workbench-data` 的 commit 历史——每次成功推送产生一条 commit（message 含同步时间戳，由 `contents.ts` 的推送逻辑生成）。它是本项目**唯一可事后回溯的时间线**，排查"数据什么时候变的 / 哪次同步丢了内容"必须先看它。

---

## 2. 级别使用约定

项目只使用 `console` 的有限级别，**其余级别被 pre-commit 钩子硬拦截（测试文件除外）**。

| 级别 | 是否可用 | 语义与使用场景 |
|------|---------|---------------|
| `console.error` | ✅ 可用 | **吞掉的异常**：捕获后不再向上抛、且不打断主流程的错误（如同步引擎 catch、合并异常）。是唯一能**新增**的 console 级别 |
| `console.warn` | ⚠️ 存量可用，**新增被钩子拦截** | **降级可继续**：本地持久化数据/配置解析失败，回落到默认值后功能仍完整 |
| `console.log` / `console.info` / `console.debug` | ❌ 禁止 | 调试残留 |
| `console.trace` / `console.table` / `console.group` | ❌ 禁止 | 同上 |

### 2.1 pre-commit 硬约束（必读）

`scripts/pre_commit_check.sh` 对 `.ts`/`.js` 暂存**新增行**（排除测试文件）执行正则拦截：

```
console\.(log|warn|debug|info)\(
```

命中即阻断提交。推论：
1. **新代码里写 `console.warn/log/info/debug` 会被拒绝提交**——需要告警语义时用 `console.error`，或改走 toast / ElMessage。
2. `console.error` **不在**拦截正则内，是唯一能新增的 console 级别。
3. 检查只看**新增行**，历史存量 `console.warn` 得以保留；**不要把它们当作"新增 warn 是允许的"依据**。

### 2.2 无运行时日志开关，只能不写

项目经 Vite 构建（`npm run build`），但**默认不剥离 console**（除非 `vite.config.ts`` 显式配置 drop），**不存在 `NODE_ENV` 分支日志开关、不存在运行时日志级别开关**。因此：

- **禁止**"先加调试 log，上线前删"的工作方式——忘删即上线，且没有任何机制兜底。
- **禁止**引入 `DEBUG` 开关变量做条件日志。
- 临时调试请用 DevTools 断点 / Watch / Logpoint（**不落代码**），或在 Console 里直接调 `useDataStore()` 暴露的接口。

---

## 3. 必须 / 禁止输出的场景

### 3.1 必须有输出的场景

| # | 场景 | 通道 | 现状 |
|---|------|------|------|
| 1 | 捕获后吞掉的异常（不再上抛且不中断主流程） | `console.error` | ✅ 同步引擎 / 合并 catch |
| 2 | 本地持久化读写失败 | `console.error`（存量 warn）+ toast | ✅ 解析失败回落默认值时 |
| 3 | 同步失败 | 状态 chip 转「同步失败」+ 非静默时 toast | ✅ `engine.ts` catch → `setPhase('error')` |
| 4 | 同步成功 / 数据落库 | 状态 chip「已同步」 | ✅ `engine.ts` `setPhase('ok')` |
| 5 | 降级为本地模式（配置不完整） | 状态 chip「本地模式」(`off`) | ✅ `engine.ts:82-90`（`!isEnabled()` 或 `!isConfigComplete()`） |
| 6 | 外部调用失败的**可执行归因** | 诊断面板逐步结果 | ✅ 五步诊断（`diagnose.ts:83-128`），失败即中断并给出处置建议 |
| 7 | 用户的破坏性/不可逆操作 | toast / ElMessage | ✅ 删除、转文章、批量改引用等 |

**错误消息质量要求**（本项目把"错误消息"当日志用，因此要求高于普通 UI 文案）：错误必须**中文化 + 指出处置动作**，禁止直接抛英文原文或裸状态码。`diagnose.ts` 已建立三层：网络层 `repoFetch` 把 `Failed to fetch` / `AbortError` 翻成含处置建议的中文（`diagnose.ts:57-66`）→ 协议层 `testConnection` 把 401/403/404/429 映射成人话（`diagnose.ts:69-72`）→ 展示层决定进 toast 还是诊断行。新增外部调用必须复用这三层，不要另起一套。

### 3.2 禁止 / 限制输出的场景

| # | 规则 | 原因 |
|---|------|------|
| 1 | **禁止**输出任何令牌相关内容 | 见 §4，本项目最高优先级红线 |
| 2 | **禁止**新增 `console.log/warn/info/debug` | pre-commit 拦截（§2.1） |
| 3 | **禁止**在高频路径打日志 | 轮询默认 20s（`engine.ts:179` 夹取 5–300s）、防抖推送 1.5s（`engine.ts:58`）、`change` 事件触发全量重渲染——这些路径加日志会刷屏并掩盖真实错误 |
| 4 | **禁止**输出完整数据文档 | `wb.data.v1` 含全部文章正文，属用户隐私内容；需要看时在 Console 手动 `localStorage.getItem('wb.data.v1')` 即可，不要写进代码 |
| 5 | **禁止**为"正常但少见"的分支报错 | 如"远端文件/目录尚未创建"（`kb/`、`todos/` 目录列表 404 → `listDir` 视为空索引；诊断的遗留 `manifest.json` 404 → 视为「尚未创建，首次同步将写入」，`diagnose.ts:111`）、"两端已一致无需推送"（`engine.ts:123` 本地无领先变更则整轮不写远端）——都是成功路径 |
| 6 | **限制**静默同步的用户可见反馈 | 轮询/防抖推送走静默路径，失败只点红 chip 不弹 toast；否则断网时每周期弹一次 |
| 7 | **禁止**在 Worker 里打印请求头或请求体 | 见 §4 风险点 F |

---

## 4. 脱敏红线：GitHub PAT

> 通用条款遵循 [coding-style.md](coding-style.md) §7「安全编码」——「Token 只存 `wb.cfg.v1`、禁止落日志/落库/硬编码」为本节上位规则，此处不复制，只补充**本项目特有的具体风险点**。
> 上位约束另见 AGENTS.md 红线 5、`architecture.md` §11。

**红线**：GitHub PAT **绝对禁止**出现在任何 console 输出、错误消息、toast、诊断行、Worker 日志、远端文件与源码中。令牌泄漏 = 交出 GitHub 账户写权限。

### 4.1 点名风险点（含令牌的对象在此流转，任何一处加 console 即泄漏）

| 标记 | 位置 | 风险载体 | 说明 |
|------|------|---------|------|
| **A** | `services/github/diagnose.ts` `repoFetch(config, sub, init)` | `init.headers.Authorization = 'Bearer ' + config.token` | **最高危**。打印 `init`、`JSON.stringify(init)`、`config` 均直接泄漏明文令牌 |
| **B** | `repoFetch` 的 catch 块 | 当前只取 `e.name` / `e.message` 构造中文错误，**正确**。若改成打印 `init` / `{url, init, e}` 即泄漏 | |
| **C** | `stores/data.ts` 载入 `wb.cfg.v1` 的 `loadLocal()` | 局部 `raw` 是 `wb.cfg.v1` 原始 JSON 串，**含 token 明文** | 解析失败日志只打印异常对象 `e`，**正确**；若改成打印 `raw` 即泄漏——**最容易踩的一脚** |
| **D** | store 的 `cfg` getter / `saveCfg` | `cfg` 对象含 `token` 字段 | `console.log(useDataStore().cfg)` 即泄漏；`saveCfg` 的 catch 当前不打印 cfg，**正确** |
| **E** | `SettingsSheet` 读取表单 → 构造 `Config` | 表单 token 字段经 `v-model` 进 `Config` 后传入 `testConnection` / `runDiagnose` | 任何位置 `console.log(cfg)` 即泄漏 |
| **F** | `proxy/cloudflare-worker.js` | `request.headers` 含 `Authorization` | Worker 当前**无任何 console 调用**，且注释明示"不存储、不记录令牌"。一旦加 `console.log` 令牌将进入 Cloudflare 实时日志（平台侧留存，不在使用者掌控内） |

### 4.2 已建立的正确做法（新增代码照此执行，勿破坏）

- **令牌只判空、不回显**：诊断第 1 步「配置检查」只输出是否填写了仓库/分支/令牌（`diagnose.ts:86-88`），**永远不回显 token 本身，哪怕是脱敏后的前后 4 位**。
- **令牌不参与同步载荷**：远端文件（`kb/*.md`、`todos/*.json`、`images/*`）只输出业务字段，`cfg` 结构性隔离在外，因此导出/远端文件天然不带令牌。**新增持久化字段时务必确认没把 cfg 的任何字段掺进来**。
- **错误消息只用服务端 message**：`testConnection` 取 `data?.message`（`diagnose.ts:68-71`），不回显请求头。

---

## 5. 可观测手段

### 5.1 浏览器侧（主战场）

| 手段 | 路径 | 看什么 | 备注 |
|------|------|--------|------|
| **Console** | DevTools → Console | 仅 `console.error` 等少量日志点 + 未捕获异常堆栈 | 日志极少是设计使然，Console 干净 → 未捕获异常一眼可见 |
| **Network** | DevTools → Network，过滤 `api.github.com` 或代理域名 | 实际最有效的"请求日志"：GET/PUT 的 URL、状态码、耗时、响应体、`x-ratelimit-remaining` / `x-oauth-scopes` 响应头 | ⚠️ 请求头里**有令牌明文**，共享 HAR 文件 / 截图前必须删掉 `Authorization` 行 |
| **Application → Local Storage** | DevTools → Application → Local Storage | `wb.data.v1`（全量数据）、`wb.cfg.v1`（配置，**含令牌明文，勿截图**）、`wb.syncState.v1`（本地同步基线 `path → blob sha`）、`wb.seeded`（示例数据播种标记） | 键的归属见 `architecture.md` §3 / `stores/data.ts` |
| **诊断面板** | 应用内：`SettingsSheet` → 诊断 | 五步逐项检测：配置检查 → 网络连通 → 令牌有效性 → 仓库访问与写权限 → 数据文件（探测 `manifest.json`，属**遗留兼容**检查；新仓库无此文件，404 不算失败）；失败即中断并给处置建议 | 面向使用者的一等排查入口，**同步类问题先跑它** |
| **构建哈希** | DevTools → Network 看 `app.<hash>.js` 等文件名 | 确认浏览器当前跑的是哪次构建产物（Vite 内容哈希，无需 `?v=` 环境变量） | 排查"改了没生效"必看——比对文件名哈希是否为最新构建 |

### 5.2 Worker 侧（仅在使用了 API 代理时）

| 手段 | 可用性 | 说明 |
|------|--------|------|
| Worker 自身日志 | **无** | `proxy/cloudflare-worker.js` 全文无 console 调用；错误只以 HTTP 响应体返回，使用者在浏览器 Network 里就能看到 |
| Cloudflare Dashboard 实时日志 | 平台能力，需在自己的 Cloudflare 账号内查看 | Worker 由使用者手动在 dash.cloudflare.com 粘贴部署，Dashboard 侧的请求日志属平台自带 |
| `wrangler tail` | 需自行安装 wrangler 并登录同一账号 | 仓库内无 `wrangler.toml`，非默认链路 |

> ⚠️ 无论用哪种 Worker 侧手段，**都禁止为了排查而打印请求头**（§4 风险点 F）。需要确认"请求有没有到 Worker"时，看 HTTP 状态码与响应体即可——白名单拒绝会明确返回 403 + 原因。

### 5.3 远端持久线索

| 手段 | 说明 |
|------|------|
| 数据仓库 commit 历史 | `workbench-data` 每次成功推送一条 commit（message 含同步时间戳，由 `contents.ts` 推送逻辑生成）。**本项目唯一可事后回溯的时间线**：数据何时变更、变更了什么（diff）、是否发生过覆盖，全靠它 |
| GitHub 令牌用量 | GitHub 设置页可看 PAT 的最近使用时间；`/rate_limit` 响应头 `x-ratelimit-remaining` 可判断是否被轮询打满（认证配额 5000/小时） |

---

## 6. 无 trace-id 时如何定位问题

项目**不存在也不需要** traceId：无后端、无跨服务调用、无并发请求上下文（`architecture.md` §6）。**禁止**为"规范完整性"生造一个 traceId 字段。

多设备场景下的定位靠以下维度组合：

1. **配置维度 — `repo`/`branch`**：确认两端指向同一数据仓库与分支（`Config.repo`/`branch`）。
2. **时间维度 — `updatedAt`**：每条 todo/article 都带毫秒级 `updatedAt`。跨设备比对同一 `id` 的 `updatedAt`，即可判断 LWW 合并时谁赢了、谁的写入被丢弃（`merge.ts`）。
3. **发版维度 — 构建哈希**：确认各设备跑的是不是同一份构建产物（§5.1 末行）。

**推荐排查顺序**（以"某条文章在 A 设备改了、B 设备没生效"为例）：

```
① 两端设置面板对仓库/分支配置 → 排除指向不同仓
② 两端跑「诊断」→ 排除网络/令牌/权限
③ 看数据仓库 commit 历史 → 确认 A 的改动到底有没有推上去
④ 若已推上去：B 端 Application 里看 wb.data.v1 中该 id 的 updatedAt，
   与远端 kb/<id>.md frontmatter（或 todos/<id>.json）的 updatedAt 比对；
   再看 B 端 wb.syncState.v1 里该 path 的基线 sha 与远端目录树 sha 是否一致
   → 判断是没拉到，还是拉到了但被 LWW 判定为「本地更新」
⑤ 记录两端配置与各自的 updatedAt，作为归因结论写进 failures.md
```

---

## 7. 生产环境（GitHub Pages）保留策略

生产 = GitHub Pages 上托管的 `dist/` 构建产物（经 `deploy.yml` 发布），与开发环境同一份源码，无环境变量、无差异化构建。

| 项 | 策略 |
|----|------|
| 保留的 console 日志 | 仅 `console.error`（监听器/捕获异常）等少量点。它们属"静默失效"类问题，无输出则无从发现，必须保留 |
| 日志级别开关 | **不存在**，也不要引入（§2.2） |
| 日志留存 | **无**。Console 随页面刷新丢失，toast 秒级消失。需要留证据只能：手动复制 Console 输出 / 保存 HAR（**先删 `Authorization` 头**）/ 截图（**先关设置面板**）→ 归档到 `failures.md` |
| 采集上报 | **无，且不引入**。任何埋点/日志上报 SDK 都会引入未评估依赖，且需要一个本项目刻意不存在的后端 |
| 用户侧自助排查 | 依赖内建「诊断」，这是无日志采集条件下的替代方案。**新增外部调用时应同步在 `runDiagnose()` 里加一步**（`diagnose.ts:83-128`），否则该失败面对使用者不可见 |

---

## 8. Code Review 检查清单

- [ ] 新增代码是否引入了 `console.log` / `console.info` / `console.debug` / `console.warn`？（前三者禁止；`warn` 会被 pre-commit 拦截，改用 `console.error` 或 toast）
- [ ] 是否有任何位置打印了 `Config` / `cfg` getter 返回值 / `repoFetch` 的 `init` / `loadLocal` 的 `raw`？（§4 风险点 A–E，**一票否决**）
- [ ] Worker 是否新增了 console 调用或请求头打印？（§4 风险点 F，**一票否决**）
- [ ] 新增的错误消息是否中文化并给出了处置动作，而非裸抛英文原文 / 状态码？（复用 `repoFetch` + `testConnection` 三层，勿另起一套）
- [ ] 捕获后吞掉的异常是否有 `console.error`？空 catch 块必须有明确注释说明为何可以静默
- [ ] 是否在轮询 / 防抖推送 / `change` 重渲染等高频路径上加了输出？
- [ ] 静默同步路径是否误加了 toast？（会导致断网时反复弹窗）
- [ ] 成功但少见的分支（远端 `kb/`、`todos/` 目录尚不存在、无需推送）是否被误报成错误？（历史 bug 同源）
- [ ] 新增外部调用是否同步在 `runDiagnose()` 中补了对应检测步骤？
- [ ] 新增持久化字段后，远端文件（`kb/*.md`、`todos/*.json`）是否仍不含任何 `cfg` 字段？

---

## 参考

- 编码规范（§7 安全编码为本文脱敏条款的上位规则）：[coding-style.md](coding-style.md)
- 架构文档（§9 横切关注点 / §11 不变式）：[architecture.md](architecture.md)
- 接口规范（错误消息与响应约定）：[apis/api-standards.md](apis/api-standards.md)
- 部署与运维（代理 Worker 部署）：[devops/deployment.md](devops/deployment.md)
- 本地环境与排查（DevTools 使用、配置项说明）：[devops/env.md](devops/env.md)
- 历史故障复盘：[failures.md](failures.md)
