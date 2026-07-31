# 环境搭建与启动

> 让新人在 5 分钟内本地跑起来；**源码即产物**，本地跑的文件和 GitHub Pages 上线的文件完全一致（无编译、无打包、无产物目录）。
> 与 `development.md`（日常开发流程）、`deployment.md`（发布）、`test-env-deploy.md`（测试环境）配套。

> Source: `README.md`、`index.html`、`bump-version.sh`、`js/store.js:31-39`（`DEFAULT_CFG`）、`js/github.js:11-18,34-41`、`proxy/cloudflare-worker.js:17-31`、`scripts/*.sh`
> Last-verified: 2026-07-31（本页所有命令已在 WSL2 / Ubuntu + Python 3.12.3 + GNU sed 4.9 实跑）

---

## 一、运行环境

本项目**没有语言运行时、没有依赖目录、没有构建工具**。所谓"环境"只有两样：一个现代浏览器 + 一个能提供静态文件的 HTTP 服务器。

| 环境 | 解释器 / 运行时 | 依赖目录 | 构建工具 | 部署场景 |
|------|----------------|---------|---------|---------|
| 本地开发 | 浏览器（Chrome / Edge / Safari，需支持 `fetch` / `AbortController` / ES2017+）；静态服务器用系统自带 `python3`（≥3.4 即有 `http.server`） | **无**（无 `package.json` / `node_modules` / lockfile） | **无** | 本机 `http://localhost:8000` |
| 生产 | 同上，浏览器即运行时 | **无** | **无** | GitHub Pages `https://guoxinl.github.io/workbench/` |
| 可选代理 | Cloudflare Workers（V8 isolate，平台侧提供） | 无 | 无（控制台粘贴单文件） | `https://<name>.workers.dev` |

**必装项只有两个**：

| 工具 | 检查命令 | 用途 | 缺失处理 |
|------|---------|------|---------|
| `git` | `git --version` | 拉代码、发版 | 系统包管理器安装 |
| `python3` | `python3 --version` | 起本地静态服务（`http.server`） | 系统包管理器安装；也可换任意静态服务器（见下） |

> ⚠️ **红线提醒**：`node` / `npx` 在开发机上可能存在，但**仅可用作可选的语法自检工具**（`node --check`），**严禁**为本项目引入 `package.json` / npm 依赖 / 打包器（AGENTS.md 红线 2）。

---

## 二、快速启动

### 本地开发

```bash
# 1) 拉代码（无依赖安装步骤）
git clone git@github.com:GuoxinL/workbench.git
cd workbench

# 2) 安装本地 git 钩子（一次性，见 development.md）
ln -sf ../../scripts/pre_commit_check.sh .git/hooks/pre-commit
ln -sf ../../scripts/commit_msg_check.sh .git/hooks/commit-msg
ln -sf ../../scripts/pre_push_check.sh   .git/hooks/pre-push

# 3) 起静态服务（在仓库根目录执行）
python3 -m http.server 8000 --bind 127.0.0.1
```

预期输出：

```
Serving HTTP at 127.0.0.1 port 8000 (http://127.0.0.1:8000/) ...
```

浏览器访问 **http://127.0.0.1:8000/** 即可。**改完 js/css 直接刷新浏览器**（`Ctrl/Cmd + Shift + R` 强刷绕开缓存），无编译、无热更、无需重启服务。

**验证服务是否正常**（另开一个终端）：

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/            # 期望 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/js/app.js   # 期望 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/css/style.css
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/manifest.json
```

**换其它静态服务器**（等效，任选其一，均无需装依赖到项目里）：

```bash
python3 -m http.server 8000            # 推荐，零安装
php -S 127.0.0.1:8000                  # 若本机有 php
npx --yes serve -l 8000                # 仅临时下载到 npx 缓存，不写入本仓库
```

> **也可以直接 `file://` 双击打开 `index.html`**：本项目 8 个 JS 都是 IIFE 挂 `window.WB`，**不是 ES Module**，不受模块 CORS 限制，所以 `file://` 下核心功能可用。但 `manifest.json`/PWA 相关能力、以及部分浏览器对 `file://` 的 `fetch` 限制会导致 GitHub 同步不可用，**日常开发请用 http.server**。

### 本地调试

无调试器、无远程调试端口，全部在浏览器 DevTools 里进行：

| 目的 | 操作 |
|------|------|
| 看日志 | DevTools → Console。项目日志只有 `console.warn`（本地数据/配置解析失败，`js/store.js:67,72`）和 `console.error`（事件监听器异常，`js/store.js:58`）；用户可见反馈走页面右下 toast |
| 直接操作数据层 | Console 里 `WB.store` / `WB.gh` / `WB.md` / `WB.notes` 全局可用，例如 `WB.store.data.todos.length`、`WB.gh.state()` |
| 手动触发同步 | Console 执行 `WB.gh.sync()`；或点顶栏同步胶囊 |
| 排查同步问题 | 页面右上齿轮 → **诊断**，五步定位（配置检查 → 网络连通 → 令牌有效性 → 仓库访问 → 数据文件） |
| 查看/清空本地数据 | DevTools → Application → Local Storage → 站点域名，键见下方 §3.2 |
| 确认页面版本 | 查看页面源码里的 `<meta name="wb-version">`，或设置面板标题旁的小字号版本号 |

> ⚠️ **禁止** `console.log(WB.store.cfg)` 之类整体打印配置——`cfg.token` 是明文 PAT（AGENTS.md 红线 5）。要看配置请单独取字段，如 `WB.store.cfg.repo`。

---

## 三、配置体系

### 3.1 配置文件结构

**本项目仓库内不存在任何配置文件，也不读取任何环境变量。**

```
（无 etc/ 目录、无 .env、无 *.yaml / *.toml / *.ini）
```

配置只存在于三个地方：

| # | 配置载体 | 位置 | 生效范围 | 是否入库 |
|---|---------|------|---------|---------|
| 1 | 浏览器 localStorage `wb.cfg.v1` | 使用者本机浏览器 | 运行时同步行为 | ❌ 永不上传（`js/store.js:312-321` 的 `serialize()` 只输出 `version/updatedAt/todos/notes`） |
| 2 | Worker 源码顶部常量 | `proxy/cloudflare-worker.js` | 可选代理的转发策略 | ✅ 在代码仓库里（不含任何密钥） |
| 3 | Shell 环境变量 | 仅 `scripts/*.sh` 三个 git 钩子读取 | 本地提交/推送校验 | — |

### 3.2 关键配置项

**① 运行时配置 `wb.cfg.v1`**（页面右上齿轮设置面板，默认值见 `js/store.js:31-39`）：

| 配置项 | UI 字段 | 默认值 | 说明 |
|--------|---------|--------|------|
| `enabled` | 启用同步（`#cfgEnabled`） | `false` | 关闭时进入纯本地模式，功能完整仅不同步（`js/github.js:222`） |
| `repo` | 仓库（`#cfgRepo`） | `GuoxinL/workbench-data` | 格式必须 `owner/repo`；留空回落默认（加载侧 `js/store.js:74-77` + 引擎侧 `js/github.js:34-41` 双重回落） |
| `branch` | 分支（`#cfgBranch`） | `main` | 留空回落 `main` |
| `path` | 数据文件路径（`#cfgPath`） | `data/workbench.json` | 留空回落默认；文件不存在属正常，首次同步自动创建 |
| `token` | 访问令牌（`#cfgToken`，`type=password`） | `''` | GitHub PAT，需 **Contents: Read and write**。**只存本机、不落库、不打日志** |
| `poll` | 自动拉取间隔（`#cfgPoll`） | `20`（秒） | UI 限 5–300，引擎侧再钳制一次（`js/github.js:244`） |
| `apiBase` | API 代理地址（`#cfgApiBase`） | `''` | 留空走 `https://api.github.com`；填了则所有请求改走该地址（`js/github.js:14-18`） |

**其它 localStorage 键**（非配置，仅供排障时识别）：`wb.data.v1`（全部待办+笔记）、`wb.device.v1`（设备 ID）、`wb.dirty`（有未推送变更）、`wb.view` / `wb.seeded`（UI 态）。

> ⚠️ 读写这些键**只能经 `js/store.js`**（AGENTS.md 红线 4）；调试时手工在 DevTools 里改属于一次性排障，改完请刷新页面让 store 重新加载。

**② 代理 Worker 常量**（`proxy/cloudflare-worker.js`，自部署时按需改）：

| 常量 | 行号 | 默认值 | 说明 |
|------|------|--------|------|
| `UPSTREAM` | `:17` | `https://api.github.com` | 上游地址，一般不改 |
| `ALLOW` | `:20-25` | `/rate_limit`、`/repos/{o}/{r}`、`/repos/{o}/{r}/contents/**`、`/` | **路径白名单**。新增转发路径必须先加进这里（AGENTS.md 红线 / 架构不变式） |
| `ALLOW_ORIGINS` | `:29-31` | `['https://guoxinl.github.io']` | **来源白名单**，换自己的 Pages 域名；留空数组=允许任意来源（不推荐） |

**③ Shell 环境变量**（仅本地 git 钩子读取，日常不需要设置）：

| 变量 | 读取方 | 作用 |
|------|--------|------|
| `SKIP_PRE_COMMIT=1` | `scripts/pre_commit_check.sh` | 跳过提交前静态检查（应急逃生口，不建议常用） |
| `SKIP_PRE_PUSH=1` | `scripts/pre_push_check.sh` | 跳过推送前检查 |
| `AI_TEST_GUARD=1` | `scripts/pre_commit_check.sh` | 阻止 AI 修改既有测试断言（本项目暂无测试文件，实际不触发） |
| `ENFORCE_CONV_COMMITS=1` | `scripts/commit_msg_check.sh` | 强制 Conventional Commits 格式校验 |
| `DISABLE_TAPD_FOOTER=1` | `scripts/commit_msg_check.sh` | 关闭 TAPD 单号脚注强制校验（默认**开启**：commit message 必须含 `--story=<id>` 等脚注，否则拒绝提交） |

---

## 四、常见问题

| 现象 | 原因 | 解决 |
|------|------|------|
| `./bump-version.sh` 报 `sed: can't read s/(\.(js\|css))\?v=...: No such file or directory`，退出码 2 | 脚本用 **BSD sed 语法** `sed -i ''`，GNU sed（Linux / WSL）不接受空串参数（已知技术债，`bump-version.sh:8,10`） | 在 GNU sed 环境改用等效两条命令（已实跑验证，见 `development.md`「版本号刷新」节）；**不要跳过这一步**，否则踩中 AGENTS.md 红线 3 |
| 改了 js/css，浏览器行为没变 | 命中 `?v=` 旧版本的强缓存 | 本地：`Ctrl/Cmd + Shift + R` 强刷，或 DevTools → Network 勾 Disable cache；线上：必须先跑版本号刷新再 push |
| `OSError: [Errno 98] Address already in use` | 8000 端口被占 | 换端口 `python3 -m http.server 8001`；或 `ss -lptn 'sport = :8000'` 找出占用进程后处理 |
| 页面 404 / 样式全丢 | 不在**仓库根目录**起的服务 | `cd` 到含 `index.html` 的目录再执行 `python3 -m http.server` |
| Console 报 `WB.store is undefined` 类错误 | `index.html:269-276` 的 8 个 `<script>` 顺序被改动 | 顺序必须是 `util → store → github → markdown → todos → notes → graph → app`，无模块系统兜底（架构不变式） |
| 顶栏同步胶囊红点、提示"同步失败" | 令牌/仓库/网络任一环节 | 设置面板 → **诊断**，按五步结果定位；对照 `README.md`「五、同步失败怎么排查」的错误码表 |
| 诊断卡在「网络连通」 | 本机网络访问不了 `api.github.com` | 自部署 Cloudflare Worker 代理（`proxy/cloudflare-worker.js`），地址填进「API 代理地址」，详见 `deployment.md`「代理 Worker 部署」节 |
| `file://` 打开时同步不可用 / manifest 警告 | 浏览器对 `file://` 协议的 `fetch`、manifest 限制 | 改用 `python3 -m http.server` |

更多历史故障见 [failures.md](../failures.md)。
