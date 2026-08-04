# workbench — AI 协作入口

> **个人工作台**：纯客户端单体（Client-only Monolith）PWA（待办卡片 + 双向链接笔记），基于 **Vue3 + Vite + TypeScript + Pinia** 标准构建流水线；本地双重存储（`localStorage` 即时加载层 + `IndexedDB` 结构化层），并经 GitHub Contents API 双向同步到数据仓库 `kb/<id>.md` + `manifest.json`；GitHub Pages（GitHub Actions 构建发布）托管。维护者：Guoxin.Liu <lgx31@sina.cn>。
>
> 本文件是 AI 协作的**唯一真源入口**（AGENTS.md）。CODEBUDDY.md / CLAUDE.md 均为指向本文件的软链接。
> 具体技术文档维护到 `.harness/docs/`，任务产物维护到 `.harness/plans/<任务目录>/`，本文件只做索引 + 恢复协议 + 项目特定红线。

---

## 一、快速索引

| 想了解什么 | 文档位置 |
|-----------|---------|
| 项目整体架构、模块划分、关键流程 | `.harness/docs/architecture.md` |
| 上下游 / 集成方关系（GitHub API / Cloudflare Worker 代理） | `.harness/docs/relationship.md` |
| 术语表（双向链接 / 脏标记 / 冲突合并等） | `.harness/docs/glossary.md` |
| 历史故障与教训 | `.harness/docs/failures.md` |
| 接口文档总索引 / 编写规范 / 模板 | `.harness/docs/apis/index.md`、`.harness/docs/apis/api-standards.md`、`.harness/docs/apis/_template.md` |
| **单元测试规范（环境 / 生成 / 运行调试，三段式）** | **`.harness/docs/unittest/unittest.md`**（项目专属规则若存在以 `.codebuddy/rules/unittest_*.md` 为权威） |
| **集成测试规范（环境 / 用例 / 运行调试，三段式）** | **`.harness/docs/integration_test/integration_test.md`**（项目专属规则若存在以 `.codebuddy/rules/integration_test_*.md` 为权威） |
| **功能验证手册（每次改动后的自然语言核验流程）** | **`.harness/docs/verification.md`** |
| 本地环境搭建与启动 | `.harness/docs/devops/env.md` |
| 日常开发流程（改码 → 刷新验证 → bump 版本） | `.harness/docs/devops/development.md` |
| GitHub Pages 部署 / Worker 代理部署 | `.harness/docs/devops/deployment.md` |
| 测试环境部署 / 代码同步 | `.harness/docs/devops/test-env-deploy.md` |
| 编码规范（行长 / 复杂度 / 命名 / 安全编码） | `.harness/docs/coding-style.md` |
| 团队人工 Code Review 流程与合入门槛 | `.harness/docs/code-review.md` |
| 日志规范（级别 / 必打场景 / 脱敏） | `.harness/docs/logging.md` |
| AI Code Review 指导规范 | `.harness/review.md` |
| 所有任务清单 | `ls .harness/plans/`（每个任务一个目录，互不干扰） |
| 单个任务的总览 & 进度（**单一真相源**） | `.harness/plans/YYYY-MM-DD_<title>/00-overview.md` |
| 单个任务的分阶段产物 | `.harness/plans/YYYY-MM-DD_<title>/0N-<step>.md` |

---

## 二、SOP（标准开发流程）

> **触发**：用户描述需求 / 说「开始 SOP」「新建任务：<描述>」时自动进入，从 Step 1 Clarify 逐步推进。
> **入口判定**：建立/定位任务目录后，若 `01-clarify.md` 已有有效内容 → 跳过 Clarify 直接进 Plan（需用户确认 + 在 `00-overview.md` 标记跳过）。

### 上下文恢复（每次会话/clear/compact 必做）

> 1. 读 `AGENTS.md` → 2. `git branch --show-current` → 3. 遍历 `.harness/plans/*/00-overview.md` 匹配分支 → 4. 读当前任务 `00-overview.md` → 5. Lazy-load 当前阶段 md → 6. 向用户汇报进展。
> 匹配不到 → 按「SOP 启动前置」处理。

### 任务隔离（强制）

> **严禁** AI 主动读取/参考**其他**任务目录 `.harness/plans/<其他任务>/` 下的任何 md。任务之间物理隔离、互为独立真相源，跨任务参考会污染设计判断。
> **唯一例外**：用户**显式**说「参考任务 X」→ 仅读指定目录，内容只留对话上下文，**禁止**自动写回当前任务产物。

### SOP 启动前置：分支与任务判断

> 1. `git branch --show-current` 获取分支名
> 2. 在 `.harness/plans/` 匹配分支：
>    - **有对应任务** → 按 `00-overview.md` 继续
>    - **无 + 在 master/main** → 全新需求：`git checkout -b feature/<name> origin/master` → `cp -r .harness/plans/_template .harness/plans/YYYY-MM-DD_<title>` → **精简注释**（见下方 ③）→ 填 Meta → 进入入口判定
>    - **无 + 在 feature/ 分支** → 「协同开发检测」
> 3. **复制 _template/ 后必须精简注释**（全新需求 / 协同开发通用，**AI 必执行**）：打开新建的 `plans/<task>/00-overview.md`，把所有 `<!-- TEMPLATE-ONLY-DO-NOT-COPY: -->` 标记的 HTML 注释块**整段删除**（含标记行），替换为单行指针指向 `_template/00-overview.md`；**头部 "⚠️ TEMPLATE ONLY" 段也整段删除**。SOP 规则只在 `_template/` 维护，**禁止**在每个任务文件里重复 ~30 行规则（噪音 + 版本漂移）。详见 `_template/00-overview.md` 顶部说明。
>
> **禁止**在 `master`/`main` 上做 SOP；一个分支只允许对应一个任务目录。

### 协同开发检测（design.html 驱动）

> 触发：当前分支非 master/main 且无对应任务。
> - `.harness/design.html` 存在且用户确认使用 → 创建任务目录（同样按上方 ③ 精简 _template/ 注释）→ 从 design.html 完整派生 `01-clarify.md` + `02-plan.md`（禁止只写「详见 design.html」）→ 填 Meta（`开发模式`=协同、`测试环境`）→ 自检后删除 design.html → 从 Step 3 开始
> - design.html 不存在 → 标准流程

### 9 步骤定义

| # | 步骤 | 产物 | 说明 |
|---|------|------|------|
| 1 | **Clarify** | `01-clarify.md` | `skill: clarify` 澄清需求，产出背景/目标/待确认问题 |
| 2 | **Plan** | `02-plan.md` | 改动文件、调用链、**§6 UT 用例（TDD 必填）**、IT 用例、风险 |
| 3 | **Implement** | `03-implement.md` | 按 Plan §6 红绿循环：先写 UT 跑红 → 最小实现转绿 → 重构 |
| 4 | **UT** | `04-ut.md` | 用例与 Plan §6 逐条对齐、覆盖率、未覆盖行 |
| 5 | **Deploy** | `05-deploy.md` | 通过团队环境管理 Skill 热更代码到测试环境 |
| 6 | **IT** | `06-it.md` | 每条用例贴关键日志（含 reqid）；协同模式不跳过 |
| 7 | **Docs** | `07-docs.md` | 增量更新 `.harness/docs/` |
| 8 | **Review** | `08-review.md` | 代码审查结果 |
| 9 | **Commit** | `09-commit.md` | ① 释放环境 → ② 写 commit message → ③ 更新 overview（边界点 A）→ ④ 一次性 `git add` → ⑤ `git commit`（首次仅一次）→ ⑥ `git push` 产生 MR → ⑦（可反复直到 MR 合入）amend 累积修复（一个 MR 一个 commit 原则） |

### 任务规模分支

> **触发条件**：02 Plan 阶段估算 `预估代码改动行数 ≤ 10` 时，在 `00-overview.md` Meta 把 `小需求模式` 设为 ✅。进入 03 起按下方规则执行。

| # | 步骤 | 标准模式 | 小需求模式 |
|---|------|----------|------------|
| 1 | Clarify  | 确认 | **确认** |
| 2 | Plan     | 确认 | **确认** |
| 3 | Implement | 确认 | **自动**（与 04 合并跑，结束一次性汇报） |
| 4 | UT       | 确认 | **自动**（与 03 合并跑，结束一次性汇报） |
| 5 | Deploy   | 确认 | **确认**（环境敏感，必须显式确认） |
| 6 | IT       | 确认 | **确认**（涉及真实链路 / reqid 核验，不允许跳过确认） |
| 7 | Docs     | 确认 | **自动** |
| 8 | Review   | 确认 | **自动** |
| 9 | Commit   | 确认 | **自动**（环境释放仍按 `09-commit.md` 0 节执行） |

> "自动" ≠ 跳过产物：03-04 / 07-09 的 md 产物、`00-overview.md` 时间记录、Progress 勾选**仍然必须**按正常流程写完。"自动"仅指把该步骤的开始/结束两次确认合并为一次——AI 一次说完"我准备做 X-Y-Z"后开始跑，跑完一次性汇报"03-04 已完成（结论摘要）"，**中间不再打断用户**。
>
> **05 Deploy / 06 IT 仍必须显式确认**：Deploy 涉及环境副作用，IT 涉及真实链路核验，是 SOP 中两个最易出错的环节，不纳入自动批次。
>
> **批次时间记录**：`00-overview.md` 时间记录表对 03-04 / 07-09 这两批的每一行写**同一**开始时间和**同一**结束时间（批次起止那一刻），耗时也是同一值；备注列写「小需求模式批次：03-04」或「小需求模式批次：07-09」便于聚合归并。详见 `00-overview.md` 时间记录节规则 9。
>
> **回退机制**：若进入 03 后发现实际改动 > 10 行（漏估），AI 应在汇报 03-04 结论时同步把 `小需求模式` 改回 ⬜，从 05 起按标准模式跑（05/06 仍确认，07-09 在新的判断下决定是否走自动）。已按批次写入的时间记录**不回填**——批次记录能正确反映实际工作窗口，跨任务统计靠「小需求模式批次」前缀识别即可。

### 步骤执行规则

> 每步遵循**五段式**：开始确认 → 记录开始时间 → 执行 → 记录结束时间 → 结束确认。
>
> - **开始确认**：必须得到用户明确同意
> - **时间记录**：开始/结束时间用 `date "+%Y-%m-%d %H:%M:%S"` 精确到秒写入 `00-overview.md`；禁止事后回填
> - **结束确认**：展示「✅ 步骤完成 + 核心结论 + 耗时 + 下一步概览」→ 等用户回复同意/暂停/调整
> - **禁止**未经确认自动跳步；**禁止**合并开始/结束为单次提问
> - **小需求模式例外**：03-04、07-09 的开始/结束确认可合并为单次提问（"我准备做 03-04，做完一次性汇报"），但产物文件 + 时间记录 + Progress 勾选**不豁免**

### Commit 规范

> 本节是 **SOP 入口**——`09-commit.md` 给出**清单 + 填表**。

**顺序**：① 释放环境（团队环境管理 Skill）→ ② 写 `09-commit.md` commit message → ③ 更新 `00-overview.md`（触发**边界点 A**）→ ④ 一次性 `git add`（代码 + plans 产物 + 00-overview.md + docs）→ ⑤ `git commit`（首次仅一次）→ ⑥ `git push` 产生 MR → ⑦（可反复，直到 MR 合入）代码修复 amend → 合入后触发**边界点 B**。

> **新增：禁止在边界点 A / B 之后修改 `00-overview.md` / `09-commit.md`**——步骤 ②+③ 完成即触发边界点 A（commit 内容定稿）；MR 合入即触发边界点 B（任务收尾）。两者之间**唯一例外**是步骤 ⑦ 代码修复走 amend——**仅改代码本身，不碰 md**；可反复不限次数，始终只有一个 commit；一旦合入就彻底冻结。完整规则见 `09-commit.md`「1. 执行顺序」节。

**格式**：`<type>(<scope>): <subject>`（Conventional Commits，强制）。

**一个 MR 一个 commit（铁律）**：本任务所在 MR 只能有一个 commit。任何修正（push 前 / SOP 走完后的 follow-up / push 元信息补登）一律走 `git commit --amend` 累积到原 commit，**严禁**新增第二个 commit。amend 后 push 必须用 `git push --force-with-lease`（**禁止**裸 `--force`）。详见 `09-commit.md`「2. amend 流程」节。

---

## 三、开发准则

### 技术栈与验证方式（Vite 构建 + CI 校验）

> 2026-07-31 重构后，项目已从「零依赖手写」转为「Vue3 + Vite + TypeScript + Pinia」标准构建流水线（见 `.harness/design.html`）。原「零构建 / 禁止框架 / bump-version.sh」约束已作废（见第四节红线 2/3）。

- **Vite + Vue3 + TypeScript + Pinia + Vue Router**，依赖经 `package.json` 管理；本地开发 `npm run dev`，构建 `npm run build`（含 `vue-tsc --noEmit` 类型检查）。
- 验证 = 构建通过 + 类型检查零错误 + `npm test`（Vitest）全绿；浏览器验证：`npm run dev` 后访问 `http://localhost:5173`（Vite dev server 默认端口，如需代理可另行配置）。
- 缓存由 Vite 产物内容哈希保证（`app.<hash>.js`），**无需**手工 bump 版本脚本；`bump-version.sh` 已移除。
- 提交前确保 `npm run build` 与 `npm test` 均通过；CI（GitHub Actions）会再次执行类型检查 + 测试 + 构建。

### 模块分层（改代码前先认清入口）

- `src/stores/data.ts`：**唯一**数据层。localStorage 键 `wb.data.v1` / `wb.cfg.v1` / `wb.manifestSha.v1` 只允许经它读写；变更即写盘并驱动同步引擎。
- `src/services/github/*` + `src/services/sync/*`：**唯一**远端同步通道（GitHub Contents API ↔ `workbench-data` 仓库的 Markdown 文档库 `kb/*.md` + `manifest.json`，含脏标记、冲突合并、五步同步诊断）。新增持久化字段必须同步考虑双向合并逻辑。
- `src/views/*` 视图、`src/components/*` 组件、`src/lib/*` 纯函数库（markdown / 双链 / slug）、`src/composables/*` 组合式。
- `proxy/cloudflare-worker.js`：GitHub API **白名单透传**代理（用户自部署），令牌只经用户自己的 Worker。

### Git 钩子（本地强制）

`scripts/` 下三个通用检查脚本，通过软链安装：

```bash
ln -sf ../../scripts/pre_commit_check.sh .git/hooks/pre-commit
ln -sf ../../scripts/commit_msg_check.sh .git/hooks/commit-msg
ln -sf ../../scripts/pre_push_check.sh   .git/hooks/pre-push
```

### 安全基线

1. **GitHub Token 只存 localStorage 配置（`wb.cfg.v1`）**，绝不写入 `data/workbench.json`、不 `console.log`、不硬编码进源码 / git。
2. 用户内容（笔记 / 待办）渲染前必须经 `util.js` 的 `esc()` 转义（`markdown.js` 已遵循），禁止把未转义内容拼进 `innerHTML`。
3. Worker 代理只做 GitHub API 白名单透传，新增转发路径必须走白名单，禁止开放任意 URL 中转。

---

## 四、禁止红线

| # | 红线 | 后果 |
|---|------|------|
| 1 | **严禁 AI 主动读取/参考其它 `.harness/plans/<其他任务目录>/` 下的 md 产物**（含 `00-overview.md`、`01-clarify.md` … `09-commit.md`、`.harness/design.html` 等）；仅当用户**显式**指定「参考任务 X」时才可读指定的那一个任务目录，且参考内容禁止自动写回当前任务。详见上文「任务隔离（强制）」章节。 | 任务单一真相源被污染；跨任务上下文干扰当前任务设计；与并发开发冲突 |
| 2 | ~~（已移除）原「严禁引入构建工具 / 前端框架 / npm 依赖」~~ —— 2026-07-31 重构评审已批准引入 Vite + Vue3 + Pinia 等构建工具与框架（见 `.harness/design.html` §9 决策 3）。项目现采用标准构建流水线，不再要求"零构建直出"。 | 重构后该约束作废 |
| 3 | ~~（已移除）原「改动 js/css 后未跑 `./bump-version.sh` 就提交发版」~~ —— Vite 产物自带内容哈希（`app.<hash>.js`），缓存失效由构建机制保证，无需手工 bump 脚本（见 design §4.3）。`bump-version.sh` 已从仓库移除。 | 重构后该约束作废 |
| 4 | **绕过 `src/stores/data.ts` 直接读写 `wb.*` localStorage 键，或绕过 `src/services/github/*` / `src/services/sync/*` 直接调 GitHub Contents API** | 脏标记 / 冲突合并 / 事件广播被绕开，引发同步竞态与数据丢失 |
| 5 | **令牌以任何形式落库（`data/workbench.json` / `wb.cfg.v1` 以外的任何位置）、落日志或写入源码** | 数据仓库/代码仓库可能公开，Token 泄漏等于交出 GitHub 账户写权限 |
