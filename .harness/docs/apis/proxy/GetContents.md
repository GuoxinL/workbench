# GetContents（拉取数据文件）

> Source: `proxy/cloudflare-worker.js:23,62-104`；调用方 `js/github.js:106-122`（`fetchRemote()`）
> Last-verified: 2026-07-31（对应 commit `cf46195`，代理文件最后改动 `6427394`）

---

## 描述

透传 GitHub Contents API 的读取接口，拉取数据仓库中的**唯一数据文件** `data/workbench.json`。这是同步链路的第一步：拿到远端内容做逐条 LWW 合并，同时拿到 `sha` 供后续 PUT 做乐观锁。

**`404` 不是错误**——数据文件首次同步前不存在，调用方把它转成 `{exists:false, data:null, sha:null}` 正常继续（`js/github.js:111`），后续 PUT 会不带 `sha` 创建文件。

---

## 请求

**方法 / 路径**：`GET {PROXY_BASE}/repos/{owner}/{repo}/contents/{path}?ref={branch}&t={timestamp}`

命中白名单正则 `/^\/repos\/[^/]+\/[^/]+\/contents\//`（`proxy/cloudflare-worker.js:23`）——**前缀匹配**，故 `contents/` 之下的任意深度路径均放行。

### 入参

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| `owner`（Path） | string | 是 | 不含 `/` 与空白 | 经 `encodeURIComponent` 编码（`js/github.js:51`） |
| `repo`（Path） | string | 是 | 同上 | 同上；默认 `workbench-data` |
| `path`（Path） | string | 是 | 去掉前导 `/` | 默认 `data/workbench.json`。**按 `/` 切段后逐段** `encodeURIComponent` 再拼回，保留目录分隔语义（`js/github.js:50-51`） |
| `ref`（Query） | string | 是 | 分支名 | 取 `cfg.branch`，留空回落 `main`；经 `encodeURIComponent`（`js/github.js:108`） |
| `t`（Query） | number | 是 | `Date.now()` 毫秒 | **破缓存参数**，非 GitHub 协议字段，仅用于绕过中间层缓存；上游忽略之。查询串由代理原样透传（`proxy/cloudflare-worker.js:70`） |
| `Authorization`（Header） | string | 是 | `Bearer <PAT>` | 原样透传，代理不存储不记录 |
| `Accept`（Header） | string | 是 | `application/vnd.github+json` | 决定返回 base64 JSON 而非 raw |
| `X-GitHub-Api-Version`（Header） | string | 是 | `2022-11-28` | — |

> 调用方额外带 `cache: 'no-store'`（`js/github.js:109`），与 `t` 参数构成双重防缓存。
> 超时：默认 `12000ms`（`js/github.js:68`）。
> 无请求体（`GET`/`HEAD` 时代理显式传 `body: undefined`，`proxy/cloudflare-worker.js:85`）。

### 示例

```http
GET /repos/GuoxinL/workbench-data/contents/data/workbench.json?ref=main&t=1782000000000 HTTP/1.1
Host: xxx.your-name.workers.dev
Authorization: Bearer github_pat_xxx
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
```

## 响应

### 出参

| 字段 | 类型 | 说明 |
|------|------|------|
| `content` | string | **base64 编码**的文件内容（GitHub 会插入换行）。经 `util.b64Decode()` 解码——先 `replace(/\s/g,'')` 去空白、再 `atob` + `TextDecoder` 还原 UTF-8（`js/util.js:96-101`） |
| `sha` | string | 文件 blob SHA，**乐观锁凭据**，原样带入后续 PUT（见 [PutContents.md](PutContents.md)） |
| 其它（`name`/`size`/`encoding`/`_links` 等） | — | 上游透传，本项目不消费 |

解码后的 JSON 即数据根文档：`{ version:1, todos:[], notes:[], updatedAt:number }`（`js/store.js:48`）。

### 示例

```json
{
  "name": "workbench.json",
  "path": "data/workbench.json",
  "sha": "9f2c1b7ae4d3...",
  "size": 4821,
  "encoding": "base64",
  "content": "eyJ2ZXJzaW9uIjoxLCJ0b2RvcyI6W10sIm5vdGVzIjpbXSwidXBkYXRl\nZEF0IjoxNzgyMDAwMDAwMDAwfQ==\n"
}
```

调用方归一化后的返回：`{ exists: true, data: <解析后的对象>, sha: "9f2c1b7ae4d3..." }`。

## 错误码

| Code | 含义 | 处理建议 |
|------|------|---------|
| `404` | **非异常**：数据文件尚未创建 | 转为 `{exists:false, data:null, sha:null}`；诊断第 5 步提示「尚未创建，首次同步会自动生成」（`js/github.js:111`、`js/github.js:355-356`） |
| `401` | 令牌无效或已过期 | 映射为「Token 无效或已过期」，同步状态置 `error` |
| `403` | 代理白名单/来源拒绝，或 GitHub 限流 | 含 `rate limit` → 「API 调用频率超限，请稍后再试」；否则原样展示 message |
| `502` | 代理转发 GitHub 失败 | `{"message":"中转到 GitHub 失败：<原因>"}`，由代理生成 |
| 其它非 2xx | 走 `readErr()` 兜底 | 展示上游 `message` 或 `<status> <statusText>` |
| — | **200 但内容不是合法 JSON** | 抛「远端数据文件不是合法 JSON，请检查 `<path>`」（`js/github.js:119`）。通常是手工编辑过数据文件所致，需回仓库修正 |
| — | 超时 / 网络不可达 | `req()` 统一中文化并置 `err.net = true`（`js/github.js:74-86`），提示改填 API 代理地址 |

## 变更记录

| 日期 | 版本 | 变更内容 | 任务 |
|------|------|---------|------|
| 2026-07-31 | — | 首次依据 `proxy/cloudflare-worker.js` + `js/github.js` 落档 | sop.init |
