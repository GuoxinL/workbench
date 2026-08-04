# GetApiRoot（API 根连通性探测）

> Source: `proxy/cloudflare-worker.js:24,116-119`；调用方 当前诊断链路改用 [GetRepo.md](GetRepo.md)（`GET /repos/{owner}/{repo}`，含令牌）做连通性探测，本端点仍由代理白名单放行，作为通用无令牌连通性探测存在
> Last-verified: 2026-08-04

---

## 描述

透传 GitHub API 根路径 `/`，**不带令牌**，唯一用途是判断「当前网络能否走通到代理 / GitHub」。工作台的五步同步诊断原本把它作为第 2 步「网络连通」；**新架构改为用 `GET /repos/{owner}/{repo}`（含令牌，见 GetRepo）做该探测**，更接近真实调用且能同时拿到写权限信息。本端点仍由代理白名单保留放行，供调试或外部连通性验证使用。

---

## 请求

**方法 / 路径**：`GET {PROXY_BASE}/`

命中白名单正则 `/^\/$/`（`proxy/cloudflare-worker.js:24`）。

### 入参

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| `Origin`（Header） | string | 否 | 须在 `ALLOW_ORIGINS` 内 | 浏览器自动携带；**为空时跳过来源校验**（`originAllowed` 首行 `if (!origin) return true` 短路，`proxy/cloudflare-worker.js:44`），故 curl 直调不受来源白名单限制 |

无查询参数、无请求体、**不带 `Authorization`**（探测的是链路而非凭证）。

> 调用方超时：统一 `12000ms`（`diagnose.ts:28`，`repoFetch` 的 `AbortController`）。
> 调用方固定带 `cache: 'no-store'`，避免命中浏览器缓存导致探测结果失真。

### 示例

```http
GET / HTTP/1.1
Host: xxx.your-name.workers.dev
Origin: https://guoxinl.github.io
```

## 响应

响应体**原样透传** `https://api.github.com/` 的内容（GitHub 的 API 端点清单 JSON）。调用方**只读状态码，不解析响应体**。

### 出参

| 字段 | 类型 | 说明 |
|------|------|------|
| （响应体） | object | GitHub API 端点索引 JSON；本项目不消费其中任何字段 |
| `Access-Control-*`（响应头） | string | 由代理覆盖写入，见 [Preflight.md](Preflight.md) |
| `content-encoding` / `content-length`（响应头） | — | 被代理**主动删除**（`proxy/cloudflare-worker.js:118-119`），因响应体已被重新流式包装，原值会失配 |

### 示例

```json
{
  "current_user_url": "https://api.github.com/user",
  "rate_limit_url": "https://api.github.com/rate_limit",
  "repository_url": "https://api.github.com/repos/{owner}/{repo}"
}
```

## 错误码

| Code | 含义 | 处理建议 |
|------|------|---------|
| `403` | 代理拒绝：来源未被允许。响应体 `{"message":"来源未被允许：<origin>"}` | 把站点域名加进 `proxy/cloudflare-worker.js:29-34` 的 `ALLOW_ORIGINS` 后重新 Deploy |
| `502` | 代理到 GitHub 的转发本身抛异常。响应体 `{"message":"中转到 GitHub 失败：<原因>"}` | Worker 出网异常或上游不可达 |
| `>= 500`（透传） | 上游 GitHub 服务异常 | 同上 |
| 请求未返回（超时/`TypeError`） | 网络被阻断、DNS 失败或跨域被拒 | `githubRequest` 统一转成中文错误并置 `err.net = true`（`client.ts:93-99`）；未配代理时额外追加「这是你同步失败的根因，需填 API 代理地址」 |

> 注意：本端点**未做 401 处理**——它本就不带令牌，凭证问题请看 [GetRateLimit.md](GetRateLimit.md)。

## 变更记录

| 日期 | 版本 | 变更内容 | 任务 |
|------|------|---------|------|
| 2026-07-31 | — | 首次依据 `proxy/cloudflare-worker.js` + `js/github.js` 落档 | sop.init |
| 2026-08-04 | — | 对齐新架构：说明诊断第 2 步改用 GetRepo 端点探测；行号引用更新至 `proxy/cloudflare-worker.js` 与 `diagnose.ts` | docs.refresh |
