# <ActionName>

> 复制为 `apis/<module>/<ActionName>.md` 并按实填充。
> Source: <被测代码路径，如 `src/services/github/repoFile.ts` 或 `proxy/cloudflare-worker.js`>
> Last-verified: <YYYY-MM-DD>

---

## 描述

<!-- 一句话说明接口做什么、适用场景 -->

## 请求

**方法 / 路径**：`GET|PUT|DELETE {PROXY_BASE}/repos/{owner}/{repo}/contents/{path}?ref={branch}`
<!-- 本项目无 URL 版本前缀、无统一响应包装、无 IDL；路径沿用 GitHub Contents API 语义（见 api-standards.md §1）。代理侧端点另含 OPTIONS /*（预检）、GET /、GET /rate_limit、GET /repos/{owner}/{repo} -->

### 入参

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
|  |  |  |  |  |

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
|  |  |  |

### 示例

```json
{
  "content": "eyJ2ZXJzaW9uIjoxfQ==",
  "sha": "9f2c1b7ae4d3..."
}
```
<!-- 成功时返回 GitHub 原样响应体（含 content/sha 等）；失败时代理返回 {"message":"<中文提示>"}（见 api-standards.md §5.1） -->

## 错误码

| Code | 含义 | 处理建议 |
|------|------|---------|
|  |  |  |

## 变更记录

| 日期 | 版本 | 变更内容 | 任务 |
|------|------|---------|------|
|  |  |  |  |
