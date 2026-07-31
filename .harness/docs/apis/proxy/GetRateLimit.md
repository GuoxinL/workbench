# GetRateLimit（令牌有效性 / 配额查询）

> Source: `proxy/cloudflare-worker.js:21,62-104`；调用方 `js/github.js:320-330`（`diagnose()` 第 3 步「令牌有效性」）
> Last-verified: 2026-07-31（对应 commit `cf46195`，代理文件最后改动 `6427394`）

---

## 描述

透传 GitHub `/rate_limit`。本项目**不消费配额数字**，而是把它当作**最轻量的令牌校验探针**：`/rate_limit` 是 GitHub 唯一不消耗配额、且带 token 时会明确回 401 的端点。诊断第 3 步据此区分「网络通但令牌坏」与「令牌好但仓库没权限」。

同时从响应头 `x-oauth-scopes` 读取令牌权限范围提示（细粒度令牌不返回该头，此时提示为空）。

---

## 请求

**方法 / 路径**：`GET {PROXY_BASE}/rate_limit`

命中白名单正则 `/^\/rate_limit$/`（`proxy/cloudflare-worker.js:21`）。

### 入参

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| `Authorization`（Header） | string | 是 | `Bearer <PAT>` | 使用者的 GitHub Personal Access Token，取自 localStorage `wb.cfg.v1`；代理**原样透传、不存储不记录**（`proxy/cloudflare-worker.js:72-77`） |
| `Accept`（Header） | string | 是 | 固定 `application/vnd.github+json` | 由 `headers()` 统一注入（`js/github.js:54-60`） |
| `X-GitHub-Api-Version`（Header） | string | 是 | 固定 `2022-11-28` | 同上 |
| `Origin`（Header） | string | 否 | 须在 `ALLOW_ORIGINS` 内 | 浏览器自动携带 |

> 只有上表前三个头 + `Origin` 会被转发；代理仅重建 `Authorization / Accept / Content-Type / X-GitHub-Api-Version` 四个头并附加 `User-Agent: workbench-proxy`（`proxy/cloudflare-worker.js:73-78`），**其余请求头一律丢弃**。
> 调用方超时：`10000ms`，带 `cache: 'no-store'`（`js/github.js:321`）。

### 示例

```http
GET /rate_limit HTTP/1.1
Host: xxx.your-name.workers.dev
Authorization: Bearer github_pat_xxx
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
Origin: https://guoxinl.github.io
```

## 响应

### 出参

| 字段 | 类型 | 说明 |
|------|------|------|
| `x-oauth-scopes`（响应头） | string | **本项目唯一消费的字段**（`js/github.js:324`）。经典令牌返回逗号分隔的 scope 列表；细粒度令牌不返回此头，诊断文案回落为空 |
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

诊断步骤成功时的 UI 输出：`Token 被 GitHub 接受，权限范围：repo`（无 `x-oauth-scopes` 时省略后半句）。

## 错误码

| Code | 含义 | 处理建议 |
|------|------|---------|
| `401` | 令牌无效或已过期 | 前端**硬编码**为「Token 无效或已过期，需重新生成」并中断诊断（`js/github.js:322`），不再读上游 message |
| `403` | 二义：① 代理白名单/来源拒绝（体含「该接口未在代理白名单内」/「来源未被允许」）；② GitHub 侧限流 | `readErr()` 仅在 message 匹配 `/rate limit/i` 时映射为「API 调用频率超限，请稍后再试」（`js/github.js:99`），否则**原样展示 message**——因此代理拒绝的中文提示会直接透到 UI，可据此区分两者 |
| `502` | 代理转发 GitHub 失败，体为 `{"message":"中转到 GitHub 失败：<原因>"}` | 检查 Worker 出网状态；此码由代理生成，非 GitHub 返回 |
| 其它非 2xx | 走 `readErr()` 通用兜底 | 展示上游 `message`，无则展示 `<status> <statusText>` |

## 变更记录

| 日期 | 版本 | 变更内容 | 任务 |
|------|------|---------|------|
| 2026-07-31 | — | 首次依据 `proxy/cloudflare-worker.js` + `js/github.js` 落档 | sop.init |
