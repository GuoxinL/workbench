# 部署与运行规范

> 状态：已定稿 | 维护者：Guoxin.Liu <lgx31@sina.cn> | 最后更新：2026-07-31
>
> Source: `README.md`（一/二/三/四/五节）、`index.html`、`bump-version.sh`、`proxy/cloudflare-worker.js`、`scripts/*.sh`、`git remote -v`
> Last-verified: 2026-07-31

## 范围

本项目是**纯静态前端 PWA，零后端、零构建、零 CI**。部署 = `git push` 到 GitHub Pages 仓库。

因此本文档**不适用**常规服务端那套（镜像/制品库、金丝雀灰度、探针、APM、HPA、DB 迁移），相关章节均如实标注「不适用」并给出本项目的等价手段，**不编造不存在的体系**。

配套：环境与配置项 → [env.md](env.md)；日常开发循环 → [development.md](development.md)；测试环境 → [test-env-deploy.md](test-env-deploy.md)。

## 1. 环境矩阵

本项目只有**两个真实环境**：本地和生产。**没有 test / pre（预发）环境**——单人自用工具，不存在 QA 流程与审批链。

| 环境 | 用途 | 地址 | 数据 | 访问方式 | 审批 |
|------|------|------|------|----------|------|
| 本地 | 开发与自验 | `http://127.0.0.1:8000`（`python3 -m http.server`） | 本机浏览器 localStorage；同步开关关闭即纯本地模式 | 本机 | 无 |
| ~~test~~ | **不存在** | — | — | — | — |
| ~~pre~~ | **不存在** | — | — | — | — |
| 生产 | 正式使用 | `https://guoxinl.github.io/workbench/` | 使用者私有仓库 `GuoxinL/workbench-data` 的 `data/workbench.json` | 公网 HTTPS，任何人可打开页面（但看不到数据，数据需自己的 PAT） | 无（维护者本人推送即发布） |
| 代理 Worker（可选） | 网络访问不了 `api.github.com` 时的中转 | `https://<name>.workers.dev` | 无状态、不存储 | 由使用者自部署到自己的 Cloudflare 账号 | 无 |

**两个仓库不要搞混**（README.md 第一/二节）：

| 仓库 | 内容 | 可见性 | 作用 |
|------|------|--------|------|
| `GuoxinL/workbench`（`git@github.com:GuoxinL/workbench.git`） | 代码 | **公开**（Pages 免费托管要求） | 部署源，push 即上线 |
| `GuoxinL/workbench-data` | `data/workbench.json` | **必须私有** | 待办 / 笔记数据；Pages 站点公开，数据绝不能放这里 |

## 2. 制品

**没有构建产物、没有制品仓库、没有镜像。源码即制品。**

| 项 | 本项目实际情况 |
|----|---------------|
| 构建产物 | 无。`index.html` 直接 `<script src="js/*.js">` 引源文件（`index.html:269-276`） |
| 制品仓库 | 无（无 Harbor / 无 npm registry / 无 release 二进制） |
| 命名规则 | 无镜像 tag。唯一版本标识是 `index.html` 的 `<meta name="wb-version" content="YYYYmmdd-HHMM">` |
| 版本注入 | 由 `bump-version.sh`（或 GNU sed 等效命令）写入，同时刷新全部静态资源 `?v=` 参数 |
| 保留策略 | 不适用。历史版本天然保留在 git 提交历史里，回滚 = `git revert` / 重推旧 commit |

**版本号刷新是发布的强制前置动作**（AGENTS.md 红线 3）。命令与 GNU/BSD sed 差异见 [development.md](development.md)「版本号刷新」节。

## 3. 配置管理

### 配置中心

**无配置中心、无环境变量注入、无分环境配置文件**（仓库内不存在 `etc/`、`.env`、`*.yaml`）。

配置的三个载体（完整字段表见 [env.md](env.md) §3.2）：

1. **运行时配置** = 使用者浏览器 localStorage `wb.cfg.v1`（仓库 / 分支 / 数据文件路径 / 令牌 / 轮询间隔 / API 代理地址 / 启用开关），通过页面右上齿轮设置面板填写。**本地开发与生产用的是同一份代码、各自浏览器里各自的配置**，天然隔离。
2. **代理 Worker 常量** = `proxy/cloudflare-worker.js` 顶部的 `UPSTREAM` / `ALLOW` / `ALLOW_ORIGINS`，自部署时按需修改。
3. **本地 git 钩子环境变量** = `SKIP_PRE_COMMIT` / `SKIP_PRE_PUSH` / `DISABLE_TAPD_FOOTER` 等，仅影响本地提交校验，与线上运行无关。

### 敏感配置

- **【禁止】** 把 GitHub PAT 写进源码、`data/workbench.json`、日志或任何提交内容（AGENTS.md 红线 5）。数据仓库/代码仓库一旦泄漏，等于交出 GitHub 账户写权限。
- **【必须】** 令牌只保存在使用者本机浏览器的 `wb.cfg.v1`；`store.serialize()`（`js/store.js:312-321`）只输出 `version/updatedAt/todos/notes`，从结构上保证令牌不会随同步上传。
- **【必须】** 令牌权限最小化：细粒度 PAT → Repository access 只勾**数据仓库** → Permissions → Contents 设 **Read and write**（README.md 第三节）。
- **【必须】** 代理地址只填自己部署的 Worker——代理能看到令牌明文，公共代理等同于交出令牌（README.md:126）。
- **【建议】** 公共电脑用完在设置面板清空 token。
- 发布前自查命令见 [development.md](development.md)「可选的本地自检命令」。

### 环境隔离

- 代码仓库（公开）与数据仓库（私有）物理分离，是本项目最核心的隔离手段。
- 想要一份"不污染真实数据"的验证数据，做法是**换一个数据仓库/分支/文件路径**（如 `path` 填 `data/workbench-test.json`），或干脆关闭同步开关跑纯本地模式。详见 [test-env-deploy.md](test-env-deploy.md)「项目自定义」节。

## 4. 发布流程

**无 CI 流水线、无审批、无灰度**。全流程如下（每一步都可在本机执行）：

```
1. 本地自验：python3 -m http.server 8000 → 浏览器强刷，确认功能正常
2. 【改了 js/css 必做】刷版本号：./bump-version.sh（GNU sed 环境用等效命令）
3. 校验版本号一致：grep -o 'v=[0-9]\{8\}-[0-9]\{4\}' index.html | sort -u   # 应只有一行
4. git add -A && git commit   （触发 pre-commit + commit-msg 钩子）
5. git push origin main       （触发 pre-push 钩子；本项目无 manifest，实际空跑）
6. 等 1–2 分钟，GitHub Pages 自动发布
7. 线上核对：打开 https://guoxinl.github.io/workbench/ ，查看页面源码 <meta name="wb-version">
   是否等于第 2 步生成的时间戳；不等 = 缓存或发布未完成
```

**首次开启 Pages**（仅一次性配置，README.md 第一节）：仓库 → Settings → Pages → Build and deployment → Source 选 **Deploy from a branch**，分支 **main**，目录 **/ (root)**，保存。根目录 `.nojekyll` 用于关闭 Jekyll，避免文件被当模板处理；代码全用相对路径 + hash 路由，**无需任何 base 配置**即可适配 `/workbench/` 子路径。

### 灰度阶梯阈值

**不适用**。静态站点单版本全量发布，无流量切分能力，也无指标可用于自动暂停。

### 回滚

无制品可回滚，回滚就是 git 操作：

```bash
# 方式一（推荐）：反向提交，历史可追溯
git revert <坏 commit>
git push origin main

# 方式二：把某个历史版本的文件恢复到工作区后重新提交
git checkout <好 commit> -- index.html js/ css/
git commit -m "revert(release): 回退到 <好 commit> 的前端资源"
git push origin main
```

- **回滚后同样要确认 `wb-version` 变化**（若回滚使 `?v=` 退回旧值，浏览器可能仍命中旧缓存，必要时再刷一次版本号）。
- **禁止** `git push --force` 到 `main`（会破坏 Pages 发布历史与他机 clone）。
- **数据不随代码回滚**：`data/workbench.json` 在另一个仓库，代码回滚不影响数据；数据要回滚请在数据仓库里按 commit 恢复该文件，或用设置面板「导出备份」的 JSON 覆盖回去。

## 5. 健康检查

**无 liveness / readiness / startup 探针**（无服务端进程，Pages 由 GitHub 保障可用性）。等价手段：

| 检查项 | 方式 | 通过条件 |
|--------|------|----------|
| 站点可达 | `curl -s -o /dev/null -w "%{http_code}\n" https://guoxinl.github.io/workbench/` | `200`（2026-07-31 实跑通过） |
| 发布是否生效 | `curl -s https://guoxinl.github.io/workbench/ \| grep -o '<meta name="wb-version" content="[^"]*"'` | 等于本次发布刷新的时间戳（2026-07-31 实跑返回 `20260730-2348`，与本地一致） |
| 资源未 404 | 浏览器 DevTools → Network 无红条 | 8 个 js + 1 个 css 全 200 |
| 同步链路健康 | 顶栏同步胶囊 / 设置面板「诊断」 | 绿点；诊断五步全绿 |
| 令牌与写权限 | 设置面板「测试连接」 | 通过（内部校验 `permissions.push`，`js/github.js:265`） |

## 6. 监控告警

**无指标采集、无日志平台、无链路追踪、无 APM、无告警通道**（无后端，也无埋点）。项目唯一的运行状态可观测面：

| 观测面 | 位置 | 含义 |
|--------|------|------|
| 同步胶囊四态 | 页面顶栏（`js/app.js:102-118`） | 同步中 / 已同步（绿点）/ 待同步 / 同步失败（红点） |
| 五步诊断 | 设置面板 → 诊断（`js/github.js:284-368`） | 配置检查 → 网络连通 → 令牌有效性 → 仓库访问与写权限 → 数据文件，在失败处中断并给出处置建议 |
| toast 提示 | 页面右下（`js/util.js:105-116`） | `ok` / `err` / `info` 三档用户可见反馈 |
| 浏览器 Console | DevTools | `console.warn`（本地数据/配置解析失败）、`console.error`（监听器异常） |
| 数据变更历史 | 数据仓库 commit 列表 | 每次同步产生一次 commit，可完整回溯与恢复 |

告警靠使用者肉眼看红点——这是单人自用工具的合理取舍，不必补建监控体系。

## 7. 容量规划

无实例、无扩缩容概念。真实存在的容量上限有四个：

| 约束 | 上限 | 触发后的现象 | 应对 |
|------|------|-------------|------|
| GitHub API 配额 | 认证后 **5000 次/小时** | 报「API 调用频率超限」 | 调大轮询间隔（设置面板，默认 20s，允许 5–300s） |
| localStorage | 约 **5MB**（浏览器实现相关） | 写入失败，`js/store.js:91-93` 弹 toast 兜底 | 清理旧笔记 / 导出备份后精简 |
| 单 JSON 文件全量读写 | 无硬上限，但 payload 随数据量线性增长 | 同步变慢 | 软删除墓碑 30 天自动清理已在控制体积（`js/store.js:312-321`） |
| GitHub Pages | 仓库 ≤1GB、月流量 100GB（GitHub 官方软限制） | 远未接近（本仓库 < 1MB） | 无需处理 |

## 8. 日志规范

- **无服务端日志、无日志文件、无留存策略**。日志只有浏览器 Console，随会话消失。
- **【禁止】** 输出令牌、完整配置对象（`WB.store.cfg` 含明文 PAT）。
- 现有日志点：`js/store.js:58`（监听器异常，`console.error`）、`js/store.js:67,72`（本地数据/配置解析失败，`console.warn`）。
- 用户可见反馈一律走 toast，不用 `alert`。
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

- `ALLOW_ORIGINS`（`:29-31`）：改成自己的 Pages 域名，限制谁能调用这个 Worker。留空数组=允许任意来源（方便但不严格）。
- `ALLOW`（`:20-25`）：路径白名单，只放行 `/rate_limit`、`/repos/{o}/{r}`、`/repos/{o}/{r}/contents/**`、`/`。**新增转发路径必须先加进这里**，禁止开放任意 URL 中转（AGENTS.md 红线 / 架构不变式）。

> ⚠️ **令牌安全**：代理会看到令牌明文，务必只部署到自己的 Cloudflare 账号，绝不使用来路不明的公共代理。若 `workers.dev` 域名在你的网络同样受限，需在 Worker → Settings → Domains & Routes 绑定自有域名。
>
> 该部署为**手动控制台操作**，无 CLI 脚本、无 `wrangler.toml`（仓库内确实不存在），因此无法在本仓库内自动化。

## 10. 上下游依赖与模拟

**无需模拟**。本项目的外部依赖只有 GitHub Contents API 一个，且在依赖不可达时**天生降级**：`cfgValid()` 不通过或同步关闭即进入 `off` 本地模式（`js/github.js:222`、`js/app.js:184`），待办 / 笔记 / 双链 / 图谱功能**完全可用**，仅不同步。

因此本项目**没有** mock server、没有 `docker-compose`、没有 stub 注入开关、没有 `mocks/` 目录，也不需要。

| 依赖 | 协议 | 不可用时的表现 | 本地开发对策 |
|------|------|---------------|-------------|
| GitHub Contents API | HTTPS REST | 顶栏红点 + toast 报错，数据留在 localStorage 待推送 | 关闭「启用同步」开关跑纯本地模式，或换一个测试用数据文件路径 |
| Cloudflare Worker 代理 | HTTPS | 清空「API 代理地址」即回落官方 `api.github.com` | 本地开发默认不填，直连 |

详见 [relationship.md](../relationship.md)。

## 11. 禁止项

- ❌ **改动 js/css 后不刷版本号就 push**（红线 3，历史上已造成线上与仓库代码不一致）
- ❌ **把数据放进公开的代码仓库**——数据仓库必须私有
- ❌ **令牌以任何形式落库、落日志、写进源码**（红线 5）
- ❌ **引入构建工具 / 前端框架 / npm 依赖**（红线 2，会破坏零构建直出 Pages 的部署模型）
- ❌ `git push --force` 到 `main`
- ❌ 在 Worker 里放开 `ALLOW` 白名单做任意 URL 中转，或把 Worker 地址分享给他人使用
- ❌ 手工编辑数据仓库里的 `data/workbench.json`（改坏会触发「远端数据文件不是合法 JSON」，只能删掉重建或用备份覆盖）
- ❌ 直接在 GitHub 网页端改代码仓库文件后发布（会绕过本地 git 钩子与版本号刷新）

## 参考

- 项目介绍与部署图文步骤：[../../../README.md](../../../README.md)
- 架构与部署拓扑：[../architecture.md](../architecture.md) §8
- 上下游依赖：[../relationship.md](../relationship.md)
- 失败案例：[../failures.md](../failures.md)
- 编码与安全：[../coding-style.md](../coding-style.md)
