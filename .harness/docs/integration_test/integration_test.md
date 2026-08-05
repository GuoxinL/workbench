# 集成测试规范（环境 / 用例 / 运行调试）

> 让任意成员（或 AI Agent）能在**真实链路**上把本项目的集成测试**搭起来、测得对、跑得通、出错查得到**。
> 三段式结构：① 环境与依赖 / ② 用例设计与组织 / ③ 运行与调试。
>
> **与单元测试的边界**（详见 §二.8）：
> - 单元测试（`.harness/docs/unittest/unittest.md`）：函数 / 模块 / store 级，`fetch` 用 `vi.stubGlobal` 替身，localStorage/IndexedDB 用 jsdom + fake-indexeddb，**不**起真实浏览器、**不**打真实 GitHub API。
> - 集成测试（本文）：**真实浏览器 UI → `useDataStore` / localStorage + IndexedDB → 同步引擎 →（可选 Worker 代理）→ GitHub Contents API → 真实数据仓库 `kb/<id>.md` + `todos/<id>.json`（目录树每文件 blob sha 索引，无中央 `manifest.json`）** 的端到端链路。
>
> **若仓库出现 `.codebuddy/rules/integration_test_*.md` 或同义命名（`it_*.md`），那是权威来源**：本文以摘录 + 链接形式承接。
> 2026-08-04 核查：仓库**不存在** `.codebuddy/rules/` 目录，故本文即当前基线。

> Source：`src/services/sync/engine.ts`、`src/services/sync/diff.ts`、`src/services/github/listDir.ts`（目录树 blob sha 索引）、`src/services/github/contents.ts`、`src/services/github/diagnose.ts`、`src/services/github/manifest.ts`（仅 @deprecated 遗留读取）、`src/stores/data.ts`、`src/router/index.ts`、`src/components/kb/LinksPanel.vue`、`proxy/cloudflare-worker.js`、`vite.config.ts`、`package.json`、`.harness/docs/architecture.md`、AGENTS.md（红线 4/5）
> Last-verified: 2026-08-04（对应 commit `3c96921`：去中央 `manifest.json`，改用目录树每文件 blob sha + `wb.syncState.v1`）

---

## 一、环境与依赖

### 0. 当前自动化现状（如实记录，勿据此臆造命令）

2026-08-04 全量核查结论：

| 核查项 | 结论 | 证据 |
|--------|------|------|
| 测试框架（单元） | **Vitest 4**（jsdom） | `package.json` `devDependencies`；`npm test` |
| 集成测试运行器 | **无 E2E runner**（Playwright/Cypress 均未引入） | 无 `package.json` 中相关依赖；无 `.github/workflows` 跑 E2E |
| 集成测试形态 | **真实浏览器手测 + AI 经 `web-access` 技能驱动 CDP** | 见 §三.1；`web-access` 技能经 `localhost:3456` 代理控制真实浏览器 |
| 测试文件（集成） | **无**（集成用例即 §二.4 清单，逐条记录到 `06-it.md`） | 现有 `*test.ts` 全部是 UT 范畴 |
| CI 流水线 | **有**（`.github/workflows/deploy.yml`） | `push main` → `npm ci` → `npm run build` → Pages；⚠️ **未接入 `npm test` / 未跑 E2E**（见 `unittest.md` §三.6） |
| 本地可用运行时 | **有** | `node --version` ≥ 20（CI 用 24）；`npm run dev` → Vite `:5173` |

> **结论**：集成测试以「真实链路手动验收清单」为核心产出（§二.4），AI 场景下用 `web-access` 技能（CDP）驱动真实浏览器执行同一清单。本文**不提供** `make it` / `npm run e2e` 命令——项目无 E2E runner。
> 自动化方案（Playwright 等）属独立提案，本文不擅自落地（见 §三.7）。

### 1. 集成测试形态判定

| 形态 | 本项目是否适用 | 权重 | 说明 |
|------|--------------|------|------|
| **前端 E2E**（UI → 持久化 → 远端） | ✅ 适用 | **主**（手动 / CDP 驱动） | 唯一真实链路，从浏览器 DOM 操作一路验到仓库 `kb/` + `todos/`（目录树每文件 blob sha 索引，无中央 `manifest.json`） |
| **接口级 IT**（GitHub Contents API 往返） | ✅ 适用 | **辅** | 作为 E2E 的**断言手段与环境准备**（curl 读写测试仓校验结果），不单独当作 IT 通过依据 |
| **代理级 IT**（Cloudflare Worker 白名单） | ✅ 适用 | 辅 | 可脱离浏览器用 curl 直接验白名单 / CORS |
| 数据库 IT | ❌ 不适用 | — | 无数据库，持久化 = localStorage + IndexedDB + 远端 `kb/<id>.md` + `todos/<id>.json`（索引由目录树 blob sha 现拉） |
| 消息 / 异步 IT | ❌ 不适用 | — | 无 MQ。异步只有防抖 1.5s 推送 / 轮询（默认 20s，区间 5s–300s），归入 E2E 时序用例 |
| 多服务链路 IT | ❌ 不适用 | — | 纯客户端单体，无服务间调用（见 `architecture.md` §1、§6） |

### 2. 测试环境信息

> 环境的「如何搭 / 如何部署」在 devops 文档，本节只记录**集成测试需要的环境形态与连通信息**。
> 引用（不复制）：`devops/env.md`（本地环境）、`devops/development.md`（改码 → 刷新 → 构建）、`devops/deployment.md`（Pages / Worker 部署）、`devops/test-env-deploy.md`（团队环境管理 Skill 通用流程）、`relationship.md`（上下游依赖）。

| 项 | 本项目实际值 |
|----|-------------|
| 环境名称 / 类型 | **无独立测试环境**。IT 跑在「本地 Vite dev server（`npm run dev` → `http://localhost:5173`）+ 专用测试数据仓库」组合上；也可用 Pages 生产站点 + 测试仓（仅验缓存 / PWA 类用例） |
| 被测前端入口 | `npm run dev` → `http://localhost:5173`（详见 `devops/development.md`）；或 `npm run build && npm run preview` |
| 远端依赖 | GitHub Contents API `https://api.github.com`（唯一强依赖，见 `relationship.md`） |
| 数据落点 | **测试专用**私有仓库的 `kb/<id>.md`（每篇一个 Markdown 文件，frontmatter + 正文）+ `todos/<id>.json`（每条一个 JSON）；索引由 `kb/` + `todos/` 目录树每文件 blob sha 现拉，**无中央 `manifest.json`**。**不是**生产的 `GuoxinL/workbench-data`，**也不是**单个 `data/workbench.json`（该结构已随 2026-07-31 重构废弃） |
| 鉴权方式 | 测试专用 Personal Access Token（细粒度，仅授权测试仓，`Contents: Read and write`） |
| 运行时配置位置 | 浏览器 localStorage `wb.cfg.v1`，经 **`SettingsSheet` 设置抽屉**填写（路由无关——设置是抽屉而非独立页面）；仓库内**无任何环境配置文件** |
| 数据隔离策略 | 独立仓库 + 独立分支（双重）；多端并发用**两个浏览器 profile / 隐身窗口**隔离 localStorage |
| 清理策略 | 手动：用例后重置测试仓 `kb/` + `todos/`（删除本次 IT 创建的测试文件、确认无遗留 `manifest.json`）、清空浏览器 localStorage；整轮结束后**撤销测试 PAT** |
| 可选组件 | 自部署 Cloudflare Worker（仅 `IT-PROXY-*` 用例需要，见 `proxy/cloudflare-worker.js`） |

### 3. 环境隔离硬约束（本项目最容易踩的坑）

| # | 约束 | 原因 |
|---|------|------|
| 1 | **必须显式填写测试仓与测试分支，且不得指向生产仓** | 数据落点是 `kb/<id>.md` + `todos/<id>.json`（无中央 `manifest.json`），由 `Config.repo`/`branch` 决定。把 `repo` 指向 `GuoxinL/workbench-data` = **直接写生产数据仓库** |
| 2 | **禁止用日常使用的 PAT** | IT 会向仓库写真实 commit；专用 token 便于一键撤销、限制爆炸半径 |
| 3 | 测试仓必须**私有** | 与生产同理；IT 造的假数据同样不该公开 |
| 4 | 多端场景用独立浏览器 profile，**不要**用同一 profile 的两个标签页 | 同 profile 共享 localStorage，无法真实模拟"两个设备各持一份本地副本" |
| 5 | Token **禁止**出现在 `06-it.md`、截图、日志、命令回显中 | AGENTS.md 红线 5；记录时脱敏为 `github_pat_****` |
| 6 | IT 结束后撤销测试 PAT，或至少签发时设短有效期 | 细粒度令牌可设过期时间，降低遗留风险 |

### 4. 前置依赖检查清单（先查再动，任一项通过就跳过对应准备）

> 以下命令用于**准备与校验环境**，不是被测链路本身——被测链路必须从浏览器 UI 触发。
> 先在 shell 里导出变量（**不入库、不回显**）：
> `export WB_IT_REPO='<owner>/workbench-data-it' WB_IT_BRANCH='main'`
> `read -rs WB_IT_TOKEN && export WB_IT_TOKEN`

```bash
# (1) 本地 dev server 已起（或 preview）
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:5173/
# 期望 200；否则在仓库根执行：npm run dev

# (2) 测试仓可达且令牌有写权限（只打印布尔，不打印 token）
curl -sS -H "Authorization: Bearer $WB_IT_TOKEN" \
     -H 'Accept: application/vnd.github+json' \
     "https://api.github.com/repos/$WB_IT_REPO" \
  | grep -o '"push":[a-z]*'
# 期望 "push":true；false 或 404 → 令牌未授权该仓 / 仓库名写错

# (3) 测试仓数据基线（确认 kb/ + todos/ 目录树是否为空、是否有遗留 manifest.json）
curl -sS -H "Authorization: Bearer $WB_IT_TOKEN" \
     "https://api.github.com/repos/$WB_IT_REPO/contents/kb?ref=$WB_IT_BRANCH" \
  | grep -o '"path": *"[^"]*"' || echo "kb/ 为空（IT-SYNC-01 正需要这个状态）"
curl -sS -H "Authorization: Bearer $WB_IT_TOKEN" \
     "https://api.github.com/repos/$WB_IT_REPO/contents/todos?ref=$WB_IT_BRANCH" \
  | grep -o '"path": *"[^"]*"' || echo "todos/ 为空"
# 遗留兼容检查：确认无残留的 manifest.json（新架构不应出现）
curl -sS -o /dev/null -w 'legacy-manifest=%{http_code}\n' -H "Authorization: Bearer $WB_IT_TOKEN" \
     "https://api.github.com/repos/$WB_IT_REPO/contents/manifest.json?ref=$WB_IT_BRANCH" \
  | grep -q '200' && echo "⚠️ 发现遗留 manifest.json，应清理" || echo "无 manifest.json（符合预期）"

# (4) 剩余 API 配额（限流类用例前必查）
curl -sS -H "Authorization: Bearer $WB_IT_TOKEN" https://api.github.com/rate_limit \
  | grep -o '"remaining":[0-9]*' | head -1
# 认证配额 5000/h；余量过低时暂停 IT，避免把限流误判成功能缺陷

# (5) 仅 IT-PROXY-* 需要：自部署 Worker 可达
curl -sS -o /dev/null -w '%{http_code}\n' "$WB_IT_PROXY/rate_limit"
```

判断逻辑：某项失败 → **只修复失败项**，不要重置整个环境。

### 5. 环境变量与配置说明

| 变量 | 用途 | 备注 |
|------|------|------|
| `WB_IT_REPO` | 测试数据仓库 `owner/repo` | 仅供准备 / 断言脚本使用 |
| `WB_IT_BRANCH` | 测试分支 | 默认 `main`；也可用独立 `it` 分支加一层隔离 |
| `WB_IT_TOKEN` | 测试专用 PAT | **只经 `read -rs` 输入或从密码管理器注入**，禁止写进 shell 历史 / 仓库 / `06-it.md` |
| `WB_IT_PROXY` | 自部署 Worker 地址 | 仅 `IT-PROXY-*` 用例需要 |

`Config`（`src/types/index.ts`）字段：`enabled` / `repo` / `branch` / `token` / `poll` / `apiBase` / `publicRepo?` / `path`。注意：
- **`path` 字段当前同步未使用**——数据落点固定在仓库根的 `kb/<id>.md` + `todos/<id>.json`（索引由目录树每文件 blob sha 现拉，无中央 `manifest.json`），IT 无需（也不应）依赖 `path` 区分数据。
- `poll` 轮询秒数，引擎夹取区间 **5–300s**（`<engine.ts>` `MIN_POLL=5000` / `MAX_POLL=300000`）。
- `apiBase` 可选；为空时默认 `https://api.github.com`。

> **被测应用本身不读任何环境变量**——它的全部运行时配置在浏览器 localStorage `wb.cfg.v1`，由 `SettingsSheet` 写入。
> 若需要落 `.env.local` 之类文件，**必须先确认已被 `.gitignore` 覆盖**再创建。

---

## 二、用例设计与组织

### 1. 通用强制条款（红线）

| # | 红线 | 本项目具体含义 |
|---|------|--------------|
| 1 | **禁止**指向生产资源 | 禁止把 `repo` 指向 `GuoxinL/workbench-data`；统一用专用测试仓 |
| 2 | **禁止**使用真实日常凭证 | 只用测试专用 PAT |
| 3 | **禁止**遗留脏数据 | 每条用例自带前置（清 localStorage / 重置远端 `kb/` + `todos/`，确认无残留 `manifest.json`）与收尾 |
| 4 | **禁止**用例间共享可变状态 / 依赖执行顺序 | 例外：`IT-MERGE-*` 天然需要"两端"状态，须在用例内自建两端，不得复用上一条的残留 |
| 5 | **禁止**硬编码仓库名 / 令牌 / 代理地址到文档或脚本 | 一律走 `WB_IT_*` 变量占位 |
| 6 | **禁止**在浏览器 console 里直接调 `useDataStore` / 引擎造数据后宣布用例通过 | 那是 UT 层的事；IT 必须从**真实入口**（UI 操作 / 定时器 / 可见性事件 / 网络事件）触发。console **只允许用于观测**（读 localStorage、看同步 phase） |
| 7 | **必须**留可追溯证据 | 本项目**无 reqid / traceID**（无后端，见 `architecture.md` §9）。替代凭证见 §二.5 |
| 8 | **必须**为写操作确认目标 | 每条会产生 commit 的用例，执行前先核对 `SettingsSheet` 里的仓库名确实是测试仓 |

### 2. 用例类型与组织方式

| 类型 | 编号前缀 | 覆盖内容 |
|------|---------|---------|
| 同步往返 | `IT-SYNC-` | 首次创建、防抖推送、轮询拉取、前台唤醒、手动同步 |
| 冲突与合并 | `IT-MERGE-` | 逐条 LWW、墓碑传播、sha 乐观锁重试、本地墓碑清理 |
| 异常与降级 | `IT-FAIL-` | 令牌失效 / 权限不足 / 404 / 限流 / 网络不可达 / 脏数据 / 本地模式 / 离场保护 |
| 代理链路 | `IT-PROXY-` | Worker 路径白名单、Origin 白名单、经代理同步 |
| 视图一致性 | `IT-VIEW-` | 拉取数据后的列表 / 双链反链 / LinksPanel 关系图 / 改名联动 / XSS 转义 |
| 缓存与 PWA | `IT-PWA-` | 内容哈希缓存失效、添加到主屏幕、已知离线限制 |

**组织方式**：仓库无 IT 测试文件，因此**用例清单即 §二.4 本节**；每次任务的**执行记录**写到 `.harness/plans/<任务目录>/06-it.md`（本文写"规则与清单"，`06-it.md` 写"本次结果"）。新增用例 → 追加到本文对应分组末尾并递增编号，**不复用已废弃编号**。

### 3. 用例设计自检（四维度）

| 维度 | 本项目检查点 |
|------|-------------|
| **输入** | UI 输入（标题 / Markdown / `[[双链]]` / 特殊字符）、配置输入（仓库 / 分支 / 令牌 / 轮询秒数边界 5–300） |
| **状态** | 三处前置必须明确：① 本地 localStorage（`wb.data.v1` / `wb.cfg.v1` / `wb.syncState.v1`）+ IndexedDB ② 远端 `kb/` + `todos/`（不存在 / 有基线 / 被改脏；无中央 `manifest.json`）③ 网络（正常 / 离线 / 走代理） |
| **依赖** | GitHub API 必须真实；限流与网络异常允许用 DevTools 模拟（须标注，见 §二.6） |
| **断言** | 不止看 UI toast，还要断言**副作用**：远端 commit 是否产生、`kb/<id>.md` + `todos/<id>.json` 内容（且无 `manifest.json`）、同步 phase 状态（本地模式 / 同步中 / 已同步 / 同步失败）、另一端是否收敛 |

### 4. 手动集成测试检查清单（**核心产出**）

> 用法：复制本节到 `06-it.md`，逐条勾选并补「实际结果 / 证据」。
> 通用前置（每条用例开始前）：dev server 已起 → 打开目标浏览器 profile → `SettingsSheet` 确认指向**测试仓** → 按用例要求准备 localStorage 与远端 `kb/` + `todos/`（确认无残留 `manifest.json`）。
> 「端 A / 端 B」= 两个独立浏览器 profile（或一台电脑 + 一部手机）。

#### A. 同步往返（IT-SYNC）

- [ ] **IT-SYNC-01 首次同步自动创建远端数据文件**
  - 前置：远端测试仓 `kb/` + `todos/` 目录树为空、且无遗留 `manifest.json`（§一.4 检查 3 返回空）；本地有若干待办 / 文章
  - 步骤：`SettingsSheet` → 填测试仓 / 分支 / 测试 PAT → 开启「启用同步」→ 保存并同步
  - 断言：同步 phase 经「同步中」→「已同步」；测试仓新增 1 个（或数个）commit；`kb/` 目录出现对应 `<id>.md`、`todos/` 出现对应 `<id>.json`；**仓库根不出现 `manifest.json`**；远端文件（`kb/*.md` frontmatter / `todos/*.json`）**绝不含 token / apiBase / cfg**（红线 5）

- [ ] **IT-SYNC-02 本地新增待办经防抖推送到远端**
  - 前置：同步已启用且 phase 为「已同步」
  - 步骤：待办视图输入标题 → 回车 → 静置 ≥2s（防抖 `PUSH_DEBOUNCE=1500ms`，`engine.ts:58`）
  - 断言：phase 经「同步中」→「已同步」；测试仓新增 commit，`kb/<id>.md` 或 `todos/<id>.json` 出现该 todo；`wb.syncState.v1` 被写入（path→blob sha 基线，`stores/data.ts` 写盘），**且无 `manifest.json` 产生**

- [ ] **IT-SYNC-03 远端变更经轮询拉取到本端**
  - 前置：端 A、端 B 均已配置同步；轮询间隔设为 5s（下限，`engine.ts:61`）
  - 步骤：端 A 新增一条待办并等待推送完成 → 端 B 保持页面**可见**，静置 ≥ 2 个轮询周期
  - 断言：端 B 无需刷新即出现该待办；端 B 无本地变更时不产生多余 commit（`engine.ts:123` 本地无领先变更则整轮不写远端）

- [ ] **IT-SYNC-04 回到前台立即同步**
  - 前置：端 B 页面切到后台（`document.hidden`）；期间端 A 新增数据
  - 步骤：把端 B 切回前台（触发 `visibilitychange`，引擎在 `document.hidden` 时跳过轮询，`engine.ts:182`；切回前台应用会主动触发一次 `sync`）
  - 断言：**立即**（不等下一个轮询周期）出现「同步中」并拉到端 A 的新数据

- [ ] **IT-SYNC-05 手动点同步触发落盘 + 推送**
  - 前置：在文章编辑器（Milkdown）中输入内容但**未失焦**（内容尚在防抖窗口内）
  - 步骤：直接点顶栏同步入口（或 `SettingsSheet` 的「立即同步」）
  - 断言：编辑中的内容被强制落盘后一并推送；phase「已同步」；远端 `kb/<id>.md` 含刚输入的正文

#### B. 冲突与合并（IT-MERGE）

- [ ] **IT-MERGE-01 两端编辑不同条目 → 双方都保留**
  - 前置：端 A / 端 B 均已同步到同一基线
  - 步骤：断开两端同步（先关「启用同步」）→ 端 A 改待办 X、端 B 改待办 Y → 依次重新启用同步
  - 断言：远端与两端最终都同时包含 X、Y 的新值，无覆盖丢失（逐条 LWW，`merge.ts`）

- [ ] **IT-MERGE-02 两端编辑同一条目 → updatedAt 大者胜（预期丢弃较早写入）**
  - 前置：同上基线
  - 步骤：两端离线各改**同一条**待办标题 → 先让端 A 同步，再让端 B 同步
  - 断言：最终值为 `updatedAt` 更大的那次修改；较早写入被丢弃。**这是设计取舍而非缺陷**（见 `architecture.md` §5），用例的作用是确认"不出现数据结构损坏 / 半条记录"

- [ ] **IT-MERGE-03 一端删除、另一端未删 → 墓碑传播**
  - 步骤：端 A 删除一条待办并同步 → 端 B 拉取
  - 断言：端 B UI 中该条消失；远端对应记录为软删除墓碑（`deleted:true` 且 `updatedAt` 已刷新）；端 B **不会**把它"复活"推回

- [ ] **IT-MERGE-04 sha 乐观锁冲突自动重试**
  - 步骤：两端几乎同时（间隔 <1s）各自新增一条数据并触发推送
  - 断言：DevTools Network 中可见某端的 `PUT` 因远端 sha 变化被拒（冲突），随后 `RETRY_BACKOFF×attempt`（350ms、700ms…）退避重新拉取再 `PUT`，最终成功（≤`MAX_RETRY=3` 次，`engine.ts:59-60,142-149`）；两条数据**都**存在于远端；无「冲突，已放弃本次同步」

- [ ] **IT-MERGE-05 软删除墓碑在本地被清理**
  - 前置：手工编辑远端，塞入一条 `deleted:true` 且 `updatedAt` 较早的 `todos/<id>.json`（或 `kb/<id>.md` frontmatter 的 `deleted` 字段）
  - 步骤：本端拉取合并 → 制造任意本地改动触发一次推送
  - 断言：远端该 `todos/<id>.json` 中墓碑记录已消失（经 `cleanupTombstones` 清理后重新 PUT）；其它记录不受影响；全程不出现 `manifest.json`
  - 备注：具体保留期限以 `cleanupTombstones` 实现为准，文档不写死天数

#### C. 异常与降级（IT-FAIL）

- [ ] **IT-FAIL-01 Token 失效**
  - 步骤：在 GitHub 后台撤销测试 PAT → 回到应用触发一次同步 → 再点 `SettingsSheet`「诊断」
  - 断言：phase「同步失败」；诊断在第 3 步「令牌有效性」失败并中断（`diagnose.ts:94-99`，code `token`）；提示文案含「令牌失效或无效」

- [ ] **IT-FAIL-02 令牌只读、无写权限**
  - 前置：另签一枚仅 `Contents: Read` 的测试令牌
  - 步骤：填入后点「测试连接」
  - 断言：提示无写权限；诊断第 4 步「仓库访问与写权限」失败（`diagnose.ts:101-106`），detail 含「令牌缺少仓库写权限（需 repo 权限）」

- [ ] **IT-FAIL-03 仓库 / 分支不存在**
  - 步骤：把仓库名改成不存在的 `<owner>/no-such-repo-it`（**注意不能指向生产仓**）→ 保存并同步
  - 断言：诊断第 4 步 `notfound`；文案含「仓库或分支不存在，或 Token 无该仓库权限」（`diagnose.ts:70`）

- [ ] **IT-FAIL-04 API 限流（403 rate limit）**
  - 说明：真实 5000/h 配额难以自然触发 → 用 **DevTools Local Overrides / 请求拦截**把 `GET contents` 响应改为 `403` + body `{"message":"API rate limit exceeded"}`
  - 断言：code `ratelimit`（`diagnose.ts:70`）；状态置 error 且**不**丢失本地数据
  - 备注：属**模拟**用例，必须在 `06-it.md` 标注「DevTools 模拟」；无条件模拟时可标 SKIP + 原因

- [ ] **IT-FAIL-05 网络不可达与恢复**
  - 步骤：DevTools → Network → Offline → 触发同步 → 观察 → 恢复 Online
  - 断言：报网络类文案（code `network`：`无法连接 api.github.com…请在「API 代理基址」填入中转地址`，或 12s 超时「请求超时（12s 无响应）」，`diagnose.ts:58,64-65`）；**本地编辑仍完全可用**，phase 保持「同步失败」/「本地模式」；恢复 Online 后自动重同步并转绿

- [ ] **IT-FAIL-06 远端数据被写坏**
  - 前置：手工把远端某个 `kb/<id>.md` 的 frontmatter 改成非法（如删掉一个 `}` 使 YAML 解析失败），或把某个 `todos/<id>.json` 改成非法 JSON
  - 步骤：触发同步
  - 断言：解析/校验失败有友好提示（单条损坏仅丢弃该条，不污染整轮 LWW 合并）；**本地数据未被清空 / 未被覆盖**；不出现 `manifest.json`

- [ ] **IT-FAIL-07 未配置或关闭同步 → 本地模式功能完整**
  - 步骤：`SettingsSheet` 关闭「启用同步」并保存 → 正常使用待办 / 文章 / LinksPanel 关系图
  - 断言：phase 显示「本地模式」（引擎 `off`，`engine.ts:82-90`）；增删改查、双链、关系图全部可用；刷新页面数据仍在（localStorage + IndexedDB）；**不发起任何 GitHub 请求**（Network 面板为证）

- [ ] **IT-FAIL-08 离场保护**
  - 前置：同步已启用，存在未推送变更
  - 步骤：直接关闭标签页 / 刷新
  - 断言：弹出原生确认框「还有变更未同步到 GitHub，确定离开？」；取消后留在页面且数据完好

#### D. 代理链路（IT-PROXY，需自部署 Worker）

- [ ] **IT-PROXY-01 经 Worker 完成同步**
  - 步骤：`SettingsSheet`「API 代理基址」填 `$WB_IT_PROXY` → 点「诊断」→ 保存并同步
  - 断言：诊断五步全绿（含「网络连通」可达）；同步成功且测试仓产生 commit；Network 面板中所有请求指向 Worker 域名而非 `api.github.com`

- [ ] **IT-PROXY-02 路径白名单拦截**
  - 步骤：`curl -sS "$WB_IT_PROXY/user"`（`/user` 不在白名单，`proxy/cloudflare-worker.js`）
  - 断言：HTTP 403，body 含白名单拒绝信息

- [ ] **IT-PROXY-03 Origin 白名单拦截**
  - 步骤：`curl -sS -o /dev/null -w '%{http_code}\n' -H 'Origin: https://evil.example.com' "$WB_IT_PROXY/rate_limit"`
  - 断言：HTTP 403，body 含来源不允许信息
  - 备注：若你的 Worker 把 `ALLOW_ORIGINS` 置空数组则该用例不适用，需在 `06-it.md` 标注 N/A

#### E. 数据加载后的视图一致性（IT-VIEW）

- [ ] **IT-VIEW-01 空本地拉取远端后列表一致**
  - 前置：端 B 清空全部 localStorage（含 `wb.seeded`，否则会塞示例数据，`stores/data.ts`）
  - 步骤：配置同步 → 首次拉取
  - 断言：本地待办 / 文章条数与远端 `todos/` 目录中 `deleted:false` 的 json 条数、`kb/` 中存活 md 数**逐一相等**；顶部统计数字一致；远端无 `manifest.json`

- [ ] **IT-VIEW-02 跨端双向链接与反链正确**
  - 步骤：端 A 新建文章「甲」，正文含 `[[乙]]`，并新建文章「乙」→ 同步 → 端 B 拉取
  - 断言：端 B 中「甲」正文里 `[[乙]]` 渲染为可点击链接并能跳转；打开「乙」时**反链面板（LinksPanel）**列出「甲」及上下文摘录

- [ ] **IT-VIEW-03 LinksPanel 关系图与双链数据一致**
  - 步骤：端 B 拉取上述数据后打开文章
  - 断言：**文章内部的 `LinksPanel` 关系图**节点数 = 未删除文章数；甲→乙 存在连线；正文中引用了不存在标题的链接显示为「待创建 / missing」而非报错；点击节点 / 链接能跳转到对应文章
  - ⚠️ 当前**无独立图谱路由**（`/graph` 不存在，路由仅 `/todos` `/articles/:id?` `/share/:id`）；关系图以文章内 `LinksPanel` 形式呈现，断言围绕它展开

- [ ] **IT-VIEW-04 改标题联动改引用后跨端仍正确**
  - 步骤：端 A 把文章「乙」改名为「乙2」（触发引用改写）→ 同步 → 端 B 拉取
  - 断言：端 B 中「甲」的正文已变为 `[[乙2]]`，链接仍可跳转，反链面板仍显示「甲」；该批量改动在远端只体现为**一次**推送

- [ ] **IT-VIEW-05 跨端同步后的 XSS 转义（端到端）**
  - 步骤：端 A 新建文章，正文写入 `<img src=x onerror=alert(1)>` 与 `<script>alert(2)</script>` → 同步 → 端 B 拉取并打开该文章与 LinksPanel
  - 断言：端 B 中两段内容**以纯文本呈现**，无弹窗、无 DOM 注入（Markdown 渲染经 DOMPurify 兜底）；把标题也设为 `<script>` 时节点标签同样为纯文本
  - 与 UT 边界：UT 测 `render()` 的**返回字符串**；本条测跨端往返后**页面实际不执行脚本**

#### F. 缓存与 PWA（IT-PWA）

- [ ] **IT-PWA-01 内容哈希缓存失效生效**
  - 步骤：改动任意源码 → `npm run build` → 部署 / 预览并刷新页面
  - 断言：Vite 产物文件名带内容哈希（如 `app.<hash>.js`），DevTools Network 中新构建资源为**新文件名**请求而非命中旧缓存；**无** `?v=` 机制（2026-07-31 重构已移除 `bump-version.sh`，缓存失效由内容哈希保证）
  - 备注：这是「改动后用户拿到新代码」的验收动作，任何涉及源码的任务都应跑

- [ ] **IT-PWA-02 添加到主屏幕可正常启动**
  - 步骤：移动端浏览器打开 Pages 站点 → 添加到主屏幕 → 从桌面图标启动
  - 断言：以独立窗口打开、图标与名称来自 `manifest.json`、数据与浏览器内一致（同源共享 localStorage）

- [ ] **IT-PWA-03 离线打开的已知限制（负向确认）**
  - 步骤：断网后从主屏图标启动
  - 断言：白屏 / 无法加载。**这是已知限制而非缺陷**——项目无 Service Worker（`architecture.md` §12）。本条用于确认现状未被误判成回归；若某次改动后离线可用了，说明引入了 SW，需回头更新架构文档

### 5. 可追溯证据要求（本项目的 reqid 替代物）

本项目无后端、无 traceID。每条已执行用例在 `06-it.md` 中至少记录以下 3 类证据之一（写操作类必须含前两项）：

| 证据 | 获取方式 |
|------|---------|
| **测试仓 commit SHA + 提交时间** | 测试仓 commits 列表；commit message 形如 `workbench: sync ...` |
| **DevTools Network 记录** | 请求 URL（脱去 token）、HTTP 状态码、`x-ratelimit-remaining` 响应头 |
| **诊断五步输出** | `SettingsSheet`「诊断」按钮的逐步结果文本（`diagnose.ts:83-128`：配置检查 / 网络连通 / 令牌有效性 / 仓库访问与写权限 / 数据文件） |
| 状态快照 | 顶栏同步 phase 文案（本地模式 / 同步中 / 已同步 / 同步失败）、`localStorage['wb.data.v1']` 与 `wb.syncState.v1`（path→sha 基线） |

### 6. Mock / 桩策略

| 类别 | 默认策略 |
|------|---------|
| GitHub Contents API | **真实调用**（测试仓）。禁止在 IT 中 stub 引擎或替换 `fetch` |
| Worker 代理 | 真实自部署实例；无实例时 `IT-PROXY-*` 整组标 N/A，不得伪造 |
| 网络异常 / 超时 | 用 DevTools **Offline / 限速 / 请求拦截**制造，属真实浏览器行为，可接受 |
| 限流 403、异常状态码 | 用 DevTools **Local Overrides** 改写响应；**必须**在用例结果中标注「模拟」 |
| 时间（墓碑等） | 不改系统时钟；改**数据**（构造远端 `kb/<id>.md` / `todos/<id>.json` 中的旧 `updatedAt`），见 IT-MERGE-05 |
| 本地存储 | 不 mock；直接用浏览器 profile / 隐身窗口做隔离 |

### 7. 与项目 rules 承接

- 仓库出现 `.codebuddy/rules/integration_test_*.md` / `it_*.md` 时，本文 §二 改为指向该 rules 锚点，不重复维护。
- 当前（2026-08-04）无该目录，本文即基线。
- 与 `.harness/plans/_template/06-it.md` 配套：本文写「规则 + 清单」，`06-it.md` 写「本次任务的执行结果」。

### 8. 与单元测试的分层边界（禁止重叠）

| 逻辑 | 归属 UT（Mock / 函数级） | 归属 IT（真实链路 / 端到端） |
|------|------------------------|---------------------------|
| `mergeInto` / `mergeArticles` / `mergeTodos` 的 LWW 分支、边界 | ✅ 直接喂两个对象断言返回值 | ❌ 不在 IT 逐分支验 |
| `serialize` / `cleanupTombstones` 墓碑清理 | ✅ 构造时间戳断言输出 | 仅 IT-MERGE-05 验"真实同步后墓碑确实消失" |
| `render` 语法子集 / 转义 | ✅ 输入输出字符串比对 | 仅 IT-VIEW-05 验"跨端后页面不执行脚本" |
| `slug` / `scan-wikilinks` | ✅ | ❌ |
| `testConnection` / `runDiagnose` 状态码 → 文案映射 | ✅ 喂假 Response | IT 只验"真实触发该状态码时用户看到对应文案" |
| 冲突重试的**次数与退避** | ✅ 可 Mock fetch 验 3 次 | IT 验"真实并发下最终两条数据都在" |
| 顶栏 phase 状态机 / toast / `SettingsSheet` 交互 | ❌ | ✅ |
| 跨端收敛、commit 是否产生、代理白名单 | ❌ | ✅ |

> 简记：**UT 管"函数算得对不对"，IT 管"从点击到仓库里那个 `kb/<id>.md` + `todos/<id>.json`（无中央 `manifest.json`）对不对"。**

---

## 三、运行与调试

### 1. 标准执行流程

**方式一：手动浏览器（人）**

```bash
# ① 起本地 dev server（或 build + preview）
npm run dev          # → http://localhost:5173
# 或：npm run build && npm run preview

# ② 跑 §一.4 的前置检查

# ③ 浏览器打开 http://localhost:5173 ，按 §二.4 清单逐条执行并勾选
```

**方式二：AI 经 `web-access` 技能驱动真实浏览器（推荐用于 AI 验收）**

- 调用 `web-access` 技能，经其 CDP 代理（默认 `localhost:3456`）打开 `http://localhost:5173`；
- 新建浏览器标签后，标签 id 持久化在 `/tmp/wb_newtab.txt`，后续步骤复用同一标签；
- 按 §二.4 清单逐条：用 CDP 在 `SettingsSheet` 填写测试仓/分支/token → 触发同步 → 读取 `localStorage`（page-context `JSON.parse(localStorage.getItem('wb.data.v1'))`）与 phase → 用 page-context `fetch` 直连 GitHub API 校验远端 `kb/` + `todos/` 目录树（确认无 `manifest.json`）；
- 每个写操作用例务必先确认 `wb.cfg.v1` 的 `repo` 是测试仓（避免误写生产）。

> **不存在** `make it` / `npm run test:e2e` / `go test -tags=integration` 等命令——项目无 E2E runner（§一.0）。

### 2. 环境准备与清理片段

```bash
# 重置远端测试仓：删除 kb/ + todos/ 下全部测试文件，并确认无遗留 manifest.json
for DIR in kb todos; do
  for P in $(curl -sS -H "Authorization: Bearer $WB_IT_TOKEN" \
       "https://api.github.com/repos/$WB_IT_REPO/contents/$DIR?ref=$WB_IT_BRANCH" \
       | grep -o '"path": *"[^"]*"' | sed -n 's/.*"path": *"\([^"]*\)".*/\1/p'); do
    SHA=$(curl -sS -H "Authorization: Bearer $WB_IT_TOKEN" \
       "https://api.github.com/repos/$WB_IT_REPO/contents/$P?ref=$WB_IT_BRANCH" \
       | sed -n 's/.*"sha": *"\([^"]*\)".*/\1/p' | head -1)
    [ -n "$SHA" ] && curl -sS -X DELETE -H "Authorization: Bearer $WB_IT_TOKEN" \
       -H 'Accept: application/vnd.github+json' -H 'Content-Type: application/json' \
       "https://api.github.com/repos/$WB_IT_REPO/contents/$P" \
       -d "{\"message\":\"it: reset baseline\",\"branch\":\"$WB_IT_BRANCH\",\"sha\":\"$SHA\"}" \
       -o /dev/null -w "del $P=%{http_code}\n"
  done
done
# 若有遗留 manifest.json 也一并删除
LEGACY=$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $WB_IT_TOKEN" \
  "https://api.github.com/repos/$WB_IT_REPO/contents/manifest.json?ref=$WB_IT_BRANCH")
if [ "$LEGACY" = "200" ]; then
  SHA=$(curl -sS -H "Authorization: Bearer $WB_IT_TOKEN" \
    "https://api.github.com/repos/$WB_IT_REPO/contents/manifest.json?ref=$WB_IT_BRANCH" \
    | sed -n 's/.*"sha": *"\([^"]*\)".*/\1/p' | head -1)
  curl -sS -X DELETE -H "Authorization: Bearer $WB_IT_TOKEN" \
    -H 'Accept: application/vnd.github+json' -H 'Content-Type: application/json' \
    "https://api.github.com/repos/$WB_IT_REPO/contents/manifest.json" \
    -d "{\"message\":\"it: drop legacy manifest\",\"branch\":\"$WB_IT_BRANCH\",\"sha\":\"$SHA\"}" \
    -o /dev/null -w 'del manifest.json=%{http_code}\n'
fi
```

浏览器侧清理（DevTools Console，仅用于**准备 / 清理**，不作为用例步骤）：

```js
// 清空本应用全部本地状态（含示例数据种子标记），随后刷新页面
['wb.data.v1','wb.cfg.v1','wb.syncState.v1','wb.seeded']
  .forEach(k => localStorage.removeItem(k));
```

> ⚠️ 清空 `wb.cfg.v1` 会一并清掉测试 token，需重新在 `SettingsSheet` 填写——这是刻意的，避免 token 长期残留在测试机上。

### 3. 调试套路

| 现象 | 优先排查 | 手段 |
|------|---------|------|
| 全部同步用例失败 | 配置 / 网络 / 令牌 | 先点 `SettingsSheet`「诊断」，五步会**在失败处中断并给出处置建议**（`diagnose.ts:83-128`） |
| **页面行为与仓库代码不一致** | 浏览器缓存旧 JS | 确认 `npm run build` 后文件名带新内容哈希（`app.<hash>.js`）；DevTools 勾 Disable cache 强刷；确认打开的是 `:5173`（dev）或最新预览 |
| 报「同步失败」但网络正常 | 状态码语义 | Network 面板看真实状态码，对照 `diagnose.ts:69-71`：401→令牌、403/429→限流、404→仓库/分支/权限 |
| 数据写到了意料之外的仓库 | repo 指向生产仓 | 检查 `SettingsSheet` 里 `repo` 是否填了 `GuoxinL/workbench-data`；改用测试仓 |
| 两端数据不收敛 | `updatedAt` 与墓碑 | 对比两端 `localStorage['wb.data.v1']` 中同 id 记录的 `updatedAt` / `deleted`；LWW 只认更大的 `updatedAt` |
| 偶发失败（flaky） | 时序 | 防抖 1.5s、轮询最小 5s、`document.hidden` 时跳过轮询——断言前给足等待，不要 1s 内下结论 |
| 手动同步"没反应" | 并发排队 | 用户主动调用会**复用进行中的同步 Promise**（`engine.ts:161-169`），属正常，等待即可 |
| 经代理时 403 | 白名单 | 对照 `proxy/cloudflare-worker.js` 的路径白名单与 Origin 白名单 |

### 4. 故障定位流程（本项目版，无 reqid）

```
用例失败
  → SettingsSheet「诊断」跑五步，定位断点（配置 / 网络连通 / 令牌有效性 / 仓库写权限 / 数据文件）
  → DevTools Network：看实际请求 URL（是否走代理）、方法、状态码、x-ratelimit-remaining
  → 测试仓 commits / kb/ + todos/：确认这次操作到底有没有产生 commit、内容对不对（且无 `manifest.json`）
  → localStorage：对比 wb.data.v1（记录级 updatedAt / deleted）与 wb.syncState.v1（path→sha 基线）
  → 归因到模块：视图层(kb) / 数据层(stores/data) / 同步层(sync/engine) / GitHub 层(github/*) / 代理(worker)
  → 修复后重跑该条用例 + 同组回归
```

> 失败处理原则与 `_template/06-it.md` 一致：环境问题 → 修复后重跑；代码问题 → 回 03-implement；设计问题 → 回 02-plan。

### 5. 不要 / 慎用

| 项 | 原因 |
|----|------|
| 把 repo 指向 `GuoxinL/workbench-data` 跑 IT | 会写**生产数据仓库**，直接污染真实数据 |
| 在 console 调 `useDataStore().addTodo()` 造数据后勾选用例通过 | 绕过了 UI → store 这一段真实链路，等于没测 |
| 用同一浏览器 profile 的两个标签页模拟"两端" | 共享 localStorage，无法产生真正的并发冲突 |
| 用「等等看」代替明确等待条件 | 应明确等待可观测信号：phase 状态变化、Network 请求完成、远端 commit 出现 |
| 为让用例过而临时改被测代码 | 与 UT 红线一致，禁止 |
| 把 token 贴进 `06-it.md` / 截图 / 命令回显 | AGENTS.md 红线 5 |
| 在生产 Pages 站点上跑写操作类用例而不换仓库 | 生产站点 + 默认配置 = 写生产数据仓库 |
| 在文档里沿用 `?v=` / `bump-version.sh` / `data/workbench.json` / `/graph` 路由 / `WB.*` 全局等已废弃概念 | 2026-07-31 重构已移除，详见 `architecture.md` §12 与本文 §一.0 |

### 6. 测试产物

| 产物 | 位置 | 说明 |
|------|------|------|
| 勾选后的用例清单 + 实际结果 | `.harness/plans/<任务目录>/06-it.md` | 唯一正式记录 |
| 测试仓 commit 链接 / SHA | 同上，逐条贴 | 写操作类用例的硬证据 |
| 诊断五步输出、关键 toast / phase 文案 | 同上，文本或截图 | 失败类用例的硬证据 |
| DevTools Network 截图 | 同上（token 需脱敏） | 状态码 / 代理走向 |
| JSON / JUnit 报告 | **无** | 无 E2E runner，不存在机器可读报告 |

### 7. CI 集成与自动化演进（现状 + 建议）

**现状（如实）**：CI **有**但仅做构建发布——`.github/workflows/deploy.yml` 在 `push main` 时 `npm ci` → `npm run build`（含 `vue-tsc --noEmit` 类型检查）→ 上传 `dist/` → Pages 发布。**CI 当前未接入 `npm test`，也不跑 E2E 集成测试**（见 `unittest.md` §三.6）。因此：

- IT **不由任何流水线自动触发**，不构成合入阻塞；
- IT 是否执行、执行到什么程度，由 SOP 06 阶段人工（或 AI 经 `web-access`）把关并记录在 `06-it.md`；
- 涉及**同步 / 合并 / 代理 / 缓存**的改动，IT 视为**必做**；仅改样式或文案的改动可按 `06-it.md` 备注理由裁剪。

**未来自动化（未采用 / 仅为建议，落地前须获维护者拍板）**：

| 方案 | 收益 | 阻碍 | 状态 |
|------|------|------|------|
| Playwright 驱动真实浏览器跑 §二.4 清单 | 同步 / 合并 / 降级用例可回归自动化，多 profile 天然支持 | 需要 Node + npm 依赖（Vitest 已引入，但 Playwright 仍属新增评估项） | ❌ 未采用 |
| 用 GitHub Actions 定时跑同步冒烟 | 无人值守发现 API/权限漂移 | 需引入 workflow + secrets | ❌ 未采用 |
| 在 CI 加 `npm test` 跑单元套件 | 防回归门禁 | 需修改 `deploy.yml`（独立提案） | ❌ 未采用（建议） |

> 在维护者明确决策前，**不要**在任务中擅自引入上述任何一项，也不要在文档里把它们写成现状。

---

## 四、与 SOP 阶段的关系

| 阶段 | 引用本文的方式 |
|------|---------------|
| **02 Plan** | 按 §二.2 的分组与 §二.3 四维度列出本次任务需要跑的 IT 编号（可复用既有编号，也可新增）；同时依 §二.8 划清与 UT §6 的分层 |
| **05 Deploy** | 本项目**无独立测试环境**：Deploy 实际动作 = 起本地 dev server（`npm run dev` → `:5173`，必要时 `npm run build` 部署预览），并完成 §一.4 的前置检查 |
| **06 IT** | 复制 §二.4 相关分组到 `06-it.md` 逐条执行（AI 经 `web-access` 或手动浏览器）；每条按 §二.5 留证据；失败按 §三.4 定位 |
| **07 Docs** | 若本次任务新增 / 修改了链路行为（新增同步字段、改合并语义、改代理白名单、改缓存策略），必须回头更新本文清单与 §二.8 边界表 |
| **09 Commit** | 本项目无环境池，无需释放测试环境；但**必须**确认测试 PAT 已撤销或将过期，且未把 token / 测试仓地址硬编码进任何提交内容 |
