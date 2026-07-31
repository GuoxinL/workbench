# 集成测试规范（环境 / 用例 / 运行调试）

> 让任意成员（或 AI Agent）能在**真实链路**上把本项目的集成测试**搭起来、测得对、跑得通、出错查得到**。
> 三段式结构：① 环境与依赖 / ② 用例设计与组织 / ③ 运行与调试。
>
> **与单元测试的边界**（详见 §二.8）：
> - 单元测试（`.harness/docs/unittest/unittest.md`）：函数 / 模块级，**禁止**真实外部调用，全部 Mock。
> - 集成测试（本文）：**浏览器 UI → store/localStorage → github.js →（可选 Worker 代理）→ GitHub Contents API → 数据仓库 JSON 文件**的真实端到端链路。
>
> **若仓库出现 `.codebuddy/rules/integration_test_*.md` 或同义命名（`it_*.md`），那是权威来源**：本文以摘录 + 链接形式承接。
> 2026-07-31 核查：仓库**不存在** `.codebuddy/rules/` 目录，故本文即当前基线。

> Source: `js/github.js`、`js/store.js`、`js/app.js`、`index.html`（设置抽屉 + `?v=` 版本参数）、`proxy/cloudflare-worker.js`、`bump-version.sh`、`README.md`、`.harness/docs/architecture.md`
> Last-verified: 2026-07-31（对应 commit `cf46195`）

---

## 一、环境与依赖

### 0. 当前自动化现状（如实记录，勿据此臆造命令）

2026-07-31 全量核查结论：

| 核查项 | 结论 | 证据 |
|--------|------|------|
| 测试框架 | **无** | 无 `package.json` / `node_modules` / 任何 runner |
| 测试文件 | **无** | `git ls-files` 无 `*test*` / `*spec*` 命中 |
| `_wbtest.py` | **不存在** | 工作区、`git ls-files`、`git log --all` 三处均无该文件；全仓库无任何 `.py` 文件。**它不是本项目的测试脚本，请勿引用** |
| CI 流水线 | **无** | 无 `.github/workflows/`，质量门禁只有本地 git hooks（`scripts/pre_*.sh`） |
| E2E 工具 | **无** | 无 Playwright / Cypress / Selenium 痕迹 |

> **因此：本项目当前的集成测试形态 = 「以手动验收清单为主」**，核心产出是 §二.4 的可勾选清单。
> 本文**不提供** `make it` / `npm run e2e` 之类命令——它们在本项目中不存在。自动化方案见 §三.7（标注为**未采用 / 建议**）。

### 1. 集成测试形态判定

| 形态 | 本项目是否适用 | 权重 | 说明 |
|------|--------------|------|------|
| **前端 E2E**（UI → 持久化 → 远端） | ✅ 适用 | **主**（手动执行） | 唯一真实链路，从浏览器 DOM 操作一路验到仓库 JSON |
| **接口级 IT**（GitHub Contents API 往返） | ✅ 适用 | **辅** | 作为 E2E 的**断言手段与环境准备**（curl 读写测试仓校验结果），不单独当作 IT 通过依据 |
| **代理级 IT**（Cloudflare Worker 白名单） | ✅ 适用 | 辅 | 可脱离浏览器用 curl 直接验白名单 / CORS |
| 数据库 IT | ❌ 不适用 | — | 无数据库，持久化 = localStorage + 单个 JSON 文件 |
| 消息 / 异步 IT | ❌ 不适用 | — | 无 MQ。异步只有防抖 1.5s 推送 / 20s 轮询，归入 E2E 时序用例 |
| 多服务链路 IT | ❌ 不适用 | — | 纯客户端单体，无服务间调用（见 `@.harness/docs/architecture.md` §1、§6） |

### 2. 测试环境信息

> 环境的「如何搭 / 如何部署」在 devops 文档，本节只记录**集成测试需要的环境形态与连通信息**。
> 引用（不复制）：`@.harness/docs/devops/env.md`（本地环境）、`@.harness/docs/devops/development.md`（改码 → 刷新 → bump 流程）、`@.harness/docs/devops/deployment.md`（Pages / Worker 部署）、`@.harness/docs/devops/test-env-deploy.md`（团队环境管理 Skill 通用流程）、`@.harness/docs/relationship.md`（上下游依赖）。
> ⚠️ 上述 devops 文档与 `relationship.md` 目前多数章节仍为**未填充模板**；填充完成后以它们为权威，本节只保留 IT 视角的差异项。

| 项 | 本项目实际值 |
|----|-------------|
| 环境名称 / 类型 | **无独立测试环境**。IT 跑在「本地静态服务 + 专用测试数据仓库」组合上；也可用 Pages 生产站点 + 测试仓（仅验缓存 / PWA 类用例） |
| 被测前端入口 | `python3 -m http.server 8000` → `http://localhost:8000`（详见 `@.harness/docs/devops/development.md`） |
| 远端依赖 | GitHub Contents API `https://api.github.com`（唯一强依赖，见 `@.harness/docs/relationship.md`） |
| 数据落点 | **测试专用**私有仓库的 `data/workbench.it.json`（**不是**生产的 `GuoxinL/workbench-data`） |
| 鉴权方式 | 测试专用 Personal Access Token（细粒度，仅授权测试仓，`Contents: Read and write`） |
| 运行时配置位置 | 浏览器 localStorage `wb.cfg.v1`，经**设置抽屉**（`index.html:208-265`）填写；仓库内**无任何环境配置文件** |
| 数据隔离策略 | 独立仓库 + 独立文件路径 + 独立分支（三重）；多端并发用**两个浏览器 profile / 隐身窗口**隔离 localStorage |
| 清理策略 | 手动：用例后重置 `data/workbench.it.json`、清空浏览器 localStorage；整轮结束后**撤销测试 PAT** |
| 可选组件 | 自部署 Cloudflare Worker（仅 `IT-PROXY-*` 用例需要，见 `proxy/cloudflare-worker.js`） |

### 3. 环境隔离硬约束（本项目最容易踩的坑）

| # | 约束 | 原因 |
|---|------|------|
| 1 | **必须显式填写测试仓与测试路径，不得留空** | `readCfg()`（`js/app.js:231-233`）与 `normCfg()`（`js/github.js:34-41`）对 repo / branch / path **空值回落到 `DEFAULT_CFG`**，即生产仓 `GuoxinL/workbench-data` + `data/workbench.json`（`js/store.js:31-39`）。留空跑 IT = **直接写生产数据仓库** |
| 2 | **禁止用日常使用的 PAT** | IT 会向仓库写真实 commit；专用 token 便于一键撤销、限制爆炸半径 |
| 3 | 测试仓必须**私有** | 与生产同理（README.md:59-60）；IT 造的假数据同样不该公开 |
| 4 | 多端场景用独立浏览器 profile，**不要**用同一 profile 的两个标签页 | 同 profile 共享 localStorage，无法真实模拟"两个设备各持一份本地副本" |
| 5 | Token **禁止**出现在 `06-it.md`、截图、日志、命令回显中 | AGENTS.md 红线 5；记录时脱敏为 `github_pat_****` |
| 6 | IT 结束后撤销测试 PAT，或至少签发时设短有效期 | 细粒度令牌可设过期时间，降低遗留风险 |

### 4. 前置依赖检查清单（先查再动，任一项通过就跳过对应准备）

> 以下命令用于**准备与校验环境**，不是被测链路本身——被测链路必须从浏览器 UI 触发。
> 先在 shell 里导出变量（**不入库、不回显**）：
> `export WB_IT_REPO='<owner>/workbench-data-it' WB_IT_PATH='data/workbench.it.json' WB_IT_BRANCH='main'`
> `read -rs WB_IT_TOKEN && export WB_IT_TOKEN`

```bash
# (1) 本地静态服务已起
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:8000/index.html
# 期望 200；否则在仓库根执行：python3 -m http.server 8000

# (2) 静态资源版本号已刷新（避免踩 AGENTS.md 红线 3：浏览器命中旧代码）
grep -o 'wb-version" content="[^"]*"' index.html; grep -c '?v=' index.html
# 期望 meta 版本与全部 ?v= 参数一致；不一致先跑 ./bump-version.sh
#   ⚠️ bump-version.sh 用 BSD sed（sed -i ''），Linux/WSL 会报错，需改用 GNU 写法 sed -i -E（见 AGENTS.md）

# (3) 测试仓可达且令牌有写权限（只打印布尔，不打印 token）
curl -sS -H "Authorization: Bearer $WB_IT_TOKEN" \
     -H 'Accept: application/vnd.github+json' \
     "https://api.github.com/repos/$WB_IT_REPO" \
  | grep -o '"push":[a-z]*'
# 期望 "push":true；false 或 404 → 令牌未授权该仓 / 仓库名写错

# (4) 测试数据文件基线（拿到 sha，或确认尚未创建）
curl -sS -H "Authorization: Bearer $WB_IT_TOKEN" \
     "https://api.github.com/repos/$WB_IT_REPO/contents/$WB_IT_PATH?ref=$WB_IT_BRANCH" \
  | grep -o '"sha": *"[^"]*"' || echo "文件尚未创建（IT-SYNC-01 正需要这个状态）"

# (5) 剩余 API 配额（限流类用例前必查）
curl -sS -H "Authorization: Bearer $WB_IT_TOKEN" https://api.github.com/rate_limit \
  | grep -o '"remaining":[0-9]*' | head -1
# 认证配额 5000/h；余量过低时暂停 IT，避免把限流误判成功能缺陷

# (6) 仅 IT-PROXY-* 需要：自部署 Worker 可达
curl -sS -o /dev/null -w '%{http_code}\n' "$WB_IT_PROXY/rate_limit"
```

判断逻辑：某项失败 → **只修复失败项**，不要重置整个环境。

### 5. 环境变量与配置说明

| 变量 | 用途 | 备注 |
|------|------|------|
| `WB_IT_REPO` | 测试数据仓库 `owner/repo` | 仅供准备 / 断言脚本使用 |
| `WB_IT_PATH` | 测试数据文件路径 | 建议 `data/workbench.it.json`，与生产文件名区分 |
| `WB_IT_BRANCH` | 测试分支 | 默认 `main`；也可用独立 `it` 分支加一层隔离 |
| `WB_IT_TOKEN` | 测试专用 PAT | **只经 `read -rs` 输入或从密码管理器注入**，禁止写进 shell 历史 / 仓库 / `06-it.md` |
| `WB_IT_PROXY` | 自部署 Worker 地址 | 仅 `IT-PROXY-*` 用例需要 |

> **被测应用本身不读任何环境变量**——它的全部运行时配置在浏览器 localStorage `wb.cfg.v1`，由设置抽屉写入。
> 若需要落 `.env.local` 之类文件，**必须先确认已被 `.gitignore` 覆盖**再创建。

---

## 二、用例设计与组织

### 1. 通用强制条款（红线）

| # | 红线 | 本项目具体含义 |
|---|------|--------------|
| 1 | **禁止**指向生产资源 | 禁止把 `repo` / `path` 指向 `GuoxinL/workbench-data` + `data/workbench.json`；**留空即生产**（见 §一.3 约束 1） |
| 2 | **禁止**使用真实日常凭证 | 只用测试专用 PAT |
| 3 | **禁止**遗留脏数据 | 每条用例自带前置（清 localStorage / 重置远端文件）与收尾 |
| 4 | **禁止**用例间共享可变状态 / 依赖执行顺序 | 例外：`IT-MERGE-*` 天然需要"两端"状态，须在用例内自建两端，不得复用上一条的残留 |
| 5 | **禁止**硬编码仓库名 / 令牌 / 代理地址到文档或脚本 | 一律走 `WB_IT_*` 变量占位 |
| 6 | **禁止**在浏览器 console 里直接调 `WB.store.*` / `WB.gh.*` 造数据后宣布用例通过 | 那是 UT 层的事；IT 必须从**真实入口**（UI 操作 / 定时器 / 可见性事件 / 网络事件）触发。console **只允许用于观测**（读 `localStorage`、看 `WB.gh.status()`） |
| 7 | **必须**留可追溯证据 | 本项目**无 reqid / traceID**（无后端，见 `@.harness/docs/architecture.md` §9）。替代凭证见 §二.5 |
| 8 | **必须**为写操作确认目标 | 每条会产生 commit 的用例，执行前先核对设置抽屉里的仓库名确实是测试仓 |

### 2. 用例类型与组织方式

| 类型 | 编号前缀 | 覆盖内容 |
|------|---------|---------|
| 同步往返 | `IT-SYNC-` | 首次创建、防抖推送、轮询拉取、前台唤醒、手动同步 |
| 冲突与合并 | `IT-MERGE-` | 逐条 LWW、墓碑传播、sha 乐观锁重试、墓碑清理 |
| 异常与降级 | `IT-FAIL-` | 令牌失效 / 权限不足 / 404 / 限流 / 网络不可达 / 脏 JSON / 本地模式 / 离场保护 |
| 代理链路 | `IT-PROXY-` | Worker 路径白名单、Origin 白名单、经代理同步 |
| 视图一致性 | `IT-VIEW-` | 拉取数据后的列表 / 双链反链 / 图谱 / 改名联动 / XSS 转义 |
| 缓存与 PWA | `IT-PWA-` | `?v=` 版本刷新、添加到主屏幕、已知离线限制 |

**组织方式**：仓库无测试文件，因此**用例清单即 §二.4 本节**；每次任务的**执行记录**写到 `.harness/plans/<任务目录>/06-it.md`（本文写"规则与清单"，`06-it.md` 写"本次结果"）。新增用例 → 追加到本文对应分组末尾并递增编号，**不复用已废弃编号**。

### 3. 用例设计自检（四维度）

| 维度 | 本项目检查点 |
|------|-------------|
| **输入** | UI 输入（标题 / Markdown / `[[双链]]` / 特殊字符）、配置输入（仓库 / 分支 / 路径 / 轮询秒数边界 5–300） |
| **状态** | 三处前置必须明确：① 本地 localStorage（空 / 有数据 / dirty）② 远端 JSON（不存在 / 有基线 / 被改脏）③ 网络（正常 / 离线 / 走代理） |
| **依赖** | GitHub API 必须真实；限流与网络异常允许用 DevTools 模拟（须标注，见 §二.6） |
| **断言** | 不止看 UI toast，还要断言**副作用**：远端 commit 是否产生、JSON 内容、`wb.dirty` 值、顶栏同步胶囊状态、另一端是否收敛 |

### 4. 手动集成测试检查清单（**核心产出**，共 29 条）

> 用法：复制本节到 `06-it.md`，逐条勾选并补「实际结果 / 证据」。
> 通用前置（每条用例开始前）：本地服务已起 → 打开目标浏览器 profile → 设置抽屉确认指向**测试仓 + 测试路径** → 按用例要求准备 localStorage 与远端文件。
> 「端 A / 端 B」= 两个独立浏览器 profile（或一台电脑 + 一部手机）。

#### A. 同步往返（IT-SYNC）

- [ ] **IT-SYNC-01 首次同步自动创建远端数据文件**
  - 前置：远端 `$WB_IT_PATH` 不存在（§一.4 检查 4 返回未创建）；本地有若干待办 / 笔记
  - 步骤：设置抽屉 → 填测试仓 / 分支 / 路径 / 测试 PAT → 勾选「启用同步」→ 点「保存并同步」
  - 断言：toast「同步完成，已写入 `<测试仓>`」；测试仓新增 1 个 commit；文件内容仅含 `version / updatedAt / todos / notes` 四个顶层字段，**绝不含 token / apiBase / cfg**（`js/store.js:312-321`）

- [ ] **IT-SYNC-02 本地新增待办经防抖推送到远端**
  - 前置：同步已启用且状态为「已同步」
  - 步骤：待办视图输入标题 → 回车 → 静置 ≥2s（防抖 1.5s，`js/github.js:237`）
  - 断言：顶栏胶囊经「同步中」→「已同步」；测试仓新增 commit，JSON 中出现该 todo 且 `deleted:false`；`localStorage['wb.dirty']` 回到 `'0'`

- [ ] **IT-SYNC-03 远端变更经轮询拉取到本端**
  - 前置：端 A、端 B 均已配置同步；轮询间隔设为 5s（下限，`js/github.js:244`）
  - 步骤：端 A 新增一条待办并等待推送完成 → 端 B 保持页面**可见**，静置 ≥ 2 个轮询周期
  - 断言：端 B 无需刷新即出现该待办；端 B 未产生多余 commit（无本地变更时不应推送，`js/github.js:169-181`）

- [ ] **IT-SYNC-04 回到前台立即同步**
  - 前置：端 B 页面切到后台（`document.hidden`）；期间端 A 新增数据
  - 步骤：把端 B 切回前台（触发 `visibilitychange`，`js/app.js:44-46`）
  - 断言：**立即**（不等下一个轮询周期）出现同步中状态并拉到端 A 的新数据

- [ ] **IT-SYNC-05 手动点同步胶囊（含编辑器落盘）**
  - 前置：在笔记编辑器中输入内容但**不失焦**（内容尚在防抖窗口内）
  - 步骤：直接点顶栏同步胶囊
  - 断言：编辑中的内容被 `WB.notes.flush()` 强制落盘后一并推送（`js/app.js:97`）；toast「已同步到 GitHub」；远端 JSON 含刚输入的正文

#### B. 冲突与合并（IT-MERGE）

- [ ] **IT-MERGE-01 两端编辑不同条目 → 双方都保留**
  - 前置：端 A / 端 B 均已同步到同一基线（同一份远端 JSON）
  - 步骤：断开两端同步（先关「启用同步」）→ 端 A 改待办 X、端 B 改待办 Y → 依次重新启用同步
  - 断言：远端与两端最终都同时包含 X、Y 的新值，无覆盖丢失（逐条 LWW，`js/store.js:265-294`）

- [ ] **IT-MERGE-02 两端编辑同一条目 → updatedAt 大者胜（预期丢弃较早写入）**
  - 前置：同上基线
  - 步骤：两端离线各改**同一条**待办的标题 → 先让端 A 同步，再让端 B 同步
  - 断言：最终值为 `updatedAt` 更大的那次修改；较早写入被丢弃。**这是设计取舍而非缺陷**（README.md:138、`@.harness/docs/architecture.md` §5），用例的作用是确认"不出现数据结构损坏 / 半条记录"

- [ ] **IT-MERGE-03 一端删除、另一端未删 → 墓碑传播**
  - 步骤：端 A 删除一条待办并同步 → 端 B 拉取
  - 断言：端 B UI 中该条消失；远端 JSON 中该记录仍在但 `deleted:true` 且 `updatedAt` 已刷新（`js/store.js:186-192`）；端 B **不会**把它"复活"推回

- [ ] **IT-MERGE-04 sha 乐观锁冲突自动重试**
  - 步骤：两端几乎同时（间隔 <1s）各自新增一条待办并触发推送
  - 断言：DevTools Network 中可见某端的 `PUT` 返回 409/422，随后 350ms×attempt 退避重新 `GET` 再 `PUT`，最终成功（≤3 次，`js/github.js:139-143,192-197`）；两条待办**都**存在于远端；无「多次提交冲突，已放弃本次同步」

- [ ] **IT-MERGE-05 30 天墓碑在序列化时被清理**
  - 前置：手工编辑远端 `$WB_IT_PATH`，塞入一条 `deleted:true` 且 `updatedAt` 早于 31 天前的记录
  - 步骤：本端拉取合并 → 制造任意本地改动触发一次推送
  - 断言：新推上去的 JSON 中该墓碑记录已消失（`js/store.js:312-321`），其它记录不受影响

#### C. 异常与降级（IT-FAIL）

- [ ] **IT-FAIL-01 Token 失效**
  - 步骤：在 GitHub 后台撤销测试 PAT → 回到应用触发一次同步 → 再点设置抽屉「诊断」
  - 断言：顶栏红点 +「同步失败」；toast 含 `Token 无效或已过期`（`js/github.js:98`）；诊断在第 3 步「令牌有效性」失败并中断（`js/github.js:318-330`）

- [ ] **IT-FAIL-02 令牌只读、无写权限**
  - 前置：另签一枚仅 `Contents: Read` 的测试令牌
  - 步骤：填入后点「测试连接」
  - 断言：提示 `Token 对该仓库没有写入权限`（`js/github.js:265-267`）；诊断第 4 步「仓库访问」失败并给出「需 Contents: Read and write」

- [ ] **IT-FAIL-03 仓库 / 分支不存在**
  - 步骤：把仓库名改成不存在的 `<owner>/no-such-repo-it`（**注意不能留空，留空会回落到生产仓**）→ 保存并同步
  - 断言：错误文案 `仓库或分支不存在，或 Token 无该仓库权限`（`js/github.js:100`）；诊断第 4 步给出细粒度令牌 Repository access 的提示

- [ ] **IT-FAIL-04 API 限流（403 rate limit）**
  - 说明：真实 5000/h 配额难以自然触发 → 用 **DevTools Local Overrides / 请求拦截**把 `GET contents` 响应改为 `403` + body `{"message":"API rate limit exceeded"}`
  - 断言：错误文案 `API 调用频率超限，请稍后再试`（`js/github.js:99`）；状态置 error 且**不**丢失本地数据
  - 备注：属**模拟**用例，必须在 `06-it.md` 标注「DevTools 模拟」；无条件模拟时可标 SKIP + 原因

- [ ] **IT-FAIL-05 网络不可达与恢复**
  - 步骤：DevTools → Network → Offline → 触发同步 → 观察 → 恢复 Online
  - 断言：报网络类文案（`无法连接 api.github.com：…请在设置里填写 API 代理地址`，`js/github.js:82-84`；或 12s 超时文案 `js/github.js:74-77`）；**本地编辑仍完全可用**，`wb.dirty` 保持 `'1'`；恢复 Online 后 `online` 事件触发自动同步（`js/app.js:47`）并转绿

- [ ] **IT-FAIL-06 远端 JSON 被写坏**
  - 前置：手工把 `$WB_IT_PATH` 内容改成非法 JSON（如删掉一个 `}`）
  - 步骤：触发同步
  - 断言：文案 `远端数据文件不是合法 JSON，请检查 <path>`（`js/github.js:119`）；**本地数据未被清空 / 未被覆盖**

- [ ] **IT-FAIL-07 未配置或关闭同步 → 本地模式功能完整**
  - 步骤：设置抽屉取消「启用同步」并保存 → 正常使用待办 / 笔记 / 图谱
  - 断言：顶栏显示「本地模式」（`js/app.js:113`）；增删改查、双链、图谱全部可用；刷新页面数据仍在（localStorage）；**不发起任何 GitHub 请求**（Network 面板为证）

- [ ] **IT-FAIL-08 离场保护**
  - 前置：同步已启用，存在未推送变更（`wb.dirty === '1'`）
  - 步骤：直接关闭标签页 / 刷新
  - 断言：弹出原生确认框「还有变更未同步到 GitHub，确定离开？」（`js/app.js:48-55`）；取消后留在页面且数据完好

#### D. 代理链路（IT-PROXY，需自部署 Worker）

- [ ] **IT-PROXY-01 经 Worker 完成同步**
  - 步骤：设置抽屉「API 代理地址」填 `$WB_IT_PROXY` → 点「诊断」→ 保存并同步
  - 断言：诊断 5 步全绿，第 2 步显示「（经代理）」（`js/github.js:312`）；同步成功且测试仓产生 commit；Network 面板中所有请求指向 Worker 域名而非 `api.github.com`

- [ ] **IT-PROXY-02 路径白名单拦截**
  - 步骤：`curl -sS "$WB_IT_PROXY/user"`（`/user` 不在白名单，`proxy/cloudflare-worker.js:20-25`）
  - 断言：HTTP 403，body 含 `该接口未在代理白名单内：/user`

- [ ] **IT-PROXY-03 Origin 白名单拦截**
  - 步骤：`curl -sS -o /dev/null -w '%{http_code}\n' -H 'Origin: https://evil.example.com' "$WB_IT_PROXY/rate_limit"`
  - 断言：HTTP 403，body 含 `来源未被允许`（`proxy/cloudflare-worker.js:55-60`）
  - 备注：若你的 Worker 把 `ALLOW_ORIGINS` 置空数组则该用例不适用，需在 `06-it.md` 标注 N/A

#### E. 数据加载后的视图一致性（IT-VIEW）

- [ ] **IT-VIEW-01 空本地拉取远端后列表一致**
  - 前置：端 B 清空全部 localStorage（含 `wb.seeded`，否则会塞示例数据，`js/app.js:22-25`）
  - 步骤：配置同步 → 首次拉取
  - 断言：待办 / 笔记条数与远端 JSON 中 `deleted:false` 的记录数**逐一相等**；顶部统计数字一致

- [ ] **IT-VIEW-02 跨端双向链接与反链正确**
  - 步骤：端 A 新建笔记「甲」，正文含 `[[乙]]`，并新建笔记「乙」→ 同步 → 端 B 拉取
  - 断言：端 B 中「甲」正文里 `[[乙]]` 渲染为可点击链接并能跳转；打开「乙」时反链面板列出「甲」及上下文摘录

- [ ] **IT-VIEW-03 图谱与双链数据一致**
  - 步骤：端 B 拉取上述数据后切到图谱视图
  - 断言：节点数 = 未删除笔记数；甲→乙 存在连线；正文中引用了不存在标题的链接显示为「待创建 / missing」而非报错；点击节点能跳转到对应笔记

- [ ] **IT-VIEW-04 改标题联动改引用后跨端仍正确**
  - 步骤：端 A 把笔记「乙」改名为「乙2」（触发 `renameRefs`，`js/notes.js:264-304`）→ 同步 → 端 B 拉取
  - 断言：端 B 中「甲」的正文已变为 `[[乙2]]`，链接仍可跳转，反链面板仍显示「甲」；该批量改动在远端只体现为**一次**推送（`S.batch()` 只 commit 一次）

- [ ] **IT-VIEW-05 跨端同步后的 XSS 转义（端到端）**
  - 步骤：端 A 新建笔记，正文写入 `<img src=x onerror=alert(1)>` 与 `<script>alert(2)</script>` → 同步 → 端 B 拉取并打开该笔记与图谱
  - 断言：端 B 中两段内容**以纯文本呈现**，无弹窗、无 DOM 注入（`js/markdown.js:45`、`js/util.js:60-64`、`js/graph.js:147`）；把标题也设为 `<script>` 时图谱节点标签同样为纯文本
  - 与 UT 边界：UT 测 `WB.md.render()` 的**返回字符串**；本条测跨端往返后**页面实际不执行脚本**

#### F. 缓存与 PWA（IT-PWA）

- [ ] **IT-PWA-01 版本号刷新生效**
  - 步骤：改动任意 `js/*.js` → 执行 `./bump-version.sh`（Linux/WSL 需用 GNU sed 等效命令）→ 部署 / 刷新页面 → 打开设置抽屉
  - 断言：`index.html` 中全部 `?v=` 与 `wb-version` meta 为同一新时间戳；设置抽屉标题旁显示 `v<新版本>`（`js/app.js:204-206`）；DevTools Network 中 js 为新请求而非 `from disk cache`
  - 备注：这是 AGENTS.md **红线 3** 的验收动作，任何涉及 js/css 的任务都应跑

- [ ] **IT-PWA-02 添加到主屏幕可正常启动**
  - 步骤：移动端浏览器打开 Pages 站点 → 添加到主屏幕 → 从桌面图标启动
  - 断言：以独立窗口打开、图标与名称来自 `manifest.json`、数据与浏览器内一致（同源共享 localStorage）

- [ ] **IT-PWA-03 离线打开的已知限制（负向确认）**
  - 步骤：断网后从主屏图标启动
  - 断言：白屏 / 无法加载。**这是已知限制而非缺陷**——项目无 Service Worker（`@.harness/docs/architecture.md` §12）。本条用于确认现状未被误判成回归；若某次改动后离线可用了，说明引入了 SW，需回头更新架构文档

### 5. 可追溯证据要求（本项目的 reqid 替代物）

本项目无后端、无 traceID。每条已执行用例在 `06-it.md` 中至少记录以下 3 类证据之一（写操作类必须含前两项）：

| 证据 | 获取方式 |
|------|---------|
| **测试仓 commit SHA + 提交时间** | 测试仓 commits 列表；commit message 形如 `workbench: sync <本地时间>`（`js/github.js:127`） |
| **DevTools Network 记录** | 请求 URL（脱去 token）、HTTP 状态码、`x-ratelimit-remaining` 响应头 |
| **诊断五步输出** | 设置抽屉「诊断」按钮的逐步结果文本（`js/github.js:284-368`） |
| 状态快照 | 顶栏胶囊文案、`localStorage['wb.dirty']`、`WB.gh.status()` 返回值 |

### 6. Mock / 桩策略

| 类别 | 默认策略 |
|------|---------|
| GitHub Contents API | **真实调用**（测试仓）。禁止在 IT 中 stub `WB.gh` 或替换 `fetch` |
| Worker 代理 | 真实自部署实例；无实例时 `IT-PROXY-*` 整组标 N/A，不得伪造 |
| 网络异常 / 超时 | 用 DevTools **Offline / 限速 / 请求拦截**制造，属真实浏览器行为，可接受 |
| 限流 403、异常状态码 | 用 DevTools **Local Overrides** 改写响应；**必须**在用例结果中标注「模拟」 |
| 时间（30 天墓碑等） | 不改系统时钟；改**数据**（构造远端 JSON 中的旧 `updatedAt`），见 IT-MERGE-05 |
| 本地存储 | 不 mock；直接用浏览器 profile / 隐身窗口做隔离 |

### 7. 与项目 rules 承接

- 仓库出现 `.codebuddy/rules/integration_test_*.md` / `it_*.md` 时，本文 §二 改为指向该 rules 锚点，不重复维护。
- 当前（2026-07-31）无该目录，本文即基线。
- 与 `.harness/plans/_template/06-it.md` 配套：本文写「规则 + 清单」，`06-it.md` 写「本次任务的执行结果」。

### 8. 与单元测试的分层边界（禁止重叠）

| 逻辑 | 归属 UT（Mock / 函数级） | 归属 IT（真实链路 / 端到端） |
|------|------------------------|---------------------------|
| `store.mergeInto` 的 LWW 分支、边界 | ✅ 直接喂两个对象断言返回值与结果数组 | ❌ 不在 IT 逐分支验 |
| `store.serialize` 墓碑 cutoff 计算 | ✅ 构造时间戳断言输出 | 仅 IT-MERGE-05 验"真实同步后墓碑确实消失" |
| `markdown.render` 语法子集 / 转义 | ✅ 输入输出字符串比对 | 仅 IT-VIEW-05 验"跨端后页面不执行脚本" |
| `util.slug` / `b64Encode` | ✅ | ❌ |
| `github.readErr` 状态码 → 文案映射 | ✅ 喂假 Response | IT 只验"真实触发该状态码时用户看到对应文案" |
| 冲突重试的**次数与退避** | ✅ 可 Mock fetch 验 3 次 | IT 验"真实并发下最终两条数据都在" |
| 顶栏状态机 / toast / 抽屉交互 | ❌ | ✅ |
| 跨端收敛、commit 是否产生、代理白名单 | ❌ | ✅ |

> 简记：**UT 管"函数算得对不对"，IT 管"从点击到仓库里那个文件对不对"。**

---

## 三、运行与调试

### 1. 标准执行流程（当前无自动化命令，按此顺序手动执行）

```bash
# ① 起本地静态服务（仓库根目录）
python3 -m http.server 8000

# ② 若本次任务改过 js/css：刷新静态资源版本号（AGENTS.md 红线 3）
./bump-version.sh
#   Linux/WSL（GNU sed）等效命令：
#   V="$(date +%Y%m%d-%H%M)"
#   sed -i -E "s/(\.(js|css))\?v=[0-9A-Za-z-]+/\1?v=$V/g" index.html
#   sed -i -E "s/(name=\"wb-version\" content=\")[^\"]+/\1$V/" index.html

# ③ 跑 §一.4 的 6 项前置检查

# ④ 浏览器打开 http://localhost:8000 ，按 §二.4 清单逐条执行并勾选
```

> **不存在** `make it` / `npm run test:e2e` / `go test -tags=integration` 等命令——本项目无构建系统与测试框架（§一.0）。

### 2. 环境准备与清理片段

```bash
# 重置远端测试数据文件为空基线（先取 sha，再 PUT 覆盖）
SHA=$(curl -sS -H "Authorization: Bearer $WB_IT_TOKEN" \
  "https://api.github.com/repos/$WB_IT_REPO/contents/$WB_IT_PATH?ref=$WB_IT_BRANCH" \
  | sed -n 's/.*"sha": *"\([^"]*\)".*/\1/p' | head -1)
BODY=$(printf '{"version":1,"updatedAt":0,"todos":[],"notes":[]}' | base64 | tr -d '\n')
curl -sS -X PUT -H "Authorization: Bearer $WB_IT_TOKEN" \
  -H 'Accept: application/vnd.github+json' -H 'Content-Type: application/json' \
  "https://api.github.com/repos/$WB_IT_REPO/contents/$WB_IT_PATH" \
  -d "{\"message\":\"it: reset baseline\",\"content\":\"$BODY\",\"branch\":\"$WB_IT_BRANCH\",\"sha\":\"$SHA\"}" \
  -o /dev/null -w 'reset=%{http_code}\n'
```

浏览器侧清理（DevTools Console，仅用于**准备 / 清理**，不作为用例步骤）：

```js
// 清空本应用全部本地状态（含示例数据种子标记），随后刷新页面
['wb.data.v1','wb.cfg.v1','wb.device.v1','wb.dirty','wb.view','wb.seeded']
  .forEach(k => localStorage.removeItem(k));
```

> ⚠️ 清空 `wb.cfg.v1` 会一并清掉测试 token，需重新在设置抽屉填写——这是刻意的，避免 token 长期残留在测试机上。

### 3. 调试套路

| 现象 | 优先排查 | 手段 |
|------|---------|------|
| 全部同步用例失败 | 配置 / 网络 / 令牌 | 先点设置抽屉「诊断」，五步会**在失败处中断并给出处置建议**（`js/github.js:284-368`） |
| **页面行为与仓库代码不一致** | 浏览器缓存旧 JS（AGENTS.md 红线 3 高发） | 查 `index.html` 的 `?v=`；DevTools 勾 Disable cache 强刷；确认设置抽屉显示的 `v<版本>` 是最新 |
| 报「同步失败」但网络正常 | 状态码语义 | Network 面板看真实状态码，对照 `js/github.js:93-103`：401→令牌、403+rate limit→限流、404→仓库/分支/权限 |
| 数据写到了意料之外的仓库 | 空值回落 | 检查设置里 repo/branch/path 是否留空 → 回落到生产默认值（§一.3 约束 1） |
| 两端数据不收敛 | `updatedAt` 与墓碑 | 对比两端 `localStorage['wb.data.v1']` 中同 id 记录的 `updatedAt` / `deleted`；LWW 只认更大的 `updatedAt` |
| 偶发失败（flaky） | 时序 | 防抖 1.5s、轮询最小 5s、`document.hidden` 时跳过轮询——断言前给足等待，不要 1s 内下结论 |
| 手动同步"没反应" | 并发排队 | 用户主动调用会**排在进行中的同步之后**再跑一次（`js/github.js:220-232`），属正常，等待即可 |
| 经代理时 403 | 白名单 | 对照 `proxy/cloudflare-worker.js:20-25`（路径）与 `:29-31`（Origin） |

### 4. 故障定位流程（本项目版，无 reqid）

```
用例失败
  → 设置抽屉「诊断」跑五步，定位断点（配置 / 网络 / 令牌 / 仓库权限 / 数据文件）
  → DevTools Network：看实际请求 URL（是否走代理）、方法、状态码、x-ratelimit-remaining
  → 测试仓 commits：确认这次操作到底有没有产生 commit、内容对不对
  → localStorage：对比 wb.data.v1（记录级 updatedAt / deleted）与 wb.dirty
  → 归因到模块：视图层(todos/notes/graph) / 数据层(store) / 同步层(github) / 代理(worker)
  → 修复后重跑该条用例 + 同组回归
```

> 失败处理原则与 `_template/06-it.md` 一致：环境问题 → 修复后重跑；代码问题 → 回 03-implement；设计问题 → 回 02-plan。

### 5. 不要 / 慎用

| 项 | 原因 |
|----|------|
| 把 repo / path 留空跑 IT | 会回落到**生产数据仓库**，直接污染真实数据 |
| 在 console 调 `WB.store.addTodo()` 造数据后勾选用例通过 | 绕过了 UI → store 这一段真实链路，等于没测 |
| 用同一浏览器 profile 的两个标签页模拟"两端" | 共享 localStorage，无法产生真正的并发冲突 |
| 用 `setTimeout` 心态"等等看"代替明确等待条件 | 应明确等待可观测信号：胶囊状态变化、Network 请求完成、远端 commit 出现 |
| 为让用例过而临时改被测代码 | 与 UT 红线一致，禁止 |
| 把 token 贴进 `06-it.md` / 截图 / 命令回显 | AGENTS.md 红线 5 |
| 在生产 Pages 站点上跑写操作类用例而不换仓库 | 生产站点 + 默认配置 = 写生产数据仓库 |
| 大量重跑限流相关用例 | 5000/h 配额耗尽会让后续用例全部误红 |

### 6. 测试产物

| 产物 | 位置 | 说明 |
|------|------|------|
| 勾选后的用例清单 + 实际结果 | `.harness/plans/<任务目录>/06-it.md` | 唯一正式记录 |
| 测试仓 commit 链接 / SHA | 同上，逐条贴 | 写操作类用例的硬证据 |
| 诊断五步输出、关键 toast 文案 | 同上，文本或截图 | 失败类用例的硬证据 |
| DevTools Network 截图 | 同上（token 需脱敏） | 状态码 / 代理走向 |
| JSON / JUnit 报告 | **无** | 无 runner，不存在机器可读报告 |

### 7. CI 集成与自动化演进（现状 + 建议）

**现状（如实）**：项目**无 CI 流水线**（无 `.github/workflows/`），质量门禁只有本地 git hooks（`scripts/pre_commit_check.sh` / `commit_msg_check.sh` / `pre_push_check.sh`）。因此：

- IT **不由任何流水线自动触发**，不构成合入阻塞；
- IT 是否执行、执行到什么程度，由 SOP 06 阶段人工把关并记录在 `06-it.md`；
- 涉及**同步 / 合并 / 代理 / 版本号**的改动，IT 视为**必做**；仅改样式或文案的改动可按 `06-it.md` 备注理由裁剪。

**未来自动化（未采用 / 仅为建议，落地前须获维护者拍板）**：

| 方案 | 收益 | 阻碍 | 状态 |
|------|------|------|------|
| Playwright 驱动真实浏览器跑 §二.4 清单 | 同步 / 合并 / 降级用例可回归自动化，多 profile 天然支持 | 需要 Node + npm 依赖，**直接冲突 AGENTS.md 红线 2**；可考虑放到**独立测试仓**、不进本仓，但仍需维护者同意 | ❌ 未采用 |
| 用 GitHub Actions 定时跑同步冒烟 | 无人值守发现 API/权限漂移 | 需引入 workflow + secrets，且本仓当前刻意无 CI | ❌ 未采用 |
| 浏览器内零依赖断言页（`test.html`） | 不违反红线 2 | 只能覆盖纯函数，属**UT** 范畴，解决不了真实链路问题 | ❌ 未采用（且不属 IT） |

> 在维护者明确决策前，**不要**在任务中擅自引入上述任何一项，也不要在文档里把它们写成现状。

---

## 四、与 SOP 阶段的关系

| 阶段 | 引用本文的方式 |
|------|---------------|
| **02 Plan** | 按 §二.2 的分组与 §二.3 四维度列出本次任务需要跑的 IT 编号（可复用既有编号，也可新增）；同时依 §二.8 划清与 UT §6 的分层 |
| **05 Deploy** | 本项目**无独立测试环境**：Deploy 实际动作 = 起本地静态服务（必要时 `./bump-version.sh` + 推 Pages 预览），并完成 §一.4 的 6 项前置检查 |
| **06 IT** | 复制 §二.4 相关分组到 `06-it.md` 逐条执行；每条按 §二.5 留证据；失败按 §三.4 定位 |
| **07 Docs** | 若本次任务新增 / 修改了链路行为（新增同步字段、改合并语义、改代理白名单），必须回头更新本文清单与 §二.8 边界表 |
| **09 Commit** | 本项目无环境池，无需释放测试环境；但**必须**确认测试 PAT 已撤销或将过期，且未把 token / 测试仓地址硬编码进任何提交内容 |
