# 07. 文档更新（Docs）

> 阶段目标：把「中央 `manifest.json` 索引」改为「`kb/` + `todos/` 目录树每文件 blob sha 现拉 + `wb.syncState.v1`（path→sha）本地基线」的新架构，同步到所有权威文档，消除与代码脱节的描述。
> 关联代码变更：`3c96921`（去中央 manifest）、`80e1b40`（sha 冲突自愈加固）。
> 时间：2026-08-05（与 08 Review 同批，结束一次性汇报）

---

## 一、本次更新的核心事实（文档统一口径）

1. **`manifest.json` 不再被同步链路写入**：`pushRemote` 只 `PUT`/`DELETE` 真正变化的 `kb/<id>.md` / `todos/<id>.json`，不写中央索引。
2. **索引改为现拉目录树**：`github/listDir.ts` 的 `fetchIndex()` 取 `kb/` + `todos/` 每文件 blob sha 作索引，替代旧 `fetchManifest` GET 中央 `manifest.json`。
3. **本地基线**：`wb.syncState.v1`（`path→sha`）替代旧单值 `wb.manifestSha.v1`，仅经 `src/stores/data.ts` 读写。
4. **判定逻辑**：`sync/diff.ts` 的 `planSync` 三态（sha 相等 / 本地新 / 远端新）替代旧 `manifest.planDiff`（按 updatedAt）。
5. **乐观锁**：`treeShaByPath`（刚拉到的目录树 sha）替代"manifest.sha"；冲突（409/ConflictError）→ 用刚拉到的目录树 sha 重拉合并重试（≤ MAX_RETRY）。
6. **`manifest.ts` 现状**：仅保留 `@deprecated` 的 `getManifest`（只读遗留仓库旧 manifest）+ `planDiff`（仅兼容旧测试）；新同步路径完全不依赖它。
7. **PWA web manifest 与数据索引 manifest.json 是不同东西**：文档里"添加到主屏幕图标/名称来自 manifest.json"等指 PWA web manifest，**保持不变**。

---

## 二、更新的文件清单

| 文件 | 主要改动 |
|------|---------|
| `AGENTS.md` | 概述段去除 `manifest.json`，改为目录树每文件 blob sha 索引；模块分层 `wb.manifestSha.v1` → `wb.syncState.v1(path→sha)` |
| `.harness/docs/architecture.md` | 持久化表、LS/DataRepo 两个 mermaid 节点、外部系统表、§4 `Manifest` 定义（标注遗留）、§5 数据流场景 + 时序图（fetchIndex/目录树 sha/syncState）、§6.1 HTTP 调用表（fetchIndex/pushRemote 不再写 manifest）、§8 DataRepo 节点、§10 决策 #2、旧架构差异说明 |
| `.harness/docs/relationship.md` | §一 被调方表（①列目录树替代 manifest GET；新增 PUT/DELETE 行）、数据仓库内容物、localStorage 键、传输数据、调用拓扑（pull/冲突重试）、诊断第 5 步（标注遗留兼容）、mermaid LS/DataRepo 节点、故障 F10/F11（改为 kb/todos 损坏 / 目录树为空） |
| `.harness/docs/glossary.md` | `wb.*` 键族、`Manifest`/目录树 blob sha 索引术语、弃用表新增中央 manifest.json 行 |
| `.harness/docs/coding-style.md` | localStorage 键、`§2.4` 注释举例、§3 数据载体（todos/ + 目录树 sha）、§7.1 令牌不入载荷（扩展到全部远端文件） |
| `.harness/docs/apis/api-standards.md` | 模块清单（补 listDir/blobSha/diff，标注 manifest.ts 废弃）、§7 删除 `manifest.putManifest` 行改为废弃说明、`wb.syncState.v1`、墓碑/合并/乐观锁语义、§8 诊断（标注遗留兼容） |
| `.harness/docs/apis/index.md` | GetContents 描述补「列目录」、去 manifest.json |
| `.harness/docs/apis/proxy/GetContents.md` | 新增列目录职责段、404 语义、变更记录 |
| `.harness/docs/apis/proxy/PutContents.md` | 改为「只 PUT 变化的 kb/todos，不写 manifest.json」+ treeShaByPath 乐观锁、commit message 按源码校正、变更记录 |
| `.harness/docs/devops/env.md` | 序列化落点、其它 localStorage 键（wb.syncState.v1） |
| `.harness/docs/devops/deployment.md` | 环境矩阵、仓库表、敏感配置、回滚、容量说明、禁止项（去 manifest.json） |
| `.harness/docs/devops/test-env-deploy.md` | 数据仓库落点、远端禁编辑条目（kb/todos） |
| `.harness/docs/logging.md` | §3.2 少见分支、§4.2 载荷、§5.1 键与诊断面板、§6 排查、§8 清单 |
| `.harness/docs/code-review.md` | 红线 5 检查点 Token 落库清单去掉 manifest.json、改列 kb/todos/images |
| `.harness/docs/unittest/unittest.md` | IT 边界描述数据仓库改为 kb/ + todos/ |
| `.harness/docs/integration_test/integration_test.md` | **重点**：全文"manifest.json 会被写入"的断言逐条纠正——首次同步断言"不出现 manifest.json"、数据落点改 todos/、wb.syncState.v1、墓碑经 kb/todos 而非 manifest、远端写坏改为 kb/todos、重置脚本改为清空 kb/+todos/ 并清理遗留 manifest、Source/Last-verified 更新 |

---

## 三、刻意未改的文件（任务隔离 / 历史快照）

- `.harness/docs/failures.md`、`data-layer-design.html`：记录的是 2026-07-30 / 07-31 旧架构时期的故障与设计，**作为历史快照保留**，不回改。
- 其他任务目录 `.harness/plans/2026-08-04_recursive-test-fix/`、`.harness/design-shell.html`：**任务隔离**，未触碰。
- `src/` 代码：本次仅文档更新，不改码（代码改动已在 03-05 阶段完成并随 05 部署推送）。

---

## 四、一致性自检

- 全仓 grep `wb.manifestSha.v1`：仅剩显式标注"已废弃/替代"的语境，无"仍在使用的陈述"。
- 全仓 grep `manifest.json`：剩余均为 (a) 标注遗留兼容 (b) PWA web manifest (c) "不再写/无中央 manifest" 陈述 (d) 历史快照文档。
- `blobSha.ts` / `listDir.ts` 等在文档中出现的新模块名均经 `Glob` 核实真实存在。
