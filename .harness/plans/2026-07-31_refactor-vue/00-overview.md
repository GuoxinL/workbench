# [2026-07-31] Vue3+TS+Vite 重写工作台

> **本文件是本任务的单一真相源（Single Source of Truth）**：任务元信息、进度、当前步骤、关键决策全部在这里。
> 会话恢复时，先读本文件定位当前步骤，再按需加载对应阶段文件。
>
> ⚠️ 本项目**不维护**全局 `.harness/plan.md`——跨任务查看请列 `.harness/plans/` 目录。
> ⚠️ Meta 中的 `分支` 字段是上下文恢复时定位任务的唯一依据，**必须**与 `git branch --show-current` 的输出完全一致。

<!-- 本文件结构 / 字段定义 / Progress / 时间记录 SOP 规则见
     .harness/plans/_template/00-overview.md；本任务文件精简不重复。
     规则变更只改 _template/。 -->

---

## Meta

| 项 | 值 |
|----|----|
| 分支 | `feature/refactor-vue` |
| Issue / TAPD | 协同开发（design.html 驱动），提交前由用户补 `--story=` |
| 摘要 | 用 Vue3+TS+Vite+Pinia+Router 重写零依赖工作台，对齐 design.html 功能清单（T1-T15/N1-N10/L1-L11/A1-A7/G1-G8/S1-S22/TAG1-TAG5），数据层改用 Markdown 文档库 + manifest |
| 状态 | 🔵 进行中 |
| 创建日期 | 2026-07-31 |
| 负责人 | Guoxin.Liu |
| 预期完成 |  |
| 开发模式 | 协同开发（design.html 驱动） |
| 测试环境 | 独立测试仓库，**严禁**指向生产数据仓 `GuoxinL/workbench-data` |
| 预估代码改动行数 | 大（>10），非小需求模式 |
| 小需求模式 | ⬜ 否 |

---

## Progress

- [x] 01. Clarify    → [01-clarify.md](./01-clarify.md) （跳过：design.html 驱动，已评审）
- [x] 02. Plan       → [02-plan.md](./02-plan.md) （跳过：design.html 驱动，已评审）
- [ ] 03. Implement  → [03-implement.md](./03-implement.md)
- [ ] 04. UT         → [04-ut.md](./04-ut.md)
- [ ] 05. Deploy     → [05-deploy.md](./05-deploy.md)
- [ ] 06. IT         → [06-it.md](./06-it.md)
- [ ] 07. Docs       → [07-docs.md](./07-docs.md)
- [ ] 08. Review     → [08-review.md](./08-review.md)
- [ ] 09. Commit     → [09-commit.md](./09-commit.md)

---

## 当前步骤

> 恢复会话时，优先读取此处指向的阶段文件。

- **步骤**：⏳ 03. Implement（UI 层已基本完成：待办/笔记/图谱/标签云/设置诊断导出/同步胶囊/首次播种；AGENTS 红线已改写；待 VitePress 发布站 TAG5/§3.5 与 PWA manifest）
- **文件**：[03-implement.md](./03-implement.md)
- **上次更新**：2026-07-31 20:47:24

---

## 时间记录

| # | 步骤 | 开始时间 | 结束时间 | 耗时 | 备注 |
|---|------|---------|---------|------|------|
| 01 | Clarify    | 2026-07-31 20:30:38 | 2026-07-31 20:30:38 | 0s | 跳过：design.html 驱动 |
| 02 | Plan       | 2026-07-31 20:30:38 | 2026-07-31 20:30:38 | 0s | 跳过：design.html 驱动 |
| 03 | Implement  | 2026-07-31 20:30:38 |  |  | 进行中：UI 层 |
| 04 | UT         |  |  |  |  |
| 05 | Deploy     |  |  |  |  |
| 06 | IT         |  |  |  |  |
| 07 | Docs       |  |  |  |  |
| 08 | Review     |  |  |  |  |
| 09 | Commit     |  |  |  |  |

---

## 关键决策备忘

> **跨阶段共享的关键上下文**。仅记录影响后续步骤的决策。

- **设计基线**：`.harness/design.html`（已评审，4 项决策确认：清空重来 / 改红线 / 引入 Element Plus / 接受 h4-h6）。
- **数据模型已落地为 Markdown 文档库**：每篇文章 `kb/<slug>.md`（frontmatter + 正文），`manifest.json` 索引导航，逐文件 sha 乐观锁（S10）；本地 `wb.data.v1` 仍缓存快照。已通过单测验证。
- **术语**：知识库文章内部类型 `Note`→`Article`；路由沿用 `notes` 命名（design 用 `/kb/:id`，实现层暂用 `/notes/:id`，待统一）。
- **已完成核心层**：types、stores/data.ts、services/{github,sync}、lib/{slug,markdown,links,html} 及全部纯函数单测（61 passed）、vue-tsc 零错误。
- **未完成**：UI 层（components/ + views/ 三个视图均为占位 stub）、App 顶栏同步胶囊/设置入口、导出、诊断面板、标签云视图、图谱。

---

## 风险速览

| # | 风险 | 严重度 | 缓解 |
|---|------|-------|------|
| 1 | UI 层工作量大（步骤 5-9 全部 pending），单次会话难全量完成 | 🟡 中 | 按视图分片推进，每片以单测 + 类型检查门禁 |
| 2 | 重写遗漏现有行为 | 🔴 高 | design §2 功能清单逐条验收 |
| 3 | 联调误写生产数据仓 | 🔴 高 | 测试仓库隔离，提交前不配置生产 repo |

---

## 文件索引

| 文件 | 产物 |
|------|------|
| [00-overview.md](./00-overview.md) | 任务总览（本文件） |
| [01-clarify.md](./01-clarify.md) | 需求澄清：背景、目标、范围、待确认问题 |
| [02-plan.md](./02-plan.md) | 方案设计：改动文件、调用链、数据模型、IT 用例 |
| [03-implement.md](./03-implement.md) | 实现：关键细节、与 Plan 差异、检查结果 |
| [04-ut.md](./04-ut.md) | 单元测试：用例、覆盖率、未覆盖行 |
| [05-deploy.md](./05-deploy.md) | 部署：环境、结果、回滚方案 |
| [06-it.md](./06-it.md) | 集成测试：req_id、结果、失败定位 |
| [07-docs.md](./07-docs.md) | 文档更新清单 |
| [08-review.md](./08-review.md) | Code Review：问题与修复 |
| [09-commit.md](./09-commit.md) | Commit message 与 amend 流程 |
