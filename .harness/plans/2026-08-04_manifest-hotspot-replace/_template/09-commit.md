# 09. Commit

> **目的**：提交代码 + 推送远端 + 创建 MR。
> **前置条件**（详见团队环境管理 Skill）：① 本任务专用环境已释放。
> **全程不记录 git 系统可查的元数据**——commit ID / push 时间 / MR 链接 / amend 次数 都在 GitLab / `git log` 里能查，本文件**不重复**。
> **全流程 3 阶段**：Phase 0 前置收尾（0.1 环境释放）→ Phase 1 准备 commit 内容（§1 步骤 1-2，完成后**边界点 A** 锁定）→ Phase 2 执行 commit + push（§1 步骤 3-5，仅一次）→ Phase 3 可选 amend（§1 步骤 6，仅改代码，可反复直到 MR 合入，**边界点 B** 最终锁定）。

---

## 0. 前置条件

### 0.1 环境释放

| 项 | 值 |
|----|----|
| 环境名 / 环境 ID |  |
| 释放命令 | `<环境管理 CLI> release -e <env>` |
| 释放时间 | YYYY-MM-DD HH:MM:SS |
| 结果 | ⬜ 成功 / ❌ 失败（原文 + 用户是否同意带病 commit）/ N/A（未创建环境）+ 原因 |

| # | 动作 | 入口 | 结果记录 |
|---|------|------|---------|
| 1 | 释放本任务专用环境 | 团队环境管理 Skill | 填实上面「0.1 环境释放」表 |

---

## 1. 执行顺序

> **两个边界点（铁律）**：
> - **边界点 A — 内容锁定**：步骤 1+2（写 commit message + 更新 `00-overview.md`）**都完成**之后，**禁止**再改 `00-overview.md` 和 `09-commit.md`——commit 的内容已经定稿。
> - **边界点 B — MR 锁定**：MR 合入（或用户明确宣布任务收尾）后，**禁止**再有任何改动。
> - **唯一例外**：边界点 A 与 B 之间，若需要「代码修复」（步骤 6），走 amend——**仅改代码本身**，**不**改 `00-overview.md` / `09-commit.md` / 任何 plans 产物；amend 可反复，**始终只有一个 commit**。

| # | 动作 | 结果 |
|---|------|------|
| 1 | 写 commit message | 落「2. 本次实际 Commit」节 |
| 2 | **更新 `00-overview.md`** | 时间记录 09 行**结束时间**（= "所有 prep 写完" 时刻）+ 耗时；关键决策备忘追加 `Commit: <subject>` + 关键变更点；Meta 状态 ✅；Progress 勾选 09（**不**写 commit ID）——步骤 1+2 完成 = **边界点 A** |
| 3 | 一次性 `git add` | 代码 + `plans/<task>/*.md`（含刚更新的 00-overview.md 和 09-commit.md）+ `.harness/docs/**` 增量（**禁止**只 add 代码） |
| 4 | `git commit`（**首次仅一次**） | 用「2. 本次实际 Commit」节的 message |
| 5 | `git push` + 创建 MR | 推远端产生 MR 后，若 CI 通过且无需修复，进 **边界点 B** |
| 6 | **(可选，可反复) 代码修复** | CI 失败 / review 意见 / follow-up 修复：改代码 → amend（§2）→ force-push；**仅改代码，不碰 md 文件**；可反复直到 MR 合入 |

> 一个 MR 一个 commit（任何修正走步骤 6 amend，**禁止**新增第二个 commit）；amend 后 push 用 `--force-with-lease`（**禁止**裸 `--force`）。详见 `SKILL.md` 红线 4。

---

## 2. amend 流程（步骤 6 = 代码修复，可反复）

> **amend 只改代码本身**——`00-overview.md` / `09-commit.md` / 任何 plans 产物**冻结到底**，不通过 amend 改写。git 系统已经是这些信息的唯一来源（MR 链接 / commit hash 都在 GitLab / `git log` 里能查）。

```bash
git add -A                              # 仅 add 改动的代码
git commit --amend --no-edit           # 沿用原 commit message
git push --force-with-lease            # ✅ 必用；禁止裸 --force
```

> **可反复执行**——只要还没到边界点 B（MR 合入），每次修复都走同一套 amend 流程，**不限次数**，但**始终只有一个 commit**，且**只动代码不动 md**。
> **MR 合入（或用户明确宣布任务收尾）后立即进入「边界点 B — MR 锁定」**——不再 amend，再有任何改动需另开新任务 / 新 MR。

---

## 3. 本次实际 Commit（commit 前必须填实）

```
<type>(<scope>): <subject>

<body>
```

> ✅ 本节定稿即触发**边界点 A**——**禁止**再动本节（包括 amend）。

---

## 完成标志

> **本清单只含"边界点 A 之前"可勾选的项**——本文件和 `00-overview.md` 一起随 §1 步骤 3 `git add` 进 commit，**add 之后本文件即冻结**。边界点 A 之后的动作（add / commit / push / amend / CI / 合入）**不在本文件打勾**——执行时向用户口头汇报即可，需要查时去 GitLab / `git log` 查。

- [ ] 「0.1 环境释放」表已填实（成功 / 失败原文 / 跳过原因）
- [ ] 「3. 本次实际 Commit」commit message 已落定
- [ ] **`00-overview.md` 已更新完**（**边界点 A** 触发——09 行结束时间 + 耗时 + 关键决策备忘 commit info；**无** commit ID；Meta ✅；Progress 09 勾选）

> **边界点 A 之后**（执行动作，不写回本文件，向用户口头确认）：一次性 `git add` → `git commit`（首次，仅一次）→ `git push` 产生 MR →（可反复）CI 失败 / review 意见 → 改代码 → amend + force-push（**只改代码，不碰 md**）→ MR 合入 触发**边界点 B**，向用户报告。
