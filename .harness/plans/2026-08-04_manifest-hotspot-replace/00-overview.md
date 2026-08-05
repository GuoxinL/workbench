# [2026-08-04] 中央 manifest.json 热点替代：改用每文件 blob sha + 目录树索引

> **本文件是本任务的单一真相源（Single Source of Truth）**：任务元信息、进度、当前步骤、关键决策全部在这里。
> 会话恢复时，先读本文件定位当前步骤，再按需加载对应阶段文件。
>
> ⚠️ 本项目**不维护**全局 `.harness/plan.md`——跨任务查看请列 `.harness/plans/` 目录。
> ⚠️ Meta 中的 `分支` 字段是上下文恢复时定位任务的唯一依据，**必须**与 `git branch --show-current` 的输出完全一致。

---

## Meta

| 项 | 值 |
|----|----|
| 分支 | `feature/manifest-hotspot-replace` |
| Issue / 关联单 | （无） |
| 摘要 | 用 Git 目录树（每文件 blob sha）替代中央 `manifest.json` 作索引，消除单文件写入热点，把同步冲突面从「任意两设备重叠即冲突」降到「仅同文件并发编辑才冲突」 |
| 状态 | 🔵 进行中 |
| 创建日期 | 2026-08-04 |
| 负责人 | Guoxin.Liu |
| 预期完成 | （Plan 阶段评估） |
| 开发模式 | 独立开发 |
| 测试环境 | （无，本地 + CI） |
| 预估代码改动行数 | （Plan 阶段填入；不含测试/文档，预计 > 10 行，非小需求模式） |
| 小需求模式 | ⬜ 否 |

---

## Progress

<!-- 本文件结构 / 字段定义 / Progress / 时间记录 SOP 规则见
     .harness/plans/_template/00-overview.md；本任务文件精简不重复。
     规则变更只改 _template/，本任务文件由 init_harness.sh 后续刷新
     不影响旧任务。 -->

- [x] 01. Clarify    → [01-clarify.md](./01-clarify.md) （需求由用户预置，已收敛）
- [x] 02. Plan       → [02-plan.md](./02-plan.md)
- [x] 03. Implement  → [03-implement.md](./03-implement.md)
- [x] 04. UT         → [04-ut.md](./04-ut.md)
- [x] 05. Deploy     → [05-deploy.md](./05-deploy.md)
- [x] 06. IT         → [06-it.md](./06-it.md) （线上实测：索引/拉取/墓碑删除全链路通过；发现并修复首轮 sha 冲突裸错 Bug #10）
- [ ] 07. Docs       → [07-docs.md](./07-docs.md)
- [ ] 08. Review     → [08-review.md](./08-review.md)
- [~] 09. Commit     → [09-commit.md](./09-commit.md) （随 05 推 main 合并执行；硬化修复已再推）

---

## 当前步骤

> 恢复会话时，优先读取此处指向的阶段文件。

- **步骤**：⏳ 05. Deploy 已确认并推进中（用户选「部署并线上验证」）→ 06. IT 随部署执行
- **文件**：[05-deploy.md](./05-deploy.md) / [06-it.md](./06-it.md) / [09-commit.md](./09-commit.md)
- **上次更新**：2026-08-05 08:06:25

---

## 时间记录

<!-- 时间记录 SOP 规则见 .harness/plans/_template/00-overview.md；本任务文件精简不重复。 -->

| # | 步骤 | 开始时间 | 结束时间 | 耗时 | 备注 |
|---|------|---------|---------|------|------|
| 01 | Clarify    | 2026-08-04 22:06:07 | 2026-08-04 22:06:07 | 0s | 跳过：用户预置（需求已在对话中明确） |
| 02 | Plan       | 2026-08-04 22:06:07 | 2026-08-04 22:08:35 | 2m28s | 完成，设计决策已写入 02-plan.md §十 |
| 03 | Implement  | 2026-08-04 23:19:11 | 2026-08-04 23:44:23 | 25m12s | 完成；与 04 同批产出（见 03/04 md） |
| 04 | UT         | 2026-08-04 23:19:11 | 2026-08-04 23:44:23 | 25m12s | 完成；201 用例全绿，build 类型零错误 |
| 05 | Deploy     | 2026-08-05 08:06:25 | 2026-08-05 08:06:25 | 0s | 与 09 合并：commit → 推 main → Actions 发布（本会话执行） |
| 06 | IT         | 2026-08-05 08:06:25 |  |  | A 类无令牌线上烟测随部署后执行；B 类带令牌真实链路待用户 PAT |
| 07 | Docs       |  |  |  | 待 05/06 收尾后增量更新 .harness/docs |
| 08 | Review     |  |  |  | 待 07 后执行 |
| 09 | Commit     | 2026-08-05 08:06:25 | 2026-08-05 08:06:25 | 0s | 单 commit 推 main（见 09-commit.md） |

---

## 关键决策备忘

> **跨阶段共享的关键上下文**。仅记录影响后续步骤的决策，避免恢复时还要翻阅历史阶段文件。

- **索引源选型**：用 `GET /repos/{o}/{r}/contents/kb`（目录列表，每个条目带 `sha`，不含正文）作轻量索引，**复用现有 Contents API 路径 → Worker 代理白名单无需改动**。放弃 `git/trees` 端点（需改代理白名单）。
- **删除中央 `manifest.json` 写入**：同步不再写 `manifest.json`，彻底消除单文件写入热点。旧仓库残留 `manifest.json` 作为孤儿文件无害；按用户决策「直接重推自愈」，不读它播种，首轮按 LWW 全量重推。
- **本地基线缓存**：用 `wb.syncState.v1`（path→sha 映射，仅经 `src/stores/data.ts` 读写，守红线 4）替代 `wb.manifestSha.v1` 的单值。
- **sha 判定规则**：local/remote 的 git-blob SHA-1 相等即视为「无变化、不更新」；否则按 三态判定（仅本地改/仅远端改/双方改）决定 push / pull / LWW 合并。
- **状态指示器样式（已确认）**：PC 端用 ① 药丸（点+字+长说明），App 端用 ③ 纯点（无文字）；`SyncPhase` 新增 `uptodate` 静默态，`syncing` 蓝点脉冲、`error` 红点+重试按钮。详见 `02-plan.md` §十。

---

## 风险速览

| # | 风险 | 严重度 | 缓解 |
|---|------|-------|------|
| 1 | 旧仓库 `wb.manifestSha.v1` 无法推导每文件基线 → 首次同步全量重推 | 低 | 过渡期读一次远端 `manifest.json` 播种基线；否则首轮按 LWW 自愈 |
| 2 | `serializeFrontmatter` 非字节稳定 → 同内容两次序列化 sha 不同，误判为变更 | 中 | 保证序列化确定性；基线存「上次成功 PUT 后的远端 sha」，与本地重序列化结果一致即可 |
| 3 | 目录列表随 `images/` 增长变大 | 低 | 索引只列 `kb/`、`todos/`，图片走内容寻址不进索引 |
| 4 | 本地删除需传播到远端 | 中 | 本地保留「已删除 id」墓碑集合，同步时发 DELETE（带远端 sha 锁） |

---

## 文件索引

| 文件 | 产物 |
|------|------|
| [00-overview.md](./00-overview.md) | 任务总览（本文件） |
| [01-clarify.md](./01-clarify.md) | 需求澄清：背景、目标、范围、待确认问题 |
| [02-plan.md](./02-plan.md) | 方案设计：数据流、sha 生成/存储、目录树、同步前判定、改动文件 |
| [03-implement.md](./03-implement.md) | 实现：关键细节、与 Plan 差异、检查结果 |
| [04-ut.md](./04-ut.md) | 单元测试：用例、覆盖率、未覆盖行 |
| [05-deploy.md](./05-deploy.md) | 部署：环境、结果、回滚方案 |
| [06-it.md](./06-it.md) | 集成测试：req_id、结果、失败定位 |
| [07-docs.md](./07-docs.md) | 文档更新清单 |
| [08-review.md](./08-review.md) | Code Review：问题与修复 |
| [09-commit.md](./09-commit.md) | Commit message 与 amend 流程 |
