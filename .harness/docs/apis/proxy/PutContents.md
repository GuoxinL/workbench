# PutContents（推送文件）

> Source: `proxy/cloudflare-worker.js:23,94-119`；调用方 `src/services/github/repoFile.ts:46-94`（`putFile`/`putFileBase64`/`deleteFile`）、`src/services/github/contents.ts:111-195`（`pushRemote`）
> Last-verified: 2026-08-04

---

## 描述

透传 GitHub Contents API 的写入接口，把本地合并后的内容**全量覆写**到数据仓库的单文件——典型为 `kb/<id>.md` / `todos/<id>.json` / `images/<sha>.<ext>`，每次成功产生一次 commit。

带 `sha` 时为**更新**（CAS 乐观锁：`sha` 与远端当前 blob 不符则拒绝）；不带 `sha` 时为**创建**（仅首次同步）。冲突（`409`/`422`）不直接失败，而是由同步引擎重拉合并后重试，最多 3 次。

> **不再全量覆写单一数据文件，也不再写中央索引**：新架构为索引驱动的差分同步，每次**只 PUT 真正变化的 `kb/<id>.md` / `todos/<id>.json`**（`pushRemote` 的 `articleIds`/`todoIds`，`contents.ts:111-195`）；**根目录 `manifest.json` 已不再写入**（2026-08-04 起），索引改由每轮现拉的 `kb/`、`todos/` 目录树 blob sha 承担。
>
> **乐观锁 sha 的来源**：取自本轮刚拉到的目录树 `treeShaByPath[path]`（`contents.ts:126,152,174,195`），而非任何中央索引文件——这是消除 `manifest.json` 写入热点的关键。推送成功后新 sha 回写本地基线 `wb.syncState.v1`（`path → sha`）。

---

## 请求

**方法 / 路径**：`PUT {PROXY_BASE}/repos/{owner}/{repo}/contents/{path}?ref={branch}`

路径构造与编码规则同 [GetContents.md](GetContents.md)。分支经 **`?ref=` 查询参数**指定（与 GET 一致），**不放在请求体**（旧架构的 body `branch` 字段已废弃，见 `client.ts:52`）。

### 入参

**Header**

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| `Authorization` | string | 是 | `Bearer <PAT>` | 需 `Contents: Read and write` 权限；代理原样透传，不存储不记录 |
| `Content-Type` | string | 是 | `application/json` | 由调用方显式追加（`client.ts:59`）；代理白名单转发头之一 |
| `Accept` | string | 是 | `application/vnd.github+json` | — |

**Body**

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| `message` | string | 是 | — | commit 信息，由调用方生成（如 `update <title>` / `update todo <title>` / `add image <path>`，见 `contents.ts:128,154,235`） |
| `content` | string | 是 | base64 | `repoFile.toBase64()` 产出：`TextEncoder` → `btoa`，UTF-8 安全（`repoFile.ts:19-24`）。图片二进制经 `putFileBase64` 直传，不二次编码 |
| `sha` | string | 否 | 本轮目录树返回的 blob sha（`treeShaByPath[path]`） | **乐观锁**。仅在远端文件已存在时携带（`repoFile.ts:68`）；缺省即创建新文件 |

> 代理对非 `GET`/`HEAD` 请求会先 `await request.text()` 完整读出请求体再转发（`proxy/cloudflare-worker.js:106`）。
> 超时：默认 `12000ms`（`client.ts:20`）。

### 示例

```json
{
  "message": "update hello",
  "content": "I2hlbGxvCg==",
  "sha": "9f2c1b7ae4d3..."
}
```

## 响应

### 出参

| 字段 | 类型 | 说明 |
|------|------|------|
| `content.sha` | string | **本项目唯一消费的字段**（`repoFile.ts:71`）：写入后的新 blob sha，回填进本地基线 `wb.syncState.v1[path]` 作为下轮判定与乐观锁基准；取不到时回落为本次请求用的 `sha` |
| `content.*` / `commit.*` | object | 上游透传的文件与 commit 元信息，本项目不解析 |

### 示例

```json
{
  "content": { "name": "hello.md", "path": "kb/hello.md", "sha": "a71e0c4f8b92..." },
  "commit": { "sha": "3d5f9a1...", "message": "update hello" }
}
```

## 错误码

| Code | 含义 | 处理建议 |
|------|------|---------|
| `409` / `422` | **冲突**：远端在本次拉取目录树之后被其它设备改过，`sha` 已失效 | **不上报失败**。抛 `ConflictError`（`repoFile.ts:72-77`）→ 用**重新拉到的远端 sha** 合并后重试；同步引擎退避 `RETRY_BACKOFF × attempt`（350ms 起）重跑整轮，最多 `MAX_RETRY = 3` 次（`sync/engine.ts:59-60,142-149`）。3 次仍冲突才报「多次提交冲突，已放弃本次同步」 |
| `401` | 令牌无效或已过期 | 映射为 `token` 错误 |
| `403` | 代理白名单/来源拒绝，或 GitHub 限流 | 含 `rate limit` → `ratelimit`；否则原样展示 message。**令牌只读时 GitHub 亦可能返回 403**——应在 [GetRepo.md](GetRepo.md) 阶段用 `permissions.push` 前置拦截 |
| `404` | 仓库/分支不存在，或令牌无该仓库权限 | 映射为 `notfound` |
| `502` | 代理转发 GitHub 失败 | `{"message":"中转到 GitHub 失败：<原因>"}`，由代理生成 |
| 其它非 2xx | 走 `githubRequest` 兜底 | 抛 `GithubError`，`code` 由 `mapStatus` 分类（`client.ts:22-27`） |
| — | 超时 / 网络不可达 | 置 `err.net = true` 并中文化；UI 层据 `SyncOutcome.ok` 展示错误状态（`sync/engine.ts` 返回 `{ok:false}`） |

### 调用节流（避免触发限流）

| 机制 | 参数 | 位置 |
|------|------|------|
| 本地变更防抖推送 | `PUSH_DEBOUNCE = 1500ms` | `sync/engine.ts:58,171-176`（`schedulePush`） |
| 定时轮询拉取 | 由 `cfg.poll` 决定，钳制在 `MIN_POLL=5000`–`MAX_POLL=300000`（5–300s），页面隐藏时跳过 | `sync/engine.ts:61-62,178-185`（`startPolling`） |
| 并发排队 | 复用进行中的 `inFlight` Promise，而非"忙即失败" | `sync/engine.ts:161-169`（`sync`） |

## 变更记录

| 日期 | 版本 | 变更内容 | 任务 |
|------|------|---------|------|
| 2026-07-31 | — | 首次依据 `proxy/cloudflare-worker.js` + `js/github.js` 落档 | sop.init |
| 2026-08-04 | — | 对齐新架构：调用方改为 `src/services/github/*`；推送单位由单 `data/workbench.json` 改为差分文件 + manifest；分支改经 `?ref=` 而非 body `branch`；移除 `X-GitHub-Api-Version` 头；重试/节流引用对齐 `sync/engine.ts` | docs.refresh |
| 2026-08-04 | — | 索引机制变更（commit `3c96921` / `80e1b40`）：**不再 PUT 根目录 `manifest.json`**，只写真正变化的 `kb/<id>.md` / `todos/<id>.json`；乐观锁 sha 改取自本轮目录树 `treeShaByPath`，成功后回写 `wb.syncState.v1` | sync.tree-index |
