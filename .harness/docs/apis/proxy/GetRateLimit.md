# GetRateLimit（令牌有效性 / 配额查询）

> Source: `proxy/cloudflare-worker.js:21,94-119`；调用方 `src/services/github/diagnose.ts:83-128`（诊断第 3 步「令牌有效性」）
> Last-verified: 2026-08-04

---

## 描述

透传 GitHub `/rate_limit`。本项目**不消费配额数字**，而是把它当作**最轻量的令牌校验探针**：`/rate_limit` 是 GitHub 唯一不消耗配额、且带 token 时会明确回 401 的端点。诊断第 3 步据此区分「网络通但令牌坏」与「令牌好但仓库没权限」。

> **变更**：旧架构读取响应头 `x-oauth-scopes` 展示令牌权限范围；**新架构不再消费该头**，令牌有效性直接由 `testConnection()` 返回的 `code`（`401 → token`）判定（`diagnose.ts:70,94-99`）。`x-oauth-scopes` 仍在 `Access-Control-Expose-Headers` 中放行（`api-standards.md` §3.2），但前端不再读取。

---

## 请求

**方法 / 路径**：`GET {PROXY_BASE}/rate_limit`

命中白名单正则 `/^\/rate_limit$/`（`proxy/cloudflare-worker.js:21`）。

### 入参

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| `Authorization`（Header） | string | 是 | `Bearer <PAT>` | 使用者的 GitHub Personal Access Token，取自 localStorage `wb.cfg.v1`（`src/stores/data.ts:24,83,357`）；代理**原样透传、不存储不记录**（`proxy/cloudflare-worker.js:93`） |
| `Accept`（Header） | string | 是 | 固定 `application/vnd.github+json` | 由调用方注入（`client.ts:57` / `diagnose.ts:37`） |
| `Origin`（Header） | string | 否 | 须在 `ALLOW_ORIGINS` 内 | 浏览器自动携带 |

> 只有前三个头 + `Origin` 会被转发；代理仅重建 `Authorization / Accept / Content-Type / X-GitHub-Api-Version` 四个头并附加 `User-Agent: workbench-proxy`（`proxy/cloudflare-worker.js:94-99`），**其余请求头一律丢弃**。
> 调用方超时：统一 `12000ms`（`diagnose.ts:28`），带 `cache: 'no-store'`。

### 示例

```http
GET /rate_limit HTTP/1.1
Host: xxx.your-name.workers.dev
Authorization: Bearer github_pat_xxx
Accept: application/vnd.github+json
Origin: https://guoxinl.github.io
```

## 响应

### 出参

| 字段 | 类型 | 说明 |
|------|------|------|
| `x-oauth-scopes`（响应头） | string | **当前调用方不消费**（见上「变更」）。经典令牌返回逗号分隔的 scope 列表；细粒度令牌不返回此头 |
| `x-ratelimit-remaining`（响应头） | string | 已在 `Access-Control-Expose-Headers` 中放行可读，但当前代码未读取 |
| `resources.core.limit` / `remaining` / `reset` | number | 上游原样透传；本项目不解析响应体 |

### 示例

```json
{
  "resources": {
    "core": { "limit": 5000, "remaining": 4997, "reset": 1782000000 }
  },
  "rate": { "limit": 5000, "remaining": 4997, "reset": 1782000000 }
}
```

诊断步骤成功时的 UI 输出：`Token 被 GitHub 接受`（不再展示权限范围半句）。

## 错误码

| Code | 含义 | 处理建议 |
|------|------|---------|
| `401` | 令牌无效或已过期 | 前端**硬编码**为「Token 无效或已过期，需重新生成」并中断诊断（`diagnose.ts:94-99` 据 `code==='token'` 判定），不再读上游 message |
| `403` | 二义：① 代理白名单/来源拒绝（体含「该接口未在代理白名单内」/「来源未被允许」）；② GitHub 侧限流 | `mapStatus` 仅在 `429` 或 `403` 时分类为 `ratelimit`（`client.ts:24`），否则**原样展示 message**——因此代理拒绝的中文提示会直接透到 UI，可据此区分两者 |
| `502` | 代理转发 GitHub 失败，体为 `{"message":"中转到 GitHub 失败：<原因>"}` | 检查 Worker 出网状态；此码由代理生成，非 GitHub 返回 |
| 其它非 2xx | 走 `githubRequest` 通用兜底 | 抛 `GithubError`，`code` 由 `mapStatus` 分类（`client.ts:22-27`） |

## 变更记录

| 日期 | 版本 | 变更内容 | 任务 |
|------|------|---------|------|
| 2026-07-31 | — | 首次依据 `proxy/cloudflare-worker.js` + `js/github.js` 落档 | sop.init |
| 2026-08-04 | — | 对齐新架构：调用方改为 `diagnose.ts`；**不再消费 `x-oauth-scopes`**，令牌有效性改由 `code==='token'` 判定；移除 `X-GitHub-Api-Version` 头引用 | docs.refresh |
