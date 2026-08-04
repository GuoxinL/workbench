# 部署与运行规范

> 状态：已定稿（2026-08-04 对齐 Vue3 + Vite + TS + Pinia 重构后） | 维护者：Guoxin.Liu <lgx31@sina.cn>
>
> Source（以磁盘真实代码为准）：`package.json`、`vite.config.ts`、`.github/workflows/deploy.yml`、`proxy/cloudflare-worker.js`、`scripts/*.sh`、`src/services/github/*`、`src/services/sync/*`、`src/stores/data.ts`
> Last-verified: 2026-08-04

## 范围

本项目是**纯静态前端 PWA，零后端**。部署 = 推代码到 `main` → GitHub Actions 构建并发布到 GitHub Pages。

因此本文档**不适用**常规服务端那套（镜像/制品库、金丝雀灰度、探针、APM、HPA、DB 迁移），相关章节均如实标注「不适用」并给出本项目的等价手段，**不编造不存在的体系**。

配套：环境与配置项 → [env.md](env.md)；日常开发循环 → [development.md](development.md)；测试环境 → [test-env-deploy.md](test-env-deploy.md)。

## 1. 环境矩阵

本项目只有**两个真实环境**：本地和生产。**没有 test / pre（预发）环境**——单人自用工具，不存在 QA 流程与审批链。

| 环境 | 用途 | 地址 | 数据 | 访问方式 | 审批 |
|------|------|------|------|----------|------|
| 本地 | 开发与自验 | `http://localhost:5173`（`npm run dev`，Vite） | 本机浏览器 localStorage + IndexedDB；同步开关关闭即纯本地模式 | 本机 | 无 |
| ~~test~~ | **不存在** | — | — | — | — |
| ~~pre~~ | **不存在** | — | — | — | — |
| 生产 | 正式使用 | `https://guoxinl.github.io/workbench/` | 使用者私有仓库 `GuoxinL/workbench-data` 的 `kb/<id>.md` + `manifest.json` | 公网 HTTPS，任何人可打开页面（但看不到数据，数据需自己的 PAT） | 无（维护者本人推送即触发 CI 发布） |
| 代理 Worker（可选） | 网络访问不了 `api.github.com` 时的中转 | `https://<name>.workers.dev` | 无状态、不存储 | 由使用者自部署到自己的 Cloudflare 账号 | 无 |

**两个仓库不要搞混**：

| 仓库 | 内容 | 可见性 | 作用 |
|------|------|--------|------|
| `GuoxinL/workbench` | 代码（Vue3 + Vite 工程） | **公开**（Pages 免费托管要求） | 部署源，push `main` 即触发 Actions 构建发布 |
| `GuoxinL/workbench-data` | `kb/<id>.md` + `manifest.json` | **必须私有** | 待办 / 文章数据；Pages 站点公开，数据绝不能放这里 |

## 2. 制品

**有构建产物**——`npm run build` 由 Vite 产出 `dist/`（带内容 hash 的 `assets/index-*.js` / `*.css` + `index.html`）。CI 把 `dist/` 作为 Pages artifact 上传并发布。

| 项 | 本项目实际情况 |
|----|---------------|
| 构建产物 | `dist/`（Vite 构建；`base:'./'` 相对路径适配 `/workbench/` 子路径） |
| 制品仓库 | 无私有制品库；产物经 GitHub Actions 的 `upload-pages-artifact` 暂存并发布到 Pages |
| 命名规则 | 无语义化版本 tag。缓存失效**由 Vite 内容 hash 保证**，无需手工版本号 |
| 版本注入 | 无 `?v=` / `wb-version` 参数（旧 `bump-version.sh` 已随重构移除） |
| 保留策略 | 历史版本天然保留在 git 提交历史里，回滚 = `git revert` / 重推旧 commit |

> ⚠️ 缓存由构建机制保证，**无需、也不再支持**手工刷版本号。改任何源码后重新 `npm run build` 即产出带新 hash 的产物（见 [development.md](development.md)）。

## 3. 配置管理

### 配置中心

**无配置中心、无环境变量注入、无分环境配置文件**（仓库内不存在 `etc/`、`.env`、`*.yaml`）。

配置的三个载体（完整字段表见 [env.md](env.md) §3.2）：

1. **运行时配置** = 使用者浏览器 localStorage `wb.cfg.v1`（仓库 / 分支 / 令牌 / 轮询间隔 / API 代理地址 / 启用开关 / 可选公开库），通过页面 ⚙ 设置抽屉填写。**本地开发与生产用的是同一份代码、各自浏览器里各自的配置**，天然隔离。
2. **代理 Worker 常量** = `proxy/cloudflare-worker.js` 顶部的 `UPSTREAM` / `ALLOW` / `ALLOW_ORIGINS`，自部署时按需修改。
3. **本地 git 钩子环境变量** = `SKIP_PRE_COMMIT` / `SKIP_PRE_PUSH` 等，仅影响本地提交校验，与线上运行无关。

### 敏感配置

- **【禁止】** 把 GitHub PAT 写进源码、`wb.cfg.v1` 以外的任何位置、日志或任何提交内容（AGENTS.md 红线 5）。数据仓库/代码仓库一旦泄漏，等于交出 GitHub 账户写权限。
- **【必须】** 令牌只保存在使用者本机浏览器的 `wb.cfg.v1`；同步序列化只在远端写 `kb/<id>.md` + `manifest.json`，从结构上保证令牌不会随同步上传。
- **【必须】** 令牌权限最小化：细粒度 PAT → Repository access 只勾**数据仓库** → Permissions → Contents 设 **Read and write**。
- **【必须】** 代理地址只填自己部署的 Worker——代理能看到令牌明文，公共代理等同于交出令牌。
- **【建议】** 公共电脑用完在设置抽屉清空 token。
- 发布前自查命令见 [development.md](development.md)「本地自检命令」。

### 环境隔离

- 代码仓库（公开）与数据仓库（私有）物理分离，是本项目最核心的隔离手段。
- 想要一份"不污染真实数据"的验证数据，做法是**换一个数据仓库/分支**（如 `branch` 填 `test`），或干脆关闭同步开关跑纯本地模式。详见 [test-env-deploy.md](test-env-deploy.md)。

## 4. 发布流程

**有 CI 流水线（GitHub Actions），无审批、无灰度**。全流程：

```
1. 本地自验：npm run dev → 浏览器核验，功能正常
2. 提交前门禁：npm run type-check && npm test && npm run build（类型检查 + 测试 + 构建全过）
3. git add -A && git commit   （触发 pre-commit + commit-msg 钩子）
4. git push origin main       （触发 pre-push 钩子 + GitHub Actions）
5. Actions 自动：npm ci → npm run build（含 vue-tsc 类型检查）→ 上传 dist/ → deploy-pages
6. 等 1–2 分钟，GitHub Pages 发布完成
7. 线上核对：打开 https://guoxinl.github.io/workbench/ 确认页面与最新提交一致（产物带内容 hash）
```

**首次开启 Pages**（仅一次性配置）：仓库 → Settings → Pages → Build and deployment → Source 选 **GitHub Actions**（⚠️ 不要选「Deploy from a branch」，否则会托管源码而非构建产物，且 Pages 需能拿到 `dist/`）。`.nojekyll` 用于关闭 Jekyll。`vite.config.ts` 已设 `base:'./'`，产物用相对路径，**无需任何 base 配置**即可适配 `/workbench/` 子路径。

### 灰度阶梯阈值

**不适用**。静态站点单版本全量发布，无流量切分能力，也无指标可用于自动暂停。

### 回滚

无制品可回滚，回滚就是 git 操作：

```bash
# 方式一（推荐）：反向提交，历史可追溯
git revert <坏 commit>
git push origin main

# 方式二：把某个历史版本恢复后重新提交
git checkout <好 commit> -- src/ vite.config.ts
git commit -m "revert(release): 回退到 <好 commit> 的前端资源"
git push origin main
```

- **禁止** `git push --force` 到 `main`（会破坏 Pages 发布历史与他机 clone）。
- **数据不随代码回滚**：数据在 `workbench-data` 仓库的 `kb/<id>.md` + `manifest.json`，代码回滚不影响数据；数据要回滚请在该仓库按 commit 恢复，或用设置抽屉「导出备份」的 JSON 覆盖回去（导出的是本地 `wb.data.v1`）。

## 5. 健康检查

**无 liveness / readiness / startup 探针**（无服务端进程，Pages 由 GitHub 保障可用性）。等价手段：

| 检查项 | 方式 | 通过条件 |
|--------|------|----------|
| 站点可达 | `curl -s -o /dev/null -w "%{http_code}\n" https://guoxinl.github.io/workbench/` | `200` |
| 资源未 404 | 浏览器 DevTools → Network 无红条 | Vite 产物（`assets/index-*.js` / `*.css`）全 200 |
| 发布是否生效 | 浏览器打开页面，确认交互正常、无白屏 | 无控制台报错、应用正常挂载 |
| 同步链路健康 | 顶栏同步胶囊 / 设置抽屉「诊断」 | 绿点（已同步）/ 灰点（本地模式）；诊断五步全绿 |
| 令牌与写权限 | 设置抽屉「测试连接」 | 通过（内部校验 `permissions.push`，`src/services/github/diagnose.ts`） |

## 6. 监控告警

**无指标采集、无日志平台、无链路追踪、无 APM、无告警通道**（无后端，也无埋点）。项目唯一的运行状态可观测面：

| 观测面 | 位置 | 含义 |
|--------|------|------|
| 同步胶囊四态 | 页面顶栏（`src/components/common/SyncChip.vue`） | 本地模式 / 同步中 / 已同步 / 同步失败 |
| 五步诊断 | 设置抽屉 → 诊断（`src/services/github/diagnose.ts:runDiagnose`） | 配置检查 → 网络连通 → 令牌有效性 → 仓库写权限 → 数据文件，在失败处中断并给出处置建议 |
| 消息/弹层 | Element Plus 消息 / 弹层 | `ok` / `err` / `info` 三档用户可见反馈 |
| 浏览器 Console | DevTools | `console.warn`（本地数据/配置解析失败）、`console.error`（异常） |
| 数据变更历史 | 数据仓库 commit 列表 | 每次同步产生一次 commit，可完整回溯与恢复 |

告警靠使用者肉眼看红点——这是单人自用工具的合理取舍，不必补建监控体系。

## 7. 容量规划

无实例、无扩缩容概念。真实存在的容量上限有四个：

| 约束 | 上限 | 触发后的现象 | 应对 |
|------|------|-------------|------|
| GitHub API 配额 | 认证后 **5000 次/小时** | 报「API 调用频率超限」 | 调大轮询间隔（设置抽屉，默认 5s，允许 5–300s） |
| localStorage | 约 **5MB**（浏览器实现相关） | 写入失败，store 兜底 | 清理旧数据 / 导出备份后精简 |
| IndexedDB | 浏览器配额（通常数百 MB+） | 写入失败 | 一般不会触达；超大附件另寻方案 |
| GitHub Pages | 仓库 ≤1GB、月流量 100GB（GitHub 官方软限制） | 远未接近 | 无需处理 |

> 重构后远端按文章拆分为 `kb/<id>.md`，不再有「单 JSON 文件全量读写」的线性膨胀问题；`manifest.json` 仅存轻量索引。

## 8. 日志规范

- **无服务端日志、无日志文件、无留存策略**。日志只有浏览器 Console，随会话消失。
- **【禁止】** 输出令牌、完整配置对象（`store.cfg` 含明文 PAT）。
- 用户可见反馈一律走 Element Plus 消息/弹层，不用 `alert`。
- 完整规范见 [logging.md](../logging.md)。

## 9. 代理 Worker 部署（可选组件）

仅当诊断卡在「网络连通」——即浏览器根本连不上 `api.github.com` 时才需要。

```
1. 登录 dash.cloudflare.com → Workers & Pages → Create → Worker
2. 把 proxy/cloudflare-worker.js 全文粘贴进编辑器 → Deploy
3. 拿到形如 https://xxx.<name>.workers.dev 的地址
4. 填进工作台「设置 → API 代理地址」→ 点「诊断」，网络那一步应显示「经代理」
```

**部署前按需改两个常量**（`proxy/cloudflare-worker.js`）：

- `ALLOW_ORIGINS`：改成自己的 Pages 域名，限制谁能调用这个 Worker。留空数组=允许任意来源（方便但不严格）。
- `ALLOW`：路径白名单，只放行 `/rate_limit`、`/repos/{o}/{r}`、`/repos/{o}/{r}/contents/**`、`/`（图云 `images/` 同属 contents 路径被覆盖）。**新增转发路径必须先加进这里**，禁止开放任意 URL 中转（AGENTS.md 红线 / 架构不变式）。

> ⚠️ **令牌安全**：代理会看到令牌明文，务必只部署到自己的 Cloudflare 账号，绝不使用来路不明的公共代理。若 `workers.dev` 域名在你的网络同样受限，需在 Worker → Settings → Domains & Routes 绑定自有域名。
>
> 该部署为**手动控制台操作**，无 CLI 脚本、无 `wrangler.toml`（仓库内确实不存在），因此无法在本仓库内自动化。

## 10. 上下游依赖与模拟

**无需模拟**。本项目的外部依赖只有 GitHub Contents API 一个，且在依赖不可达时**天生降级**：`isEnabled()===false` 或 `!isConfigComplete(cfg)` 即进入 `off` 本地模式（`src/services/sync/engine.ts`），待办 / 文章 / 双链功能**完全可用**，仅不同步。

因此本项目**没有** mock server、没有 `docker-compose`、没有 stub 注入开关、没有 `mocks/` 目录，也不需要。

| 依赖 | 协议 | 不可用时的表现 | 本地开发对策 |
|------|------|---------------|-------------|
| GitHub Contents API | HTTPS REST | 同步胶囊进入 `error` / `off`，数据留在本地待推送 | 关闭「启用同步」开关跑纯本地模式，或换一个测试用数据仓库 |
| Cloudflare Worker 代理 | HTTPS | 清空「API 代理地址」即回落官方 `api.github.com` | 本地开发默认不填，直连 |

详见 [relationship.md](../relationship.md)。

## 11. 禁止项

- ❌ **把数据放进公开的代码仓库**——数据仓库必须私有
- ❌ **令牌以任何形式落库（除 `wb.cfg.v1`）、落日志、写进源码**（红线 5）
- ❌ 绕过 `src/stores/data.ts` 直接读写 `wb.*` localStorage 键，或绕过 `src/services/github/*` / `src/services/sync/*` 直接调 GitHub Contents API（红线 4）
- ❌ 用户内容渲染前未经转义（`lib/markdown` 经 DOMPurify；纯文本走 `lib/html.esc()`）
- ❌ `git push --force` 到 `main`
- ❌ 在 Worker 里放开 `ALLOW` 白名单做任意 URL 中转，或把 Worker 地址分享给他人使用
- ❌ 手工编辑数据仓库里的 `kb/<id>.md` / `manifest.json`（改坏会触发同步解析失败，只能删掉重建或用备份覆盖）
- ❌ 直接在 GitHub 网页端改代码仓库文件后发布（会绕过本地 git 钩子与 CI 构建）

## 参考

- 架构与部署拓扑：[../architecture.md](../architecture.md) §8
- 上下游依赖：[../relationship.md](../relationship.md)
- 失败案例：[../failures.md](../failures.md)
- 编码与安全：[../coding-style.md](../coding-style.md)
