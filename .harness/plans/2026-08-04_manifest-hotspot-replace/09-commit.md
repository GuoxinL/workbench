# 09. Commit —— 中央 manifest.json 热点替代

> 步骤状态：⏳ 进行中（部署即合入 main，随 05 一并执行）

## 1. 执行顺序（对齐 deployment.md §4）

1. 一次性 `git add`：**本次代码** + **本任务 plan 目录**（`00~09` md）。
   - 仅包含：`src/components/common/SyncChip.vue`、`src/services/github/{blobSha,listDir,contents,manifest}.ts` 及其 `__tests__/`、`src/services/sync/{diff,engine}.ts` 及其 `__tests__/`、`src/stores/data.ts`、`src/types/index.ts`、`.harness/plans/2026-08-04_manifest-hotspot-replace/`。
   - **排除**（任务隔离 / 无关）：`.harness/plans/2026-08-04_recursive-test-fix/`（其它任务）、`.harness/design-shell.html`（无关临时文件）。
2. `git commit`（单 commit，符合「一个 MR 一个 commit」）。
3. `git checkout main && git merge --ff-only feature/manifest-hotspot-replace && git push origin main` → 触发 Actions 发布（即本项目的「部署」）。
4. 验证：查 Actions 状态 + 线上 CDP 烟测（见 `06-it.md`）。
5. 本任务无测试环境可释放（`test-env-deploy.md`：空过）。

> 本项目部署 = 推 `main`，故 05 Deploy 与 09 Commit 在本项目实际合并为同一步：commit → 推 main → 发布。

## 2. commit message（Conventional Commits，中文 subject）

```
refactor(sync): 用每文件 blob sha 与目录树索引替代中央 manifest.json 写入热点

- 移除中央 manifest.json 读写，消除单文件写入热点
- 同步前 GET kb/ 与 todos/ 目录树，按每文件 blob sha 判定增删改
- 本地基线从 wb.manifestSha.v1 改为 wb.syncState.v1（path→sha）
- 三态判定（push/pull/LWW 合并）+ 单文件粒度乐观锁 + 409 重试≤3
- SyncPhase 新增 uptodate 静默态；SyncChip 支持 PC 药丸 / App 纯点
- 新增 diff/blobSha/listDir 单测，engine/contents 单测对齐新语义
```

## 3. amend 流程（如需修正）

- 本任务首次即一个 commit；后续修正一律 `git commit --amend` 累积，**严禁**第二个 commit。
- 推 `main` 用普通 `git push origin main`（已发布过则 `git push --force-with-lease` 仅限 feature 分支，**禁止**对 main 强推）。
