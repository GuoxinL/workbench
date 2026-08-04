# 测试环境部署与代码同步

> 本文档说明测试环境相关操作的 Skill 调用方式。
> 所有环境操作通过 **团队环境管理 Skill** 统一处理，无需手动执行 CLI 命令。
>
> 本文档由 `specs-sop` skill 维护；初始化或升级 skill 时**会强制刷新**（项目自定义区保留，Git 管理无需备份）。
> 项目特有的「组件清单」「环境命名」等定制内容请填到下文 `## 项目自定义` 章节，避免被刷新覆盖。

---

## Skill 纵览

| Skill | 用途 | 触发方式 |
|-------|------|---------|
| `团队环境管理 Skill` | 环境创建 / 查询、代码热更、远端命令执行 | 对 AI 说"创建环境"、"同步代码"、"查看日志"等 |
| `团队测试工具 Skill` | 创建/查询/销毁实例、数据库查询、API 调用 | 对 AI 说"创建实例"、"数据库查询"、"执行接口测试"等 |

---

## 环境操作（团队环境管理 Skill）

> 以下操作统一通过团队环境管理 Skill 完成，AI 会自动调用对应的环境管理能力。

| 操作 | 对 AI 说 | 说明 |
|------|---------|------|
| 创建测试环境 | `创建环境` / `创建环境 <env-name>` | 触发创建流水线，约 10–20 分钟 |
| 查询环境状态 | `查询环境 <env-name>` | 查看环境是否 READY |
| 查询流水线进度 | `查询流水线` | 查看创建/更新流水线状态 |
| 热更代码到环境 | `热更代码到 <env-name>` | 不走流水线，秒级生效 |
| 更新指定组件 | `更新组件 <env-name> <comp>` | 触发组件级重部署 |
| 远端容器执行命令 | `在 <env-name> 的 <comp> 上执行 <command>` | 查日志、排查问题等 |
| **释放测试环境** | `释放环境 <env-name>` / `<环境管理 CLI> release -e <env-name>` | **SOP Commit 阶段的强制前置动作**；本任务收尾必须执行，由团队环境管理 Skill 代为执行环境释放命令（同时完成环境池标记释放 + 平台 Session 释放）。详见 `plans/_template/09-commit.md` 第 0 节 |

**环境状态说明**

| 状态 | 含义 |
|------|------|
| `READY` | 就绪，可以同步代码 |
| `RUNNING` / `CREATING` | 创建/部署中，等待后重新查询 |
| `ERROR` / `FAILED` | 失败，查看流水线日志排查 |

---

## 集成测试操作（团队测试工具 Skill）

> 以下操作通过团队测试工具 Skill 完成。

| 操作 | 对 AI 说 | 说明 |
|------|---------|------|
| 创建测试实例 | `创建实例` | 创建用于 IT 的测试实例 |
| 查询实例 | `查询实例 <instance-id>` | 查看实例状态 |
| 销毁实例 | `销毁实例 <instance-id>` | 清理测试实例 |
| 数据库查询 | `数据库查询 <env-name> <sql>` | 查询测试环境数据库 |
| 调用业务 API | `<api-name> <Action>` | 直接调用项目业务接口 |

---

## 工具就绪检查

在使用上述 Skill 前，先确认环境管理 CLI 已安装（团队环境管理 Skill 依赖）。

### 检查环境管理 CLI 是否就绪

```bash
<环境管理 CLI> --version
```

| 输出 | 状态 | 处理方式 |
|------|------|----------|
| 打印版本号（如 `x.y.z`） | ✅ 就绪 | 可直接使用 |
| `command not found` | ❌ 未安装 | 见团队环境管理 Skill 安装引导 |

### 安装环境管理 CLI

> 安装方式由团队环境管理 Skill 提供，按 Skill 指引执行初始化（如 `git clone` 团队安装仓库后运行安装脚本，并完成 `init`）。

安装完成后再次执行 `<环境管理 CLI> --version` 确认就绪。

### 工具检查清单

| 工具 | 检查命令 | 缺失处理 |
|------|---------|---------|
| 环境管理 CLI | `<环境管理 CLI> --version` | 见团队环境管理 Skill 安装引导 |
| `git` | `git --version` | 系统包管理器安装 |

---

## 项目自定义

> 本章节内容**不会**被 skill 刷新覆盖，请按项目实际情况填充。

> Source（以磁盘真实代码为准）：`package.json`、`vite.config.ts`、`.github/workflows/deploy.yml`、`src/stores/data.ts`、`src/services/sync/engine.ts`、`src/services/github/*`、`proxy/cloudflare-worker.js`
> Last-verified: 2026-08-04

### ⚠️ 本项目不存在团队测试环境

**上方「团队环境管理 Skill」「团队测试工具 Skill」两节对本项目全部不适用**，请勿尝试执行：

| 上方描述的能力 | 本项目实际情况 |
|---------------|---------------|
| 环境管理 CLI（`创建环境` / `热更代码` / `释放环境`） | ❌ 未接入。本机执行 `<环境管理 CLI> --version` 会 `command not found`，且**无需**安装 |
| 远端容器执行命令 / 查日志 | ❌ 不适用。无容器、无服务端进程、无日志文件 |
| 数据库查询 | ❌ 不适用。无数据库（数据 = 浏览器 localStorage + IndexedDB + GitHub 数据仓库） |
| 创建 / 销毁测试实例 | ❌ 不适用。无实例概念 |
| SOP Commit 阶段「释放环境」强制前置动作 | ❌ 无环境可释放，该动作**空过**（在 `09-commit.md` 记「无测试环境，无需释放」即可） |

原因：纯静态前端 PWA（Vue3 + Vite 标准工程），无后端、无 CI 外的复杂部署，`push main` 触发 GitHub Actions 构建并发布到 GitHub Pages（见 [deployment.md](deployment.md)）。全项目只有 **本地** 与 **生产** 两个真实环境。

### 组件清单

| 组件名 | 仓库 / 路径 | 主分支 | 备注 |
|--------|------------|--------|------|
| 静态站点（唯一可部署单元） | `git@github.com:GuoxinL/workbench.git`，仓库根目录 | `main` | Vite 工程；push 后 GitHub Actions 构建并发布到 Pages，无手动流水线 |
| 数据仓库 | `GuoxinL/workbench-data` → `kb/<id>.md` + `manifest.json` | `main` | **必须私有**；不是"部署"对象，由应用经 Contents API 读写 |
| API 代理 Worker（可选） | 本仓库 `proxy/cloudflare-worker.js` | — | 手动在 dash.cloudflare.com 粘贴部署，无 CLI / 无 `wrangler.toml` |

### 常用环境

| 环境名 | 用途 | 地址 | 负责人 | 备注 |
|--------|------|------|--------|------|
| 本地 | 开发自验（**唯一的"测试环境"**） | `http://localhost:5173` | 开发者本人 | `npm run dev`（Vite dev server）；改完 HMR 自动刷新 |
| 生产 | 正式使用 | `https://guoxinl.github.io/workbench/` | Guoxin.Liu | 已验证可达（`curl` 返回 200）；无预发、无灰度 |

### 「测试环境」的三种替代做法

需要在不污染真实数据的前提下验证时，按场景任选：

| # | 做法 | 操作 | 适用场景 |
|---|------|------|---------|
| 1 | **纯本地模式**（最常用） | `npm run dev` 起服务，设置抽屉**关闭「启用同步」** | 绝大多数 UI / 交互 / Markdown / 双链改动。功能完整，仅不同步（`src/services/sync/engine.ts` 的 `isEnabled()` / `isConfigComplete()` 守卫） |
| 2 | **换数据仓库或分支** | 设置抽屉改「仓库」为另一个私有仓库，或改「分支」为 `test`（原 `data/workbench.json` 的 `path` 字段已在重构中移除，无法再用路径区分） | 需要验证真实同步链路（拉取/合并/推送/冲突重试）又不想动真实数据 |
| 3 | **多端并发模拟** | 用两个浏览器 profile / 两个设备登录同一数据仓库，或分别指向两个测试仓库 | 需要验证多端合并、墓碑传播等跨设备行为 |

> 三种做法**都只改浏览器里的 `wb.cfg.v1` 配置，不改任何代码、不改任何仓库文件**——本项目没有分环境配置文件（见 [env.md](env.md) §3.1）。

线上验证（发布后）只有一步：

```bash
# 确认站点可达、发布生效
curl -s -o /dev/null -w "%{http_code}\n" https://guoxinl.github.io/workbench/   # 期望 200
# 确认页面正常挂载（无白屏）：打开页面交互核验；产物由 Vite 内容 hash 保证缓存失效
```

### 项目特有同步规则 / 排雷点

1. **「同步代码」在本项目指的是数据同步，不是部署同步**。上方 Skill 表里的「热更代码到环境」在本项目不存在；代码上线的唯一通道是 `git push origin main`（触发 GitHub Actions）。
2. **发布前必须本地跑过 `npm run build` + `npm test`**（类型检查 + 测试 + 构建全过）。重构后**无需、也不再支持**手工刷 `?v=` 版本号——缓存由 Vite 产物内容 hash 保证（旧 `bump-version.sh` 已移除）。
3. **本地验证时改完通常 HMR 自动刷新**；若遇强缓存，浏览器 `Ctrl/Cmd + Shift + R` 或 DevTools → Network 勾 Disable cache。生产缓存由 hash 文件控制，重新构建即换新。
4. **切换数据仓库 / 分支后先点「测试连接」再点「保存」**。细粒度 PAT 的 Repository access 若没勾上新仓库，会直接 404；写权限不足（只给 Read）也无法同步（`src/services/github/diagnose.ts` 校验 `permissions.push`）。
5. **不要手工编辑远端 `kb/<id>.md` / `manifest.json`**。改坏会触发同步解析失败，只能删掉让应用重建，或用设置抽屉「导出备份」的内容覆盖回去。
6. **多端并发验证注意 LWW 语义**：合并按记录 `id` + `updatedAt` 逐条取新，同一条记录被两端同时改，较早写入会被丢弃——这是预期行为，不是 bug。
7. **令牌不要在验证环境里复用生产令牌之外的来路**；无论哪个"环境"，令牌都只存本机 `wb.cfg.v1`，绝不能落进任何提交（红线 5）。
