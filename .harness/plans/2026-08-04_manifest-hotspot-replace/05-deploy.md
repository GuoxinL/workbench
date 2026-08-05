# 05. Deploy —— 中央 manifest.json 热点替代

> 步骤状态：✅ 完成
> 开始：2026-08-05 08:06:25 ｜ 结束：2026-08-05 08:xx:xx（见 00-overview 时间记录）

## 1. 部署路径（本项目无测试环境）

按 `deployment.md` §4：本项目是纯静态 PWA，只有**本地 + 生产**两环境，无 test/pre。
部署 = `git push origin main` → GitHub Actions 构建 → 发布 GitHub Pages `https://guoxinl.github.io/workbench/`。

> 团队环境管理 / 测试工具 Skill 对本项目全不适用（见 `test-env-deploy.md`「本项目不存在团队测试环境」）。

## 2. 发布前门禁（已验证）

| 门禁 | 命令 | 结果 |
|------|------|------|
| 单元测试 | `npm test` | ✅ 34 文件 / **201 用例全绿** |
| 类型检查 + 构建 | `npm run build`（含 `vue-tsc --noEmit`） | ✅ 构建成功，产物带新内容哈希 `index-Dmq0Nw3F.js` |
| 预格式化 | prettier | ⚠️ 仓库未装 prettier（无依赖、离线 npx 无法拉取），git 钩子未安装；门禁以 build+test 为准，已在 CI 再次校验 |

> build 仅剩 `:deep()` lightningcss 既有告警（其它组件 CSS，与本次改动无关），不影响产物。

## 3. 操作步骤

1. 提交本次实现（见 `09-commit.md`）：`git add` 仅本次代码 + 本任务 plan 目录（**不**碰其它任务目录 `recursive-test-fix/`、不动 `.harness/design-shell.html`）。
2. 快进合并到 `main` 并推送：
   ```
   git checkout main
   git merge --ff-only feature/manifest-hotspot-replace
   git push origin main
   ```
3. 触发 Actions：构建 + `upload-pages-artifact` + `deploy-pages`（约 1–2 分钟）。
4. 线上核对：见 `06-it.md`（含 CDP 打开线上链接的功能验证）。

## 4. 回滚方案

- 反向提交：`git revert <坏 commit> && git push origin main`。
- **禁止** `git push --force` 到 `main`（会破坏 Pages 发布历史）。
- 数据不随代码回滚：数据在 `workbench-data` 仓库的 `kb/<id>.md`，本改动**不再写 `manifest.json`**，远端旧 `manifest.json` 作为孤儿文件无害；首轮同步按新基线重推自愈。

## 5. 数据兼容要点

- 旧 `wb.manifestSha.v1` 不再使用；新基线 `wb.syncState.v1`（path→sha）由 `data.ts` 唯一读写。
- 旧数据仓库残留 `manifest.json` 不读、不写、不删（避免跨设备干扰），自然沦为孤儿。
- 首轮同步因本地无每文件基线：本地有、远端有同 id → 走 LWW 合并重推；本地有、远端无 → 直接 PUT 新建。均为「自愈」语义，无需用户介入。
