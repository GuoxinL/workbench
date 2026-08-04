# GetRepo（仓库元信息与写权限校验）

> Source: `proxy/cloudflare-worker.js:22,94-119`；调用方 `src/services/github/diagnose.ts:21-45`（`repoFetch`）、`:48`（`testConnection`）、`:101-106`（诊断第 4 步「仓库访问与写权限」）
> Last-verified: 2026-08-04

---

## 描述

透传 GitHub 仓库详情接口。本项目用它做**两件事**：确认数据仓库存在且令牌可访问；确认令牌具备**写权限**（`permissions.push`）。写权限必须在这里前置校验——否则用户要到第一次 PUT 推送失败时才发现令牌只读，而那时本地已产生未同步的脏数据。

> 本端点同时承担诊断链路第 2 步「网络连通」的探测（含令牌）：`runDiagnose` 第 2 步通过 `testConnection()`（即 `GET /repos/{owner}/{repo}`，`diagnose.ts:90-92`）判断网络是否走通，比早期「`GET /` 连通性探测」更贴近真实调用。

---

## 请求

**方法 / 路径**：`GET {PROXY_BASE}/repos/{owner}/{repo}`

命中白名单正则 `/^\/repos\/[^/]+\/[^/]+$/`（`proxy/cloudflare-worker.js:22`）。注意该正则**不允许**尾部斜杠或更深路径段；调用方在 sub 为空时**不拼尾斜杠**（`diagnose.ts:31`，`repoApi()` 返回 `${base}/repos/${config.repo}`）。

### 入参

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| `owner/repo`（Path） | string | 是 | 合并为 `config.repo`，格式 `owner/repo` | 前端 `isConfigComplete` 先用 `/^[^/\s]+\/[^/\s]+$/` 校验格式，不通过直接返回「仓库格式应为 owner/repo」，不发请求（`diagnose.ts:17-19`） |
| `Authorization`（Header） | string | 是 | `Bearer <PAT>` | 原样透传，代理不存储不记录 |
| `Accept`（Header） | string | 是 | `application/vnd.github+json` | — |

> 与 `contents` 端点不同，此处 `owner`/`repo` **未做 `encodeURIComponent`**（由 `repoApi()` 模板直拼，`diagnose.ts:21-24`），符合 GitHub 对仓库名的字符集约束即可。
> 调用方超时：统一 `12000ms`（`diagnose.ts:28`）。

### 示例

```http
GET /repos/GuoxinL/workbench-data HTTP/1.1
Host: xxx.your-name.workers.dev
Authorization: Bearer github_pat_xxx
Accept: application/vnd.github+json
```

## 响应

### 出参

本项目**只消费 3 个字段**，其余上游字段原样透传但不解析：

| 字段 | 类型 | 说明 |
|------|------|------|
| `full_name` | string | `owner/repo`，用于连接成功文案与诊断展示 |
| `private` | boolean | 展示为「私有 / 公开」；数据仓库**应为私有**，公开会导致笔记内容外泄 |
| `permissions.push` | boolean | **关键判定**：为 `false` 即令牌无写权限，`testConnection()` 返回 `canPush:false`（`diagnose.ts:73`），诊断第 4 步提示需 `Contents: Read and write`（`:104`）。字段缺失时视为通过（`data?.permissions?.push` 短路） |

### 示例

```json
{
  "full_name": "GuoxinL/workbench-data",
  "private": true,
  "permissions": { "admin": true, "push": true, "pull": true }
}
```

成功文案：`连接成功 · GuoxinL/workbench-data（私有仓库）` / 诊断：`GuoxinL/workbench-data（私有）· 可写`。

## 错误码

| Code | 含义 | 处理建议 |
|------|------|---------|
| `401` | 令牌无效或已过期 | `mapStatus` 分类为 `token`（`client.ts:23`），诊断据此判「令牌失效或无效」 |
| `403` | 代理白名单/来源拒绝，或 GitHub 限流 | 含 `rate limit` → `ratelimit`；否则原样展示 message（代理拒绝的中文提示会直接透出） |
| `404` | 仓库不存在 / 令牌未授权访问该仓库 | 诊断给出具体指引：「可能仓库名写错，或令牌未授权访问这个仓库（细粒度令牌需在 Repository access 里勾选它）」（`diagnose.ts:112`） |
| `502` | 代理转发失败 | `{"message":"中转到 GitHub 失败：<原因>"}`，由代理生成 |
| — | **200 但 `permissions.push === false`** | HTTP 层成功、业务层失败。必须在客户端判定，勿只看状态码（`diagnose.ts:73,103-106`） |

## 变更记录

| 日期 | 版本 | 变更内容 | 任务 |
|------|------|---------|------|
| 2026-07-31 | — | 首次依据 `proxy/cloudflare-worker.js` + `js/github.js` 落档 | sop.init |
| 2026-08-04 | — | 对齐新架构：调用方改为 `src/services/github/diagnose.ts`；写权限判定经 `permissions.push`（`testConnection`）；移除 `X-GitHub-Api-Version` 头；说明本端点同时承担诊断第 2 步连通性探测 | docs.refresh |
