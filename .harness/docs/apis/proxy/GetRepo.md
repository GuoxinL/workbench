# GetRepo（仓库元信息与写权限校验）

> Source: `proxy/cloudflare-worker.js:22,62-104`；调用方 `js/github.js:261`（`test()` 连接测试）、`js/github.js:335`（`diagnose()` 第 4 步「仓库访问」）
> Last-verified: 2026-07-31（对应 commit `cf46195`，代理文件最后改动 `6427394`）

---

## 描述

透传 GitHub 仓库详情接口。本项目用它做**两件事**：确认数据仓库存在且令牌可访问；确认令牌具备**写权限**（`permissions.push`）。写权限必须在这里前置校验——否则用户要到第一次 PUT 推送失败时才发现令牌只读，而那时本地已产生未同步的脏数据。

---

## 请求

**方法 / 路径**：`GET {PROXY_BASE}/repos/{owner}/{repo}`

命中白名单正则 `/^\/repos\/[^/]+\/[^/]+$/`（`proxy/cloudflare-worker.js:22`）。注意该正则**不允许**尾部斜杠或更深路径段。

### 入参

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| `owner`（Path） | string | 是 | 不含 `/` 与空白 | 由 `cfg.repo`（`owner/repo` 格式）split 得到；前端先用 `/^[^/\s]+\/[^/\s]+$/` 校验格式，不通过直接返回「仓库格式应为 owner/repo」，不发请求（`js/github.js:254`、`js/github.js:297`） |
| `repo`（Path） | string | 是 | 同上 | 默认数据仓库 `workbench-data`，配置留空时由 `normCfg()` 回落默认值（`js/github.js:34-41`） |
| `Authorization`（Header） | string | 是 | `Bearer <PAT>` | 原样透传，代理不存储不记录 |
| `Accept`（Header） | string | 是 | `application/vnd.github+json` | — |
| `X-GitHub-Api-Version`（Header） | string | 是 | `2022-11-28` | — |

> 与 `contents` 端点不同，此处 `owner`/`repo` **未做 `encodeURIComponent`**（`js/github.js:261`、`js/github.js:335` 为模板字符串直拼），符合 GitHub 对仓库名的字符集约束即可。
> 调用方超时：`test()` 用默认 `12000ms`，`diagnose()` 用 `10000ms`。

### 示例

```http
GET /repos/GuoxinL/workbench-data HTTP/1.1
Host: xxx.your-name.workers.dev
Authorization: Bearer github_pat_xxx
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
```

## 响应

### 出参

本项目**只消费 3 个字段**，其余上游字段原样透传但不解析：

| 字段 | 类型 | 说明 |
|------|------|------|
| `full_name` | string | `owner/repo`，用于连接成功文案与诊断展示 |
| `private` | boolean | 展示为「私有 / 公开」；数据仓库**应为私有**，公开会导致笔记内容外泄 |
| `permissions.push` | boolean | **关键判定**：为 `false` 即令牌无写权限，`test()` 直接返回失败「Token 对该仓库没有写入权限」（`js/github.js:265-267`），`diagnose()` 提示需 `Contents: Read and write`（`js/github.js:342-345`）。字段缺失时视为通过（`info.permissions &&` 短路） |

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
| `401` | 令牌无效或已过期 | `readErr()` 硬编码映射为「Token 无效或已过期」（`js/github.js:98`） |
| `403` | 代理白名单/来源拒绝，或 GitHub 限流 | 含 `rate limit` 字样 → 「API 调用频率超限，请稍后再试」；否则原样展示 message（代理拒绝的中文提示会直接透出） |
| `404` | 仓库不存在 / 令牌未授权访问该仓库 | `diagnose()` 给出最具体的指引：「可能仓库名写错，或令牌未授权访问这个仓库（细粒度令牌需在 Repository access 里勾选它）」（`js/github.js:336-339`）。`readErr()` 通用文案为「仓库或分支不存在，或 Token 无该仓库权限」 |
| `502` | 代理转发失败 | `{"message":"中转到 GitHub 失败：<原因>"}`，由代理生成 |
| — | **200 但 `permissions.push === false`** | HTTP 层成功、业务层失败。必须在客户端判定，勿只看状态码 |

## 变更记录

| 日期 | 版本 | 变更内容 | 任务 |
|------|------|---------|------|
| 2026-07-31 | — | 首次依据 `proxy/cloudflare-worker.js` + `js/github.js` 落档 | sop.init |
