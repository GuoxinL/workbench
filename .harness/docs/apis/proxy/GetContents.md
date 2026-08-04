# GetContents（拉取文件）

> Source: `proxy/cloudflare-worker.js:23,94-119`；调用方 `src/services/github/repoFile.ts:34-43`（`getFile()`）、`src/services/github/contents.ts:14-75`（索引与差分拉取）
> Last-verified: 2026-08-04

---

## 描述

透传 GitHub Contents API 的读取接口，按路径拉取数据仓库中的任意文件——典型包括轻量索引 `manifest.json`、文章 `kb/<id>.md`、待办 `todos/<id>.json`、图片 `images/<sha>.<ext>`。这是同步链路的第一步：拿到远端内容与 `sha` 供后续 PUT 做乐观锁。

**`404` 不是错误**——文件首次同步前不存在，调用方 `getFile()` 捕获 `notfound` 返回 `null`（`repoFile.ts:39-41`），后续 PUT 会不带 `sha` 创建文件。

---

## 请求

**方法 / 路径**：`GET {PROXY_BASE}/repos/{owner}/{repo}/contents/{path}?ref={branch}`

命中白名单正则 `/^\/repos\/[^/]+\/[^/]+\/contents\//`（`proxy/cloudflare-worker.js:23`）——**前缀匹配**，故 `contents/` 之下的任意深度路径均放行。

### 入参

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| `owner/repo`（Path） | string | 是 | 合并为 `config.repo`，不含 `/` 与空白 | 由 `githubRequest()` 拼入 URL（`client.ts:51-52`）；前端 `isConfigComplete` 校验格式 `owner/repo`（`diagnose.ts:17-19`） |
| `path`（Path） | string | 是 | 去掉前导 `/` | 取 `kb/<id>.md` / `manifest.json` / `todos/<id>.json` / `images/<sha>.<ext>`；按 `/` 切段后逐段 `encodeURIComponent` 再拼回（`client.ts:52`） |
| `ref`（Query） | string | 是 | 分支名 | 取 `cfg.branch`，经 `encodeURIComponent`（`client.ts:52`） |
| `Authorization`（Header） | string | 是 | `Bearer <PAT>` | 原样透传，代理不存储不记录 |
| `Accept`（Header） | string | 是 | `application/vnd.github+json` | 决定返回 base64 JSON 而非 raw |

> 调用方固定 `cache: 'no-store'`（`client.ts:70`），避免命中缓存返回陈旧 `sha` 导致后续 PUT 409（旧架构的 `?t=` 破缓存参数已废弃）。
> 超时：默认 `12000ms`（`client.ts:20`）。
> 无请求体（`GET`/`HEAD` 时代理显式传 `body: undefined`，`proxy/cloudflare-worker.js:106`）。

### 示例

```http
GET /repos/GuoxinL/workbench-data/contents/kb/hello.md?ref=main HTTP/1.1
Host: xxx.your-name.workers.dev
Authorization: Bearer github_pat_xxx
Accept: application/vnd.github+json
```

## 响应

### 出参

| 字段 | 类型 | 说明 |
|------|------|------|
| `content` | string | **base64 编码**的文件内容（GitHub 会插入换行）。经 `repoFile.fromBase64()` 解码——先 `replace(/\s/g,'')` 去空白、再 `atob` + `TextDecoder` 还原 UTF-8（`repoFile.ts:26-31`） |
| `sha` | string | 文件 blob SHA，**乐观锁凭据**，原样带入后续 PUT（见 [PutContents.md](PutContents.md)） |
| 其它（`name`/`size`/`encoding`/`_links` 等） | — | 上游透传，本项目不消费 |

解码后的内容按文件类型解析：`kb/<id>.md` → `parseFrontmatter()` 拆 frontmatter + 正文；`todos/<id>.json` → `JSON.parse` + Zod 校验（`contents.ts:33-74`）。

### 示例

```json
{
  "name": "hello.md",
  "path": "kb/hello.md",
  "sha": "9f2c1b7ae4d3...",
  "size": 1280,
  "encoding": "base64",
  "content": "I2hlbGxvCg==\n"
}
```

## 错误码

| Code | 含义 | 处理建议 |
|------|------|---------|
| `404` | **非异常**：文件尚未创建 | `getFile()` 返回 `null`（`repoFile.ts:39-41`）；诊断第 5 步提示「尚未创建，首次同步会自动生成」（`diagnose.ts:111`） |
| `401` | 令牌无效或已过期 | 映射为 `token` 错误，同步状态置 `error` |
| `403` | 代理白名单/来源拒绝，或 GitHub 限流 | 含 `rate limit` → `ratelimit`；否则原样展示 message |
| `502` | 代理转发 GitHub 失败 | `{"message":"中转到 GitHub 失败：<原因>"}`，由代理生成 |
| 其它非 2xx | 走 `githubRequest` 兜底 | 抛 `GithubError`，`code` 由 `mapStatus` 分类（`client.ts:22-27`） |
| — | 超时 / 网络不可达 | `githubRequest` 统一中文化并置 `err.net = true`（`client.ts:93-99`），提示改填 API 代理地址 |

## 变更记录

| 日期 | 版本 | 变更内容 | 任务 |
|------|------|---------|------|
| 2026-07-31 | — | 首次依据 `proxy/cloudflare-worker.js` + `js/github.js` 落档 | sop.init |
| 2026-08-04 | — | 对齐新架构：调用方改为 `src/services/github/*`；数据模型由单 `data/workbench.json` 改为文档库（kb/manifest/todos/images）；移除 `?t=` 破缓存参数（改用 `cache:no-store`）；移除 `X-GitHub-Api-Version` 头 | docs.refresh |
