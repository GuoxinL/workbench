# 环境搭建与启动

> 让新人在 5 分钟内本地跑起来。本项目是标准前端工程（Vue3 + Vite + TypeScript + Pinia），**需要 Node 运行时与依赖安装**——与早期「零依赖零构建」版本不同（2026-07-31 重构后）。
> 与 `development.md`（日常开发流程）、`deployment.md`（发布）、`test-env-deploy.md`（测试环境）配套。

> Source（以磁盘真实代码为准）：`package.json`、`vite.config.ts`、`tsconfig*.json`、`src/stores/data.ts`（键名常量）、`proxy/cloudflare-worker.js`、`scripts/*.sh`、`.github/workflows/deploy.yml`
> Last-verified: 2026-08-04

---

## 一、运行环境

| 环境 | 解释器 / 运行时 | 依赖管理 | 构建工具 | 本地地址 |
|------|----------------|---------|---------|---------|
| 本地开发 | Node.js ≥ 20（CI 用 Node 24）；现代浏览器（需支持 ESM / `fetch` / `AbortController`） | npm / yarn（仓库 `packageManager` 声明 `yarn@1.22`，同时有 `yarn.lock`；CI 用 `npm ci`） | Vite 8 | `http://localhost:5173`（Vite dev server） |
| 生产 | 浏览器即运行时 | 无（产物 `dist/` 由 CI 构建） | 无（已预构建） | GitHub Pages `https://guoxinl.github.io/workbench/` |
| 可选代理 | Cloudflare Workers（V8 isolate，平台侧提供） | 无 | 控制台粘贴单文件 | `https://<name>.workers.dev` |

**必装项**：

| 工具 | 检查命令 | 用途 | 缺失处理 |
|------|---------|------|---------|
| `git` | `git --version` | 拉代码、发版 | 系统包管理器安装 |
| `node` + 包管理器 | `node --version`（≥20）、`npm --version` / `yarn --version` | 运行 Vite / 安装依赖 / 测试 | 装 Node（推荐 nvm 或官方安装包）；包管理器随 Node 自带 npm |
| 浏览器 | Chrome / Edge / Safari（DevTools） | 调试、DevTools Console / Vue DevTools | 系统安装 |

> ⚠️ 重构后**不再**是「源码即产物」。本地开发必须 `npm run dev` 起 Vite dev server，不能用 `python3 -m http.server` 直接托管源码（ESM + Vite 特性需要构建/dev server）。

---

## 二、快速启动

### 本地开发

```bash
# 1) 拉代码
git clone git@github.com:GuoxinL/workbench.git
cd workbench

# 2) 安装依赖（二选一，与仓库 lockfile 一致即可）
npm install          # 或：corepack enable && yarn install

# 3) 安装本地 git 钩子（一次性，见 development.md）
ln -sf ../../scripts/pre_commit_check.sh .git/hooks/pre-commit
ln -sf ../../scripts/commit_msg_check.sh .git/hooks/commit-msg
ln -sf ../../scripts/pre_push_check.sh   .git/hooks/pre-push

# 4) 起开发服务器
npm run dev
```

预期输出（`vite` 启动后）：

```
  VITE v8.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
```

浏览器访问 **http://localhost:5173/** 即可。改完源码后 Vite **热更新**（HMR）自动刷新，无需手动重启；类型检查在 `npm run build` 时由 `vue-tsc` 执行。

**验证服务是否正常**（另开终端）：

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/            # 期望 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/src/main.ts # 期望 200（Vite 转译）
```

### 构建与预览生产产物

```bash
npm run build            # = vue-tsc --noEmit && vite build → 产物 dist/
npm run preview          # 本地预览 dist/（模拟 Pages 部署效果）
npm run type-check       # 仅类型检查
npm test                 # = vitest run（运行全部单测）
npm run test:watch       # vitest 监听模式
```

### 本地调试

全部在浏览器 DevTools 里进行：

| 目的 | 操作 |
|------|------|
| 看日志 | DevTools → Console。项目日志只有 `console.warn` / `console.error`（数据/配置解析失败、异常）；用户可见反馈走 Element Plus 消息/弹层 |
| 直接操作数据层 | DevTools → Vue DevTools → 选 `stores/data` Pinia store，查看 `todos` / `articles` / `cfg`；或 Console 经 `useDataStore()` 访问（需先 `import`） |
| 触发同步 | 点顶栏同步胶囊；或改 `cfg` 后等轮询 / 切前台 |
| 排查同步问题 | 设置抽屉（⚙）→ 诊断，五步定位（配置检查 → 网络连通 → 令牌有效性 → 仓库写权限 → 数据文件） |
| 查看/清空本地数据 | DevTools → Application → Local Storage → 站点域名，键见 §3.2 |
| 跑测试 / 断点 | `npm run test:watch` + 编辑器断点；或 `vitest` 的 `--inspect` |

> ⚠️ **禁止** `console.log(store.cfg)` 之类整体打印配置——`cfg.token` 是明文 PAT（AGENTS.md 红线 5）。要看配置请单独取字段，如 `store.cfg.repo`。

---

## 三、配置体系

### 3.1 配置文件结构

**本项目仓库内不存在任何运行期配置文件，也不读取任何环境变量。** 配置只存在于两处：

| # | 配置载体                        | 位置                         | 生效范围           | 是否入库                                                                     |
|---|---------------------------------|------------------------------|--------------------|------------------------------------------------------------------------------|
| 1 | 浏览器 localStorage `wb.cfg.v1` | 使用者本机浏览器             | 运行时同步行为     | ❌ 永不上传（序列化只在远端写 `kb/<id>.md` + `manifest.json`，绝不带 token） |
| 2 | Worker 源码顶部常量             | `proxy/cloudflare-worker.js` | 可选代理的转发策略 | ✅ 在代码仓库里（不含任何密钥）                                              |

Shell 环境变量仅本地 git 钩子（`scripts/*.sh`）读取，非运行期配置。

### 3.2 关键配置项

**① 运行时配置 `wb.cfg.v1`**（设置抽屉，默认值见 `src/stores/data.ts` `CFG_KEY` 相关）：

| 配置项 | UI 字段 | 默认值 | 说明 |
|--------|---------|--------|------|
| `enabled` | 启用同步 | `false` | 关闭时进入纯本地模式，功能完整仅不同步（`sync/engine.ts` `isEnabled()`） |
| `repo` | 仓库 | `GuoxinL/workbench-data` | 格式必须 `owner/repo`；`isConfigComplete` 要求含 `/`（`github/diagnose.ts`） |
| `branch` | 分支 | `main` | 留空回落 `main` |
| `token` | 访问令牌（`type=password`） | `''` | GitHub PAT，需 **Contents: Read and write**。**只存本机、不落库、不打日志** |
| `poll` | 自动拉取间隔（秒） | `5`（引擎钳制 5–300） | 轮询间隔 |
| `apiBase` | API 代理地址 | `''` | 留空走 `https://api.github.com`；填了则所有请求改走该地址 |
| `publicRepo` | 公开镜像库（可选） | `''` | 用于分享只读视图；`diagnose.defaultPublicRepo` 默认推导为 `<owner>/workbench-public` |

> ⚠️ 重构后**不再有 `path` 字段**（旧 `data/workbench.json` 已被 `kb/<id>.md` + `manifest.json` 取代）；同步数据载体由引擎按 id 组织，无需手工指定路径。

**其它 localStorage 键**（非配置，仅供排障时识别）：`wb.data.v1`（主数据快照，即时加载层）、`wb.cfg.v1`（配置，含 token）、`wb.manifestSha.v1`（远端 manifest 乐观锁 sha）。

> ⚠️ 读写这些键**只能经 `src/stores/data.ts`**（AGENTS.md 红线 4）；调试时手工在 DevTools 里改属于一次性排障，改完请刷新页面让 store 重新加载。

**② 代理 Worker 常量**（`proxy/cloudflare-worker.js`，自部署时按需改）：

| 常量 | 说明 |
|------|------|
| `UPSTREAM` | 上游地址，默认 `https://api.github.com`，一般不改 |
| `ALLOW` | **路径白名单**，含 `/rate_limit`、`/repos/{o}/{r}`、`/repos/{o}/{r}/contents/**`、`/`；图云 `images/` 同属 contents 路径被覆盖。新增转发路径必须先加进这里（AGENTS.md 红线 / 架构不变式） |
| `ALLOW_ORIGINS` | **来源白名单**，默认 `['https://guoxinl.github.io']`；换自己的 Pages 域名时改这里；留空数组=允许任意来源（不推荐） |

**③ Shell 环境变量**（仅本地 git 钩子读取，日常不需要设置）：

| 变量 | 读取方 | 作用 |
|------|--------|------|
| `SKIP_PRE_COMMIT=1` | `scripts/pre_commit_check.sh` | 跳过提交前静态检查（应急逃生口） |
| `SKIP_PRE_PUSH=1` | `scripts/pre_push_check.sh` | 跳过推送前检查 |
| `ENFORCE_CONV_COMMITS=1` | `scripts/commit_msg_check.sh` | 强制 Conventional Commits 格式校验 |

---

## 四、常见问题

| 现象 | 原因 | 解决 |
|------|------|------|
| `npm run dev` 报端口被占 / EADDRINUSE | 5173 被占用 | 换端口 `npm run dev -- --port 8080`；或 `lsof -i:5173` 找占用进程处理 |
| 改了源码浏览器没变 | Vite HMR 偶发失效 / 强缓存 | DevTools → Network 勾 Disable cache；硬刷 `Ctrl/Cmd + Shift + R`；或重启 `npm run dev` |
| 页面白屏 / `Failed to resolve module` | 依赖未安装或 `node_modules` 损坏 | `rm -rf node_modules && npm install` |
| `npm run build` 类型错误 | `vue-tsc` 严格模式报错 | 按报错修类型；CI 同样会拦截 |
| 顶栏同步胶囊红点「同步失败」 | 令牌/仓库/网络任一环节 | 设置抽屉 → 诊断，按五步结果定位 |
| 诊断卡在「网络连通」 | 本机网络访问不了 `api.github.com` | 自部署 Cloudflare Worker 代理（`proxy/cloudflare-worker.js`），地址填进「API 代理地址」，详见 `deployment.md`「代理 Worker 部署」节 |
| 直接双击 `index.html`（`file://`）打不开 | Vite 工程是 ESM 模块，需经 dev server / 构建产物，不支持 `file://` 直开 | 必须用 `npm run dev` 或部署后的 Pages 地址 |

更多历史故障见 [failures.md](../failures.md)。
