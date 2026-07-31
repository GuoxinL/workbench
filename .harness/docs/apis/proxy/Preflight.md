# Preflight（CORS 预检）

> Source: `proxy/cloudflare-worker.js:33-53`
> Last-verified: 2026-07-31（对应 commit `cf46195`，代理文件最后改动 `6427394`）

---

## 描述

浏览器对**带 `Authorization` 头的跨域请求**必定先发一次 `OPTIONS` 预检。本端点统一返回 `204` + CORS 响应头，声明代理允许的方法、请求头与可读响应头。

> **关键行为**：预检分支位于 Origin 白名单校验**之前**（`proxy/cloudflare-worker.js:51`），因此**任何来源的 OPTIONS 都会得到 204**。来源拒绝只发生在紧随其后的真实请求上（见各端点错误码 `403`）。调试时"预检通过但正式请求 403"属预期行为，不是代理故障。

---

## 请求

**方法 / 路径**：`OPTIONS {PROXY_BASE}/<任意路径>`

> `{PROXY_BASE}` = 使用者自部署的 Worker 地址（形如 `https://xxx.your-name.workers.dev`），填写在工作台「设置 → API 代理地址」，对应配置项 `cfg.apiBase`。留空时前端直连 `https://api.github.com`，不经过本代理。

### 入参

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| `Origin`（Header） | string | 否 | — | 浏览器自动携带；本端点**不校验**，仅用于回填 `Access-Control-Allow-Origin` |
| `Access-Control-Request-Method`（Header） | string | 否 | — | 浏览器自动携带；代理不读取，固定返回全量允许方法 |
| `Access-Control-Request-Headers`（Header） | string | 否 | — | 同上 |

无请求体。

### 示例

```http
OPTIONS /repos/GuoxinL/workbench-data/contents/data/workbench.json HTTP/1.1
Host: xxx.your-name.workers.dev
Origin: https://guoxinl.github.io
Access-Control-Request-Method: PUT
Access-Control-Request-Headers: authorization,content-type
```

## 响应

**状态码固定 `204 No Content`，无响应体。**

### 出参（响应头）

| 字段 | 类型 | 说明 |
|------|------|------|
| `Access-Control-Allow-Origin` | string | 来源在 `ALLOW_ORIGINS` 内 → 回显该 Origin；`ALLOW_ORIGINS` 为空数组 → 回显 Origin 或 `*`；来源不在白名单 → 回 `ALLOW_ORIGINS[0]`（默认 `https://guoxinl.github.io`） |
| `Access-Control-Allow-Methods` | string | 固定 `GET,PUT,POST,DELETE,OPTIONS` |
| `Access-Control-Allow-Headers` | string | 固定 `Authorization,Content-Type,Accept,X-GitHub-Api-Version` |
| `Access-Control-Expose-Headers` | string | 固定 `x-oauth-scopes,x-ratelimit-remaining,etag`——前端只能读到这三个上游头 |
| `Access-Control-Max-Age` | string | 固定 `86400`（预检结果缓存 24 小时） |
| `Vary` | string | 固定 `Origin` |

### 示例

```http
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://guoxinl.github.io
Access-Control-Allow-Methods: GET,PUT,POST,DELETE,OPTIONS
Access-Control-Allow-Headers: Authorization,Content-Type,Accept,X-GitHub-Api-Version
Access-Control-Expose-Headers: x-oauth-scopes,x-ratelimit-remaining,etag
Access-Control-Max-Age: 86400
Vary: Origin
```

## 错误码

| Code | 含义 | 处理建议 |
|------|------|---------|
| — | 本端点无错误分支，恒返回 `204` | 若浏览器仍报 CORS 失败，说明请求根本没到达 Worker（DNS/网络阻断），用「设置 → 诊断」的**网络连通**步定位（`js/github.js:306-316`） |

## 变更记录

| 日期 | 版本 | 变更内容 | 任务 |
|------|------|---------|------|
| 2026-07-31 | — | 首次依据 `proxy/cloudflare-worker.js` 落档 | sop.init |
