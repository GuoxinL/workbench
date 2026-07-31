# API 协议约定

> 状态：生效 | 维护者：Guoxin.Liu <lgx31@sina.cn> | 最后更新：2026-07-31
> Source: `proxy/cloudflare-worker.js`、`js/github.js`、`js/store.js`
> Last-verified: 2026-07-31（对应 commit `cf46195`，代理文件最后改动 `6427394`）

---

## 范围

本文件记录**本项目真实存在的协议约定**，不是通用 API 设计规范的模板。适用对象只有两类：

1. **`proxy/cloudflare-worker.js`** —— 唯一对外暴露 HTTP 端点的组件（可选自部署代理）；
2. **`js/github.js`** —— 作为**调用方**消费 GitHub Contents API 的唯一通道。

本项目**无业务 API、无 IDL、无代码生成、无版本前缀、无统一响应包装**（`code/message/data/trace_id` 这类结构在本项目**不存在**）。任何"新增接口"实质是**在代理白名单里放行一条新的 GitHub API 路径**。

---

## 1. 协议与风格

| 项 | 约定 |
|----|------|
| 协议 | HTTPS + JSON，RESTful（沿用 GitHub REST API 语义，代理不改写） |
| IDL / 代码生成 | **无**。零构建项目，接口契约以本目录文档为准 |
| 版本前缀 | **无 URL 版本前缀**。版本经请求头 `X-GitHub-Api-Version: 2022-11-28` 声明（`js/github.js:58`） |
| HTTP 方法语义 | `GET` 读（幂等）、`PUT` 全量覆写（带 `sha` 时为 CAS）。代理 CORS 虽声明允许 `POST`/`DELETE`，但**当前无任何代码路径使用** |
| 上游地址 | 硬编码 `UPSTREAM = 'https://api.github.com'`（`proxy/cloudflare-worker.js:17`），**不可由请求方指定**——这是防 SSRF 的核心设计 |
| 调用方根地址 | `API_BASE()` 决定（`js/github.js:14-18`）：`cfg.apiBase` 非空走代理（右侧斜杠已 trim），否则默认 `https://api.github.com` |

---

## 2. 路径白名单（代理侧准入第一道）

`ALLOW` 为**正则数组**，任一命中即放行，全不命中返回 `403`（`proxy/cloudflare-worker.js:20-25,63-68`）：

| 正则 | 匹配 | 匹配方式 | 用途 |
|------|------|---------|------|
| `/^\/rate_limit$/` | `/rate_limit` | 精确 | 令牌有效性探针 |
| `/^\/repos\/[^/]+\/[^/]+$/` | `/repos/{owner}/{repo}` | 精确（**不容忍尾斜杠或更深路径**） | 仓库元信息 + 写权限校验 |
| `/^\/repos\/[^/]+\/[^/]+\/contents\//` | `/repos/{owner}/{repo}/contents/**` | **前缀**（`contents/` 下任意深度） | 数据文件读写 |
| `/^\/$/` | `/` | 精确 | 连通性探测 |

**约定**：

- 白名单存在的唯一目的是**防止 Worker 被当成公共代理滥用**（`proxy/cloudflare-worker.js:19` 注释原文）。
- 校验只针对 `url.pathname`，**查询串原样透传**（`proxy/cloudflare-worker.js:70`），因此 `?ref=`、`?t=` 这类参数无需额外放行。
- **【必须】** 新增转发路径先加进 `ALLOW` 再补接口文档并更新 [index.md](index.md)；**禁止**开放任意 URL 中转（AGENTS.md 安全基线 3、architecture.md §11 不变式）。
- 拒绝响应体：`{"message":"该接口未在代理白名单内：<pathname>"}`，`Content-Type: application/json`。

---

## 3. CORS 策略（代理侧准入第二道）

### 3.1 来源白名单

```js
const ALLOW_ORIGINS = ['https://guoxinl.github.io'];   // proxy/cloudflare-worker.js:29-31
```

裁决逻辑（`proxy/cloudflare-worker.js:34,55`）：

| 情形 | `Access-Control-Allow-Origin` 回值 | 请求是否放行 |
|------|-----------------------------------|-------------|
| `ALLOW_ORIGINS` 为空数组 | 回显 `Origin`，无 Origin 时回 `*` | 放行（宽松模式，注释标注"方便但不够严格"） |
| Origin 命中白名单 | 回显该 Origin | 放行 |
| Origin 未命中白名单 | 回 `ALLOW_ORIGINS[0]`（浏览器据此判定失败） | **拒绝，403** |
| **无 `Origin` 头**（curl / 服务端调用） | 回 `*` 或 `ALLOW_ORIGINS[0]` | **放行**——校验条件含 `origin &&` 短路（`proxy/cloudflare-worker.js:55`），此时仅路径白名单生效 |

> **【必须】** 部署后把 `ALLOW_ORIGINS` 改成自己的站点域名，不要留空数组。
> **已知取舍**：来源白名单只能约束浏览器场景，非浏览器调用方不受限；真正的准入依赖调用方持有的 GitHub 令牌本身。

### 3.2 固定 CORS 响应头

由 `corsHeaders()` 统一生成，并在**所有**响应（含 204 预检、403 拒绝、502 失败、成功透传）上覆盖写入（`proxy/cloudflare-worker.js:33-43,96`）：

| 头 | 值 | 说明 |
|----|-----|------|
| `Access-Control-Allow-Methods` | `GET,PUT,POST,DELETE,OPTIONS` | 固定，不随请求变化 |
| `Access-Control-Allow-Headers` | `Authorization,Content-Type,Accept,X-GitHub-Api-Version` | 与转发头白名单严格一致 |
| `Access-Control-Expose-Headers` | `x-oauth-scopes,x-ratelimit-remaining,etag` | **前端只能读到这三个上游响应头**；`js/github.js:324` 读 `x-oauth-scopes` 依赖此声明 |
| `Access-Control-Max-Age` | `86400` | 预检缓存 24 小时 |
| `Vary` | `Origin` | 防止 CDN 跨来源串用缓存 |

**未设置** `Access-Control-Allow-Credentials`——本项目认证走 `Authorization` 头而非 Cookie，不需要携带凭据。

### 3.3 预检行为

`OPTIONS` 分支位于来源校验**之前**，恒返回 `204` + CORS 头（`proxy/cloudflare-worker.js:51-53`）。故"预检 204 通过、正式请求 403"是**预期行为**，排查时勿据预检成功判定来源已放行。详见 [proxy/Preflight.md](proxy/Preflight.md)。

---

## 4. 认证与请求头透传

### 4.1 认证方式

- **【必须】** `Authorization: Bearer <GitHub PAT>`（`js/github.js:56`），推荐细粒度令牌 + 仅授权数据仓库 + `Contents: Read and write`。
- 令牌来源：localStorage `wb.cfg.v1`，**只经 `js/store.js` 读写**。
- **【禁止】** 令牌写入 `data/workbench.json`、写入日志、硬编码进源码（AGENTS.md 红线 5）。`store.serialize()` 只输出 `version`/`updatedAt`/`todos`/`notes`，结构上杜绝令牌落库。
- **代理侧**：令牌**原样透传、不存储、不记录**（`proxy/cloudflare-worker.js:72` 注释原文「Worker 自身不存储、不记录令牌」）。Worker 无 KV / D1 / 日志绑定。
- **【必须】** 代理只填自己部署的地址——代理能看到令牌明文，填第三方地址等同交出账户写权限。

### 4.2 请求头转发白名单

代理**丢弃原请求的全部头**，只重建以下 4 个（存在才设置，`proxy/cloudflare-worker.js:73-77`）：

| 头 | 值来源 | 缺失影响 |
|----|-------|---------|
| `Authorization` | 原样透传 | GitHub 按未认证处理（配额降至 60/h，私有仓库 404） |
| `Accept` | 原样透传，前端固定 `application/vnd.github+json` | 返回体格式可能变化 |
| `Content-Type` | 原样透传，PUT 时为 `application/json` | PUT body 解析失败 |
| `X-GitHub-Api-Version` | 原样透传，前端固定 `2022-11-28` | 回落到 GitHub 默认版本 |

额外由代理**强制注入** `User-Agent: workbench-proxy`（`proxy/cloudflare-worker.js:78`）——GitHub API 要求必须带 UA。

> **推论**：任何自定义追踪头（如 `X-Request-Id`）**都会被代理丢弃**。本项目无 traceID 体系，排障靠五步诊断而非链路追踪。

### 4.3 响应头处理

透传上游全部响应头，再做三步加工（`proxy/cloudflare-worker.js:95-98`）：

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

### 5.2 上游状态码映射（调用方侧，`readErr()` `js/github.js:93-103`）

按顺序覆盖：先取上游 `message`，再按状态码硬编码替换。

| Code | 映射后的中文文案 | 备注 |
|------|----------------|------|
| `401` | `Token 无效或已过期` | 无条件覆盖上游 message |
| `403` + message 含 `/rate limit/i` | `API 调用频率超限，请稍后再试` | **仅**匹配到该关键词才映射；否则保留原 message（代理拒绝走这条分支） |
| `404` | `仓库或分支不存在，或 Token 无该仓库权限` | 但 `fetchRemote()` 对 404 **不走此路径**——见下 |
| 其它非 2xx | 上游 `message`，取不到则 `<status> <statusText>` | 通用兜底 |

### 5.3 非错误的特殊状态码

| Code | 场景 | 语义 |
|------|------|------|
| `404` | `GET contents` 数据文件不存在 | **正常分支**，转为 `{exists:false,...}`，后续 PUT 不带 `sha` 创建文件（`js/github.js:111`） |
| `409` / `422` | `PUT contents` `sha` 失配 | **可自愈冲突**，抛 `conflict` 标记 → 退避 `350ms × attempt` → 重新拉取 LWW 合并 → 重试，上限 3 次（`js/github.js:139-143,192-197`） |
| `200` + `permissions.push === false` | `GET repo` | HTTP 成功但**业务失败**，必须客户端判定（`js/github.js:265`） |
| `200` + 内容非合法 JSON | `GET contents` | 抛「远端数据文件不是合法 JSON」，通常是手工编辑过数据文件 |

### 5.4 网络层错误（无状态码）

`req()` 统一封装（`js/github.js:67-91`），全部中文化并置 `err.net = true`：

| 情形 | 判定 | 文案要点 |
|------|------|---------|
| 超时 | `AbortError` | `连接超时（N 秒未响应）：当前网络到 <host> 不通，建议在设置里填写 API 代理地址` |
| 不可达 / DNS 失败 / CORS 拒绝 | `e.name === 'TypeError'` **或** message 匹配 `failed to fetch\|networkerror\|load failed\|network request failed` | `无法连接 <host>：网络被阻断、域名解析失败或跨域被拒` |

> **【必须】** 判定用 `e.name === 'TypeError'` 而非 `instanceof TypeError`——fetch 可能来自其它 realm（polyfill / 扩展注入），`instanceof` 会失效（`js/github.js:80-81` 注释）。

**错误信息约定**：面向使用者的**中文可操作文案**，禁止泄露堆栈、令牌、内部路径。这与"message 仅供开发者、前端按 code 本地化"的常见做法**相反**——本项目无后端、无错误码体系，message 就是最终 UI 文案。

---

## 6. 超时、重试与限流

| 项 | 值 | 位置 |
|----|-----|------|
| 默认请求超时 | `12000ms`（`AbortController`） | `js/github.js:68` |
| 诊断步骤超时 | `10000ms` | `js/github.js:307,321,335` |
| 冲突重试 | 最多 3 次，退避 `350ms × attempt` | `js/github.js:192-197` |
| 本地变更防抖推送 | `1500ms` | `js/github.js:237` |
| 轮询拉取间隔 | 默认 `20s`，钳制 `5–300s`，`document.hidden` 时跳过 | `js/github.js:244-248` |
| 并发控制 | 静默调用复用进行中 Promise；主动调用排队后重跑 | `js/github.js:220-232` |

**代理侧无限流**：Worker 不做速率限制，实际配额由 GitHub 认证配额（5000 次/小时）约束。客户端的防抖 + 轮询钳制是唯一的调用节流手段。

**【必须】** 调用 `sync()` 的返回值用 `!== false` 判定成败——成功时可能返回对象也可能返回 `true`（architecture.md §12 技术债 / §11 不变式）。

---

## 7. 数据契约

代理**不定义**任何数据结构，仅透传。业务侧唯一的数据契约是数据文件 `data/workbench.json` 的根文档（`js/store.js:48`）：

```json
{ "version": 1, "todos": [], "notes": [], "updatedAt": 1782000000000 }
```

| 约定 | 说明 |
|------|------|
| 时间 | 统一 **Unix 毫秒时间戳**（`Date.now()`），非 ISO 字符串 |
| ID | 字符串，由 `util` 生成，非数字，无精度问题 |
| 布尔 | `true` / `false`，软删除标记为 `deleted: true` |
| 传输编码 | 整个 JSON 序列化后经 **UTF-8 安全 base64** 放进 `content` 字段（`js/util.js:86-101`） |
| 敏感字段 | **`cfg`（含 token）永不进入该文档**——`serialize()` 只输出上述 4 个键 |
| 兼容性 | 新增持久化字段必须同改三处：`normTodo()`/`normNote()` 补默认值、确认 `mergeInto()` 的 LWW 语义成立、确认 `serialize()` 不漏字段（architecture.md §11） |
| 一致性 | 最终一致 + **逐条 LWW**（按 `id` 主键比 `updatedAt`）；写并发靠 `sha` 乐观锁 |

---

## 8. 文档与验证

- **接口文档**：本目录，与代码手工同步；每篇必须有 `Source:` + `Last-verified:` 脚注。
- **契约测试**：**当前缺失**（architecture.md §12 列为 🔴 高优技术债，全仓库无测试文件）。
- **人工验证手段**：工作台「设置 → 诊断」的五步链路（配置检查 → 网络连通 → 令牌有效性 → 仓库访问与写权限 → 数据文件，`js/github.js:284-368`），失败即在具体步骤中断并给出处置建议——这是本项目**唯一**的接口连通性验证工具。
- <!-- TODO(sop.init): 代理侧无任何自动化验证手段（无 wrangler 测试、无部署后冒烟）。是否补一个不违反"禁 npm 依赖"红线的验证方式，待维护者确认 -->

---

## 参考

- 接口总索引：[index.md](index.md)
- 新增文档模板：[_template.md](_template.md)
- 架构与调用链：[../architecture.md](../architecture.md) §6.1、§9（代理侧安全）、§11（不变式）
- 上下游关系：[../relationship.md](../relationship.md)
- 编码与安全基线：[../coding-style.md](../coding-style.md)
- 代理部署步骤：[../devops/deployment.md](../devops/deployment.md)
