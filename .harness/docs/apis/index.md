# 接口文档总索引

> 维护者：Guoxin.Liu <lgx31@sina.cn> | 最后更新：2026-08-04
> Last-verified: 2026-08-04

---

## 本项目的"对外接口"是什么

本项目是**纯客户端单体（Client-only Monolith）PWA**（详见 [architecture.md](../architecture.md)），**不提供任何业务 API**。本目录记录的是唯一对外暴露 HTTP 端点的组件：

**`proxy/cloudflare-worker.js`** —— 一个**可选、由使用者自部署**到自己 Cloudflare 账号的 GitHub Contents API 白名单透传代理。仅在使用者网络访问不了 `api.github.com` 时启用，把地址填进「设置 → API 代理地址」（配置项 `cfg.apiBase`）后，GitHub 同步相关请求改走它。

因此本目录的文档具有**双重视角**：

- **服务端视角**：代理放行哪些路径、CORS 如何裁决、返回哪些自有错误码；
- **调用方视角**：`src/services/github/*`（GitHub Contents API 封装层）实际怎么调、消费响应的哪些字段、错误怎么落到 UI 与同步引擎。

> 代理**不改写业务语义**，只做路径/来源双白名单 + 请求头裁剪 + CORS 头覆盖，业务语义与 GitHub 官方 API 一致。本目录**只记录本项目实际用到的部分**，不复述 GitHub 官方文档。
>
> **未配置代理时**（`cfg.apiBase` 留空，默认状态），前端直连 `https://api.github.com`，本目录除 CORS/白名单相关的错误码外仍然适用。

---

## 命名约定

- 路径：`docs/apis/<module>/<ActionName>.md`
- 文件名 = 接口名（PascalCase，形如 `<动词><资源>`）
- 每篇至少包含：描述、入参、出参、错误码、示例、变更记录
- 每篇头部必须有 `Source:` 与 `Last-verified:` 脚注

---

## 模块清单

| 模块 | 路径 | 接口数 | 说明 |
|------|------|-------|------|
| proxy | `apis/proxy/` | 6 | Cloudflare Worker 代理对外暴露的全部端点，与 `ALLOW` 白名单 1:1 对应 |

---

## 接口清单

| 接口 | 模块 | 方法 / 路径 | 一句话 | 文档 |
|------|------|------------|--------|------|
| Preflight | proxy | `OPTIONS /*` | CORS 预检，恒返回 204；**不校验来源**，拒绝发生在真实请求上 | [proxy/Preflight.md](proxy/Preflight.md) |
| GetApiRoot | proxy | `GET /` | 不带令牌的连通性探测（白名单保留；当前诊断改用 GetRepo 端点探测，见 GetApiRoot 说明） | [proxy/GetApiRoot.md](proxy/GetApiRoot.md) |
| GetRateLimit | proxy | `GET /rate_limit` | 最轻量的令牌有效性探针，诊断第 3 步「令牌有效性」 | [proxy/GetRateLimit.md](proxy/GetRateLimit.md) |
| GetRepo | proxy | `GET /repos/{owner}/{repo}` | 仓库元信息 + **写权限前置校验** `permissions.push`，诊断第 2/4 步 | [proxy/GetRepo.md](proxy/GetRepo.md) |
| GetContents | proxy | `GET /repos/{owner}/{repo}/contents/{path}` | 按路径拉取文件（`kb/<id>.md` / `manifest.json` / `todos/<id>.json` / `images/<sha>.<ext>`），取 base64 内容与乐观锁 `sha`；404 属正常分支 | [proxy/GetContents.md](proxy/GetContents.md) |
| PutContents | proxy | `PUT /repos/{owner}/{repo}/contents/{path}` | 全量覆写单文件，`sha` 做 CAS，409/422 冲突由同步引擎退避重试 | [proxy/PutContents.md](proxy/PutContents.md) |

**白名单一致性**：上表 6 条覆盖 `proxy/cloudflare-worker.js:20-25` 的全部 4 条 `ALLOW` 正则（`/rate_limit`、`/repos/:owner/:repo`、`/repos/:owner/:repo/contents/**`、`/`）+ 独立的 OPTIONS 预检分支；`contents` 因读写语义差异拆为两篇。**新增转发路径必须先加进 `ALLOW` 再补文档**（AGENTS.md 安全基线 3）。

---

## 相关文档

- 协议约定（CORS / 白名单 / 认证 / 错误语义）：[api-standards.md](api-standards.md)
- 新增接口文档模板：[_template.md](_template.md)
- 系统架构与调用链：[../architecture.md](../architecture.md)（GitHub Contents API 同步）
- 上下游关系：[../relationship.md](../relationship.md)
