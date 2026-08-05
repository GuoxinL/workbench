# API 协议约定

> 状态：生效 | 维护者：Guoxin.Liu <lgx31@sina.cn> | 最后更新：2026-08-04
> Source: `proxy/cloudflare-worker.js`、`src/services/github/*`、`src/services/sync/*`、`src/stores/data.ts`
> Last-verified: 2026-08-04

---

## 范围

本文件记录**本项目真实存在的协议约定**，不是通用 API 设计规范的模板。适用对象只有两类：

1. **`proxy/cloudflare-worker.js`** —— 唯一对外暴露 HTTP 端点的组件（可选自部署代理）；
2. **`src/services/github/*`** —— 作为**调用方**消费 GitHub Contents API 的封装层（`client.ts` 通用请求、`repoFile.ts` 单文件读写、`contents.ts` 索引驱动同步、`listDir.ts` 目录树 blob sha 索引、`blobSha.ts` 本地 blob sha 计算、`diagnose.ts` 五步诊断；`manifest.ts` 已 `@deprecated`，仅只读兼容遗留 `manifest.json`），以及驱动同步的 `src/services/sync/*`（`engine.ts` 编排、`diff.ts` 三态判定、`merge.ts` LWW 合并）。

本项目**无业务 API、无 IDL、无代码生成、无版本前缀、无统一响应包装**（`code/message/data/trace_id` 这类结构在本项目**不存在**）。任何"新增接口"实质是**在代理白名单里放行一条新的 GitHub API 路径**。接口契约以本目录文档为准，由代码与文档手工同步（本项目采用 Vite 构建流水线，但接口仍不自动生成）。

---

## 1. 协议与风格

| 项 | 约定 |
|----|------|
| 协议 | HTTPS + JSON，RESTful（沿用 GitHub REST API 语义，代理不改写） |
| IDL / 代码生成 | **无**。接口契约以本目录文档为准 |
| 版本前缀 | **无 URL 版本前缀**。当前调用方未显式发送 `X-GitHub-Api-Version`，使用 GitHub 默认 API 版本（`src/services/github/client.ts`、`diagnose.ts` 的 `repoFetch` 均未带该头） |
| HTTP 方法语义 | `GET` 读（幂等）、`PUT` 全量覆写（带 `sha` 时为 CAS）、`DELETE` 删除、无请求体时 `OPTIONS` 预检。代理 CORS 虽声明允许 `POST`/`DELETE`，但**当前调用方仅用 GET/PUT/DELETE**（诊断与同步） |
| 上游地址 | 硬编码 `UPSTREAM = 'https://api.github.com'`（`proxy/cloudflare-worker.js:17`），**不可由请求方指定**——这是防 SSRF 的核心设计 |
| 调用方根地址 | 由 `githubRequest()` 内 `base` 决定（`src/services/github/client.ts:51`）：`cfg.apiBase` 非空走代理（右侧斜杠已 trim），否则默认 `https://api.github.com`。诊断路径 `repoApi()` 同理（`diagnose.ts:21-24`） |

---

## 2. 路径白名单（代理侧准入第一道）

`ALLOW` 为**正则数组**，任一命中即放行，全不命中返回 `403`（`proxy/cloudflare-worker.js:20-25`，校验在 `:84-89`）：

| 正则 | 匹配 | 匹配方式 | 用途 |
|------|------|---------|------|
| `/^\/rate_limit$/` | `/rate_limit` | 精确 | 令牌有效性探针 |
| `/^\/repos\/[^/]+\/[^/]+$/` | `/repos/{owner}/{repo}` | 精确（**不容忍尾斜杠或更深路径**） | 仓库元信息 + 写权限校验 |
| `/^\/repos\/[^/]+\/[^/]+\/contents\//` | `/repos/{owner}/{repo}/contents/**` | **前缀**（`contents/` 下任意深度） | 数据文件读写 |
| `/^\/$/` | `/` | 精确 | 连通性探测 |

**约定**：

- 白名单存在的唯一目的是**防止 Worker 被当成公共代理滥用**（`proxy/cloudflare-worker.js:19` 注释原文）。
- 校验只针对 `url.pathname`，**查询串原样透传**（`proxy/cloudflare-worker.js:91` 的 `url.search`），因此 `?ref=`、`?t=` 这类参数无需额外放行。
- **【必须】** 新增转发路径先加进 `ALLOW` 再补接口文档并更新 [index.md](index.md)；**禁止**开放任意 URL 中转（AGENTS.md 安全基线 3）。
- 拒绝响应体：`{"message":"该接口未在代理白名单内：<pathname>"}`，`Content-Type: application/json`。

---

## 3. CORS 策略（代理侧准入第二道）

### 3.1 来源白名单

```js
const ALLOW_ORIGINS = ['https://guoxinl.github.io'];   // proxy/cloudflare-worker.js:29-34
```

裁决逻辑在 `originAllowed()`（`proxy/cloudflare-worker.js:43-49`）；空数组时放行 localhost / 127.0.0.1 与任意 `*.github.io`（注释标注"方便但不够严格"）。真实拒绝发生在真实请求阶段（`fetch` 处理前，`:74`）：

| 情形 | `Access-Control-Allow-Origin` 回值 | 请求是否放行 |
|------|-----------------------------------|-------------|
| `ALLOW_ORIGINS` 为空数组 | 回显 `Origin`，无 Origin 时回 `*` | 放行（宽松模式） |
| Origin 命中白名单 | 回显该 Origin | 放行 |
| Origin 未命中白名单 | 回 `ALLOW_ORIGINS[0]`（浏览器据此判定失败） | **拒绝，403** |
| **无 `Origin` 头**（curl / 服务端调用） | 回 `*` 或 `ALLOW_ORIGINS[0]` | **放行**——`originAllowed()` 首行 `if (!origin) return true` 短路（`:44`），此时仅路径白名单生效 |

> **【必须】** 部署后把 `ALLOW_ORIGINS` 改成自己的站点域名，不要留空数组。
> **已知取舍**：来源白名单只能约束浏览器场景，非浏览器调用方不受限；真正的准入依赖调用方持有的 GitHub 令牌本身。

### 3.2 固定 CORS 响应头

由 `corsHeaders()` 统一生成，并在**所有**响应（含 204 预检、403 拒绝、502 失败、成功透传）上覆盖写入（`proxy/cloudflare-worker.js:51-62,116-119`）：

| 头 | 值 | 说明 |
|----|-----|------|
| `Access-Control-Allow-Methods` | `GET,PUT,POST,DELETE,OPTIONS` | 固定，不随请求变化 |
| `Access-Control-Allow-Headers` | `Authorization,Content-Type,Accept,X-GitHub-Api-Version` | 与转发头白名单严格一致 |
| `Access-Control-Expose-Headers` | `x-oauth-scopes,x-ratelimit-remaining,etag` | **前端只能读到这三个上游响应头**；新架构改以 `permissions.push` 判定写权限，不再依赖 `x-oauth-scopes`（见 §4.1） |
| `Access-Control-Max-Age` | `86400` | 预检缓存 24 小时 |
| `Vary` | `Origin` | 防止 CDN 跨来源串用缓存 |

**未设置** `Access-Control-Allow-Credentials`——本项目认证走 `Authorization` 头而非 Cookie，不需要携带凭据。

### 3.3 预检行为

`OPTIONS` 分支位于来源校验**之前**，恒返回 `204` + CORS 头（`proxy/cloudflare-worker.js:70-72`）。故"预检 204 通过、正式请求 403"是**预期行为**，排查时勿据预检成功判定来源已放行。详见 [proxy/Preflight.md](proxy/Preflight.md)。

---

## 4. 认证与请求头透传

### 4.1 认证方式

- **【必须】** `Authorization: Bearer <GitHub PAT>`（注入于 `src/services/github/client.ts:56`；诊断路径 `diagnose.ts:36`）。推荐细粒度令牌 + 仅授权数据仓库 + `Contents: Read and write`。
- 令牌来源：localStorage `wb.cfg.v1`，**只经 `src/stores/data.ts` 读写**（键定义 `:24`，读取 `:83`，写入 `:357`）；令牌**不进入任何数据文件**——数据契约见 §7，序列化内容绝不含 `cfg`/`token`。
- **【禁止】** 令牌写入 `data` 文档库、写入日志、硬编码进源码（AGENTS.md 红线 5）。
- **代理侧**：令牌**原样透传、不存储、不记录**（`proxy/cloudflare-worker.js:93` 注释原文「Worker 自身不存储、不记录令牌」）。Worker 无 KV / D1 / 日志绑定。
- **【必须】** 代理只填自己部署的地址——代理能看到令牌明文，填第三方地址等同交出账户写权限。
- **写权限判定**：新架构**不读 `x-oauth-scopes`**，而是在 [GetRepo.md](proxy/GetRepo.md) 阶段直接校验响应体 `permissions.push`（`diagnose.ts:73`），从源头拦截只读令牌。

### 4.2 请求头转发白名单

代理**丢弃原请求的全部头**，只重建以下 4 个（存在才设置，`proxy/cloudflare-worker.js:94-98`）：

| 头 | 值来源 | 缺失影响 |
|----|-------|---------|
| `Authorization` | 原样透传 | GitHub 按未认证处理（配额降至 60/h，私有仓库 404） |
| `Accept` | 原样透传，调用方固定 `application/vnd.github+json`（`client.ts:57`） | 返回体格式可能变化 |
| `Content-Type` | 原样透传，PUT 时为 `application/json` | PUT body 解析失败 |
| `X-GitHub-Api-Version` | 调用方当前**未发送**（见 §1） | 回落到 GitHub 默认版本 |

额外由代理**强制注入** `User-Agent: workbench-proxy`（`proxy/cloudflare-worker.js:99`）——GitHub API 要求必须带 UA。

> **推论**：任何自定义追踪头（如 `X-Request-Id`）**都会被代理丢弃**。本项目无 traceID 体系，排障靠五步诊断而非链路追踪。

### 4.3 响应头处理

透传上游全部响应头，再做三步加工（`proxy/cloudflare-worker.js:116-119`）：

1. CORS 头**覆盖**同名上游头；
2. **删除** `content-encoding`——响应体已被重新流式包装，原编码声明会失配导致浏览器解码失败；
3. **删除** `content-length`——同上，长度不再准确。

---

## 5. 错误语义

### 5.1 代理自有错误码（非 GitHub 返回）

三者均为 `Content-Type: application/json`，体形如 `{"message": "<中文提示>"}`：

| Code | 触发条件 | 响应体 message | 客户端表现 |
|------|---------|---------------|-----------|
| `403` | Origin 非空且不在 `ALLOW_ORIGINS` 内 | `来源未被允许：<origin>` | 中文提示**原样透到 UI**（不匹配 `rate limit`，不走限流映射） |
| `403` | `pathname` 未命中 `ALLOW` 任一正则 | `该接口未在代理白名单内：<pathname>` | 同上 |
| `502` | `fetch(target)` 抛异常（Worker 出网失败 / 上游不可达） | `中转到 GitHub 失败：<e.message>` | 诊断「网络连通」步因 `status >= 500` 判为「代理服务本身异常」 |

> **设计约定**：代理故意复用 `403` 而非自定义码，并把区分信息放在中文 `message` 里。因此**排障时必须看响应体**——只看状态码无法区分"代理拒绝"与"GitHub 限流"。

### 5.2 上游状态码映射（调用方侧）

旧架构 `readErr()` 仅在 message 含 `rate limit` 时特殊映射；新架构在 `client.ts:22-27` 的 `mapStatus()` 按状态码分类为 `GithubErrorCode`（`token` / `ratelimit` / `notfound` / `http`），调用方（如 `diagnose.ts:70`）据 `code` 决定文案，上游 `message` 仍透传作为兜底。

| Code | 映射后的 `code` | 文案要点 |
|------|----------------|---------|
| `401` | `token` | 令牌无效或已过期 |
| `403` / `429` | `ratelimit` | API 调用频率超限，请稍后再试 |
| `404` | `notfound` | 仓库或分支不存在，或 Token 无该仓库权限 |
| 其它非 2xx | `http` | 上游 `message`，取不到则 `<status> <statusText>` |

### 5.3 非错误的特殊状态码

| Code | 场景 | 语义 |
|------|------|------|
| `404` | `GET contents` 文件不存在 | **正常分支**，`repoFile.getFile()` 捕获 `notfound` 返回 `null`（`repoFile.ts:34-43`），调用方据此走"创建/跳过"分支 |
| `409` / `422` | `PUT contents` `sha` 失配 | 抛 `ConflictError`（`repoFile.ts:72-77`）→ 同步引擎**可自愈冲突**：退避 `RETRY_BACKOFF × attempt` 后重拉合并重试，上限 `MAX_RETRY` 次（`sync/engine.ts:142-149`，常量 `:59-60`） |
| `200` + `permissions.push === false` | `GET repo` | HTTP 成功但**业务失败**，必须客户端判定（`diagnose.ts:73`） |
| `200` + 内容非合法 JSON / frontmatter | `GET contents` | 由 `parseFrontmatter` / JSON 解析失败处理，通常跳过该条或报错提示（远端脏数据防御见 `contents.ts:64-71`） |

### 5.4 网络层错误（无状态码）

统一封装于 `githubRequest()`（`src/services/github/client.ts:46-103`），全部中文化并置 `err.net = true`：

| 情形 | 判定 | 文案要点 |
|------|------|---------|
| 超时 | `AbortError` | `请求超时`（默认 `REQUEST_TIMEOUT = 12000ms`，`:20`，`AbortController` 在 `:54` 触发） |
| 不可达 / DNS 失败 / CORS 拒绝 | `e.name === 'TypeError'` | `网络错误（fetch 失败）`（`client.ts:93`） |

> **【必须】** 判定用 `e.name === 'TypeError'` 而非 `instanceof TypeError`——fetch 可能来自其它 realm（polyfill / 扩展注入），`instanceof` 会失效（`client.ts:92` 注释）。
>
> **诊断链路超时**统一为 `12000ms`（`diagnose.ts:28` 的 `repoFetch`），而非旧架构分 10s/12s 两段。

**错误信息约定**：面向使用者的**中文可操作文案**，禁止泄露堆栈、令牌、内部路径。这与"message 仅供开发者、前端按 code 本地化"的常见做法**相反**——本项目无后端、无错误码体系，message 就是最终 UI 文案。

---

## 6. 超时、重试与限流

| 项 | 值 | 位置 |
|----|-----|------|
| 默认请求超时 | `12000ms`（`AbortController`） | `client.ts:20` + `:54` |
| 诊断步骤超时 | `12000ms`（统一） | `diagnose.ts:28` |
| 冲突重试 | 最多 `MAX_RETRY = 3` 次，退避 `RETRY_BACKOFF × attempt`（350ms 起） | `sync/engine.ts:59-60` + `:142-149` |
| 本地变更防抖推送 | `PUSH_DEBOUNCE = 1500ms` | `sync/engine.ts:58` + `:171-176`（`schedulePush`） |
| 轮询拉取间隔 | 默认由 `cfg.poll` 决定，钳制 `MIN_POLL=5000`–`MAX_POLL=300000`（5–300s），`document.hidden` 时跳过 | `sync/engine.ts:61-62` + `:178-185`（`startPolling`） |
| 并发控制 | 复用进行中的 `inFlight` Promise，而非"忙即失败" | `sync/engine.ts:161-169`（`sync`） |
| 空同步返回真值 | 无领先变更时返回 `{ok:true, pushed:false}`，避免空提交 | `sync/engine.ts:84-89,126` |

**代理侧无限流**：Worker 不做速率限制，实际配额由 GitHub 认证配额（5000 次/小时）约束。客户端的防抖 + 轮询钳制是唯一的调用节流手段。

**同步结果判定**：`sync()` 返回结构化 `SyncOutcome`（`{ ok, merged, pushed }`，`engine.ts:42-46`），调用方据 `ok`/`pushed` 而非布尔值判定成败（旧架构 `!== false` 的约定已废弃）。

---

## 7. 数据契约

代理**不定义**任何数据结构，仅透传。业务侧的数据契约是 **Markdown 文档库**（详见 [architecture.md](../architecture.md) 与 [relationship.md](../relationship.md)）：

| 远端文件 | 生产者 | 内容 |
|---------|--------|------|
| `kb/<slug>.md` | `contents.pushRemote`（`contents.ts:111-195`） | 单篇文章：YAML frontmatter（`id/title/createdAt/updatedAt/deleted/fromTodo/tags/publish`）+ Markdown 正文 |
| `todos/<id>.json` | 同上 | 单条待办 JSON，经 Zod `TodoSchema` 校验（`contents.ts:53-75`） |
| `images/<sha>.<ext>` | `contents.pushImage`（`contents.ts:209`） | 图片二进制，key 由内容 SHA-256 决定，幂等去重 |
| ~~`manifest.json`~~ | **已废弃，无生产者** | 旧架构曾由中央索引承载各文件 `sha`/`updatedAt`/墓碑；**2026-08-04 起同步链路不再写入**，改由现拉 `kb/`、`todos/` 目录树的每文件 blob sha（`listDir.fetchIndex`）+ 本地基线 `wb.syncState.v1` 取代（见 [GetContents.md](proxy/GetContents.md) / [PutContents.md](proxy/PutContents.md)）。`manifest.ts` 仅保留 `@deprecated` 的 `getManifest` 只读兼容既有仓库的遗留文件 |

**本地双重存储**（`src/stores/data.ts`）：

| 键 | 用途 |
|----|------|
| `wb.data.v1` | 即时加载层快照（零配置启动即可用）；结构化内容另存 IndexedDB |
| `wb.cfg.v1` | 配置项（`repo` / `token` / `branch` / `apiBase` / `publicRepo` / `poll` 等），**含 token，绝不进入数据文档库** |
| `wb.syncState.v1` | 本地同步基线：`path → blob sha` 字典（如 `{"kb/1.md":"abc…","todos/2.json":"def…"}`），供下轮 `planSync` 做三态判定（替代旧的单值 `wb.manifestSha.v1`） |

| 约定 | 说明 |
|------|------|
| 时间 | 统一 **Unix 毫秒时间戳**（`Date.now()`），非 ISO 字符串 |
| ID | 字符串，由 slug 工具生成（`src/lib/slug.ts`），非数字，无精度问题 |
| 布尔 | `true` / `false`，软删除标记为 `deleted: true`，以**墓碑**形式经逐条 LWW 传播（本地墓碑对应远端文件的 DELETE，见 `sync/diff.ts` 判定 G） |
| 传输编码 | 文件内容经 **UTF-8 安全 base64** 经 Contents API 传输（`repoFile.toBase64`/`fromBase64`，`repoFile.ts:19-31`）；图片二进制同样 base64 直传（`putFileBase64`） |
| 合并语义 | 逐文件 **LWW**（按 `id` 主键比 `updatedAt`，相等保留本地）；索引驱动 `planSync`（`sync/diff.ts`）按 blob sha 三态（远端目录树 sha / 本地基线 sha / 本地内容 sha）定 pull/push/delete/conflict，再按 id 差分 GET/PUT；正文合并 `mergeArticles`/`mergeTodos`（`merge.ts:39-46`） |
| 乐观锁 | 全部写操作带远端 blob `sha` 做 CAS，sha 取自**本轮刚拉到的目录树**（`treeShaByPath`，`contents.ts:126,152,174,195`）而非任何中央索引文件；冲突（`409`/`422`）由同步引擎退避重试（§6） |
| 兼容性 | 新增持久化字段必须同改三处：`parseFrontmatter`/`serializeFrontmatter`（`src/lib/markdown/frontmatter`）正确序列化、Zod schema 补默认值、`mergeEntities` 的 LWW 语义成立 |

---

## 8. 文档与验证

- **接口文档**：本目录，与代码手工同步；每篇必须有 `Source:` + `Last-verified:` 脚注。
- **契约测试**：`src/services/github/__tests__/` 下的 Vitest 单测覆盖 `client`/`repoFile`/`listDir`/`blobSha`/`contents`/`images`/`diagnose`（`manifest` 测试仅覆盖已废弃的兼容函数）；`src/services/sync/__tests__/` 覆盖 `engine`/`diff`/`merge`/`serialize`。运行 `npm test`。
- **人工验证手段**：工作台「设置 → 诊断」的**五步链路**（`diagnose.runDiagnose`，`diagnose.ts:83-128`）——配置检查 → 网络连通 → 令牌有效性 → 仓库访问与写权限 → 数据文件（`GET contents/manifest.json`，**遗留兼容检查**：新仓库已不写该文件，404 视为「尚未创建/首次同步」，不算失败，`diagnose.ts:109-112`）——失败即在具体步骤中断并给出处置建议。这是本项目**唯一**的接口连通性验证工具。
- **代理侧验证**：Worker 无 wrangler 自动化测试；部署后需人工用诊断工具验证连通性与 CORS。

---

## 参考

- 接口总索引：[index.md](index.md)
- 新增文档模板：[_template.md](_template.md)
- 架构与调用链：[../architecture.md](../architecture.md)（GitHub Contents API 同步）
- 上下游关系：[../relationship.md](../relationship.md)
- 编码与安全基线：[../coding-style.md](../coding-style.md)
- 代理部署步骤：[../devops/deployment.md](../devops/deployment.md)
