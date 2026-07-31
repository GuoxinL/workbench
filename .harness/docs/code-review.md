# 代码 Review 规范

> 状态：正式 | 维护者：Guoxin.Liu <lgx31@sina.cn> | 最后更新：2026-07-31

## 范围

所有合入 `main` 的改动必须经过本规范的 Review 流程，AI 生成代码同样适用。

**单人项目的 Review 现实**：本项目单人维护，没有第二名人工 Reviewer。Review 模式为 **「提交方自查清单 + AI Review」**：

1. 提交方（本人）按 §2 自查清单逐项核对；
2. 用 AI 按 [.harness/review.md](../review.md) 的检查清单做一轮代码审查（SOP Step 8，产物写入 `08-review.md`）;
3. Git 钩子门禁（§4）作为机器强制兜底。

不虚构多人评审环节；本文档聚焦流程与门禁，AI 检查项清单见 [.harness/review.md](../review.md)，两者互补不重复。

## 1. 提交方约束

- ❌ 直接推 `main`（必须走 `feature/<name>` 分支 + MR/PR）
- ❌ 一个 MR 出现多个 commit（铁律：修正一律 `git commit --amend` + `git push --force-with-lease`，见 AGENTS.md Commit 规范）
- ❌ commit message 缺少 TAPD 脚注 `--<kind>=<id>`（commit-msg 钩子强制，见 §4.2）
- ❌ AI 代码未经理解就提交（提交者必须能回答："这段代码做了什么？为什么这样写？"）
- ❌ 改动 js/css 后未跑 `./bump-version.sh` 就提交（红线 3，浏览器缓存事故有前科，见 [failures.md](failures.md)）
- ❌ 引入 npm 依赖 / 构建工具 / 前端框架（红线 2，破坏零构建部署模型）
- ❌ 提交 `.env` / `*.key` / `*.pem` / `credentials` / `token.json` 等敏感文件（pre-commit 钩子强制拦截）
- ✅ MR 描述包含：背景、改动点、影响面、验证方式、回滚方案

## 2. 提交方自查清单（提交前逐项过）

本项目**无构建步骤（零构建，改完刷新即可）**、无 lint 工具、无测试框架，故无 `make build` / `make lint` / `make ut`。以下为真实可执行的替代校验（均已实跑验证）：

- [ ] **JS 语法检查**：`node --check js/*.js proxy/*.js` 全部通过（`node --check` 逐文件报语法错误，等价于最低限度的 build 校验）
- [ ] **JSON 校验**：`python3 -m json.tool manifest.json > /dev/null` 通过
- [ ] **人工功能验证**：`python3 -m http.server 8000` 起本地静态服务 → 浏览器访问 `http://localhost:8000` 验证改动功能（待办/笔记/同步按改动面回归），细节见 [devops/development.md](devops/development.md)
- [ ] **版本号已 bump**：改过 js/css 则已执行 `./bump-version.sh`，`index.html` 中 `?v=` 与 `wb-version` meta 已更新（⚠️ 脚本用 BSD sed 语法，Linux/WSL 下需按 GNU sed 等效执行，见 AGENTS.md）
- [ ] **覆盖率**：不适用（无测试框架，无覆盖率阈值）
- [ ] commit message 符合 §4.2 格式（type + ≥10 字符标题 + TAPD 脚注）
- [ ] 我**完全理解**这段代码做了什么（不是 AI 生成后未读直接提交）
- [ ] 无调试残留：新增代码行不含 `console.log/warn/debug/info`（pre-commit 会拦截，见 §4.1）

## 3. Review 关注点（自查 + AI Review 时的人工判断项）

通用代码质量检查项（安全 / 正确性 / 可维护性）以 [.harness/review.md](../review.md) 为准，此处不重复。以下是**本项目特有**、需人工判断的流程侧关注点：

### P0（阻断合入）

- [ ] 未绕过 `js/store.js` 直接读写 `wb.*` localStorage 键；未绕过 `js/github.js` 直接调 GitHub Contents API（红线 4：脏标记 / 冲突合并 / 事件广播不可绕开）
- [ ] Token 未以任何形式落库（`data/workbench.json`）、落日志（`console.log`）或硬编码进源码（红线 5）
- [ ] 用户内容（笔记 / 待办）渲染前经 `util.js` 的 `esc()` 转义，未把未转义内容拼进 `innerHTML`
- [ ] Worker 代理（`proxy/cloudflare-worker.js`）新增转发路径走白名单，未开放任意 URL 中转
- [ ] 新增持久化字段已同步考虑 `github.js` 双向合并逻辑（否则同步时字段丢失）
- [ ] 未引入 package.json / npm 依赖 / 构建工具 / CDN 大型框架（红线 2）

### P1（强烈建议）

- [ ] 改动遵循模块分层（数据层 `store.js` / 同步层 `github.js` / 视图层 `todos.js`·`notes.js`，见 AGENTS.md）
- [ ] 编码风格符合 [coding-style.md](coding-style.md)，日志符合 [logging.md](logging.md)
- [ ] 文档同步更新（改架构 → [architecture.md](architecture.md)；踩坑 → [failures.md](failures.md)）

## 4. 门禁（Git 钩子，机器强制）

三个钩子经软链安装（`scripts/*.sh` → `.git/hooks/`），是本项目 Review 的**实际强制门禁**：

### 4.1 pre-commit（`scripts/pre_commit_check.sh`）

提交时自动拦截（对本项目实际生效的检查项）：

| 检查 | 拦截内容 |
|------|---------|
| 敏感文件 | `.env` / `*.pem` / `*.key` / `credentials` / `token.json` / `id_rsa` 等模式 |
| 构建产物 | `node_modules/` / `dist/` / `build/` / 二进制文件等 |
| 冲突标记 | 未解决的 `<<<<<<<` / `=======` / `>>>>>>>` |
| 大文件 | 单文件 > 5MB |
| 调试代码 | **新增行**中的 `console.log/warn/debug/info`；`DO NOT COMMIT` / `TODO REMOVE` 标记 |

格式化检查（prettier/deno fmt）因本机未安装对应工具而自动跳过。逃生口 `SKIP_PRE_COMMIT=1`（不推荐）。

### 4.2 commit-msg（`scripts/commit_msg_check.sh`）

强制规则（不满足直接拒绝 commit）：

1. **非空** 且标题 **≥ 10 字符**（> 72 字符仅警告不拦截）
2. **Conventional Commits 格式**：`<type>(<scope>)?: <subject>`，type 限定为
   `feat | fix | docs | style | refactor | perf | test | build | ci | chore | revert | other`
3. **TAPD 单号脚注**：message body 任意行必须匹配 `--(bug|story|task|test|other)=<纯数字>`（默认 `--story=<id>`，bug fix 用 `--bug=<id>`）
4. 逃生口：`DISABLE_CONV_COMMITS=1` / `DISABLE_TAPD_FOOTER=1`（跳过 TAPD 脚注需在任务 `00-overview.md` 关键决策备忘记录原因）

### 4.3 pre-push（`scripts/pre_push_check.sh`）

通用脚本会按语言跑 build/lint/test，但本项目**无 package.json / go.mod 等清单文件**，JS 检查分支直接跳过——对本项目 pre-push 实际仅做改动文件收集与依赖清单变更警告（非阻断），**不构成有效门禁**。JS 质量把关依赖 §2 的 `node --check` 自查与 pre-commit 调试代码拦截。逃生口 `SKIP_PRE_PUSH=1`。

## 5. 合入门槛

本项目**无 CI 流水线**（GitHub Pages 直接托管仓库内容），合入条件全部在本地闭环：

- §2 自查清单逐项通过（含 `node --check` 全绿、`bump-version.sh` 已执行）
- AI Review（SOP Step 8）产出的 `must-fix` 级问题已全部修复
- 三个 Git 钩子未使用逃生口绕过（`SKIP_*` / `DISABLE_*` 若使用必须记录原因）
- 一个 MR 只含一个 commit（amend 累积）

## 6. AI 辅助 Review

- SOP Step 8 使用 AI 按 [.harness/review.md](../review.md) 清单审查，结果写入任务目录 `08-review.md`
- AI 报告中 `must-fix` 视为阻断项；`should-fix` / `nice-to-have` 可记录后跟进
- 单人项目中 AI Review 是唯一的"第二双眼睛"，**不允许跳过**

## 7. 紧急修复（hotfix）

仅限线上功能不可用 / Token 泄漏类安全问题：

- 可先修复合入，但 §4 钩子门禁与 `bump-version.sh` **不得跳过**
- 24 小时内补齐 AI Review 与任务产物
- 事后复盘记录到 [failures.md](failures.md)

## 参考

- AI Review 检查清单：[.harness/review.md](../review.md)
- 编码规范：[coding-style.md](coding-style.md)
- 测试规范：[unittest/unittest.md](unittest/unittest.md)
- 日常开发流程：[devops/development.md](devops/development.md)
- 失败案例：[failures.md](failures.md)
