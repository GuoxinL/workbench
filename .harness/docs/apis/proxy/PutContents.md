# PutContents（推送数据文件）

> Source: `proxy/cloudflare-worker.js:23,62-104`；调用方 `js/github.js:125-148`（`pushRemote()`）、重试逻辑 `js/github.js:156-199`
> Last-verified: 2026-07-31（对应 commit `cf46195`，代理文件最后改动 `6427394`）

---

## 描述

透传 GitHub Contents API 的写入接口，把本地合并后的完整数据文档**全量覆写**到 `data/workbench.json`，每次成功产生一次 commit。

带 `sha` 时为**更新**（CAS 乐观锁：`sha` 与远端当前 blob 不符则拒绝）；不带 `sha` 时为**创建**（仅首次同步）。冲突（`409`/`422`）不直接失败，而是重新拉取合并后重试，最多 3 次。

---

## 请求

**方法 / 路径**：`PUT {PROXY_BASE}/repos/{owner}/{repo}/contents/{path}`

路径构造与编码规则同 [GetContents.md](GetContents.md)，但**不带任何查询参数**（分支通过请求体的 `branch` 字段指定，而非 `?ref=`）。

### 入参

**Header**

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| `Authorization` | string | 是 | `Bearer <PAT>` | 需 `Contents: Read and write` 权限；代理原样透传，不存储不记录 |
| `Content-Type` | string | 是 | `application/json` | 由 `pushRemote()` 显式追加（`js/github.js:135`）；代理白名单转发头之一 |
| `Accept` | string | 是 | `application/vnd.github+json` | — |
| `X-GitHub-Api-Version` | string | 是 | `2022-11-28` | — |

**Body**

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| `message` | string | 是 | — | commit 信息。调用方未指定时默认 `workbench: sync <本地时间>`（`toLocaleString('zh-CN')`，`js/github.js:127`） |
| `content` | string | 是 | base64 | `util.b64Encode()` 产出：`TextEncoder` → 0x8000 分块拼接 → `btoa`，UTF-8 安全且避免大文件栈溢出（`js/util.js:86-94`）。明文来自 `store.serialize()`，**只含 `version`/`updatedAt`/`todos`/`notes`，绝不含令牌** |
| `branch` | string | 是 | 已 trim | 取 `cfg.branch`，留空回落 `main` |
| `sha` | string | 否 | 上次 GET 返回的 blob sha | **乐观锁**。仅在远端文件已存在时携带（`js/github.js:131`）；缺省即创建新文件 |

> 代理对非 `GET`/`HEAD` 请求会先 `await request.text()` 完整读出请求体再转发（`proxy/cloudflare-worker.js:85`）。
> 超时：默认 `12000ms`。

### 示例

```json
{
  "message": "workbench: sync 2026/7/31 14:20:33",
  "content": "eyJ2ZXJzaW9uIjoxLCJ1cGRhdGVkQXQiOjE3ODIwMDAwMDAwMDAsInRvZG9zIjpbXSwibm90ZXMiOltdfQ==",
  "branch": "main",
  "sha": "9f2c1b7ae4d3..."
}
```

## 响应

### 出参

| 字段 | 类型 | 说明 |
|------|------|------|
| `content.sha` | string | **本项目唯一消费的字段**（`js/github.js:147`）：写入后的新 blob sha，缓存为 `lastSha` 供下次推送做锁；取不到时回落为本次请求用的 `sha`（`js/github.js:186`） |
| `content.*` / `commit.*` | object | 上游透传的文件与 commit 元信息，本项目不解析 |

### 示例

```json
{
  "content": { "name": "workbench.json", "path": "data/workbench.json", "sha": "a71e0c4f8b92..." },
  "commit": { "sha": "3d5f9a1...", "message": "workbench: sync 2026/7/31 14:20:33" }
}
```

## 错误码

| Code | 含义 | 处理建议 |
|------|------|---------|
| `409` / `422` | **冲突**：远端在本次 GET 之后被其它设备改过，`sha` 已失效 | **不上报失败**。抛带 `conflict` 标记的错误 → 退避 `350ms × attempt` → 重新 `fetchRemote()` + LWW 合并 → 重试，最多 3 次（`js/github.js:139-143`、`js/github.js:192-197`）。3 次仍冲突才报「多次提交冲突，已放弃本次同步」 |
| `401` | 令牌无效或已过期 | 映射为「Token 无效或已过期」 |
| `403` | 代理白名单/来源拒绝，或 GitHub 限流 | 含 `rate limit` → 「API 调用频率超限，请稍后再试」；否则原样展示 message。**令牌只读时 GitHub 亦可能返回 403**——应在 [GetRepo.md](GetRepo.md) 阶段用 `permissions.push` 前置拦截 |
| `404` | 仓库/分支不存在，或令牌无该仓库权限 | 映射为「仓库或分支不存在，或 Token 无该仓库权限」 |
| `502` | 代理转发 GitHub 失败 | `{"message":"中转到 GitHub 失败：<原因>"}`，由代理生成 |
| 其它非 2xx | 走 `readErr()` 兜底 | 展示上游 `message` 或 `<status> <statusText>` |
| — | 超时 / 网络不可达 | 置 `err.net = true` 并中文化；`setState('error')` 点亮顶栏红点，非静默调用额外 toast 3.2s（`js/github.js:201-206`） |

### 调用节流（避免触发限流）

| 机制 | 参数 | 位置 |
|------|------|------|
| 本地变更防抖推送 | `1500ms` | `js/github.js:237` |
| 定时轮询拉取 | 默认 `20s`，钳制在 `5–300s`，页面隐藏时跳过 | `js/github.js:244-248` |
| 并发排队 | 静默调用复用进行中的 Promise；用户主动调用等当前结束后重跑 | `js/github.js:220-232` |

## 变更记录

| 日期 | 版本 | 变更内容 | 任务 |
|------|------|---------|------|
| 2026-07-31 | — | 首次依据 `proxy/cloudflare-worker.js` + `js/github.js` 落档 | sop.init |
