# 03. Implement —— 中央 manifest.json 热点替代

> 开始确认：2026-08-04 23:19:11（用户「开始实现」）｜ 实现窗口：23:19:11 → 23:44:23

## 一、与 Plan 的差异（重要）

1. **首轮（基线缺失）冲突处理改为「LWW 合并」而非「本地盲目覆盖」**
   Plan §七写「首轮按矩阵 B/E 行判定为本地较新 → PUSH，远端被覆盖为本地内容（LWW 取本地胜）」。
   实现中，`planSync` 对 base 缺失且 `localSha !== treeSha` 的情况归为 **conflicts（F 行）**：引擎 GET 远端后按 `updatedAt` 做 LWW 合并再推送，**不会无条件覆盖远端内容**，避免多设备首轮丢失远端数据。行为与 Plan 意图（消除 manifest、自愈）一致且更安全。

2. **`wb.manifestSha.v1` 彻底移除**，不读旧 manifest.json 播种（守决策「直接重推自愈」）。本地基线改为 `wb.syncState.v1`（`path→sha`），仅经 `src/stores/data.ts` 读写（红线 4）。

3. **fetchArticles / fetchTodos 不再依赖远端索引补充元数据**：正文 frontmatter / JSON 自带 `title`/`updatedAt` 等字段，索引只提供 `id→sha`。ContentsApi 签名相应简化（`fetchArticles(ids, config)` / `fetchTodos(ids, config)`）。

4. **SyncOutcome 新增 `pulled / pushedN / deleted` 计数**（Plan §10.4 要求），供 PC 指示器展示「↑2 ↓1」。

## 二、改动文件与结果

### 新增
- `src/services/github/blobSha.ts`：`gitBlobSha(content)` —— Web Crypto SHA-1(`blob <len>\0<utf8>`)，与 GitHub 计算结果逐字节一致。
- `src/services/github/listDir.ts`：`listDir(dir, config)`（目录列表→`{path,sha}[]`，404 视为空）、`fetchIndex(config)`（现拉 `kb/`+`todos/` → `{articles,todos}: id→sha`）。
- `src/services/sync/diff.ts`：`planSync(local, treeIndex, baseSha)` —— 矩阵 A–G，返回 `pull/push/del/conflicts/skip`。

### 修改
- `src/services/github/contents.ts`：
  - 导出 `serializeArticle/serializeTodo`（引擎算本地 sha 复用，保证字节一致）。
  - `fetchManifest` 删除；引擎改用 `listDir.fetchIndex`。
  - `pushRemote` 改签名：入参 `pushIds / todoPushIds / delIds / todoDelIds / treeShaByPath`；逐文件 PUT 用 `treeShaByPath[path]` 作乐观锁；新增 DELETE 分支（带远端 sha 锁）；**删除 `putManifest` 调用**（不再写中央文件）；返回 `{conflictSlug, shaByPath, deletedPaths}`。
  - `publishToMirror/unpublishFromMirror/pushImage/deleteImage` 保持不变（不依赖 manifest）。
- `src/services/github/manifest.ts`：`putManifest` 删除；`getManifest`/`planDiff` 标 `@deprecated` 保留（仅兼容旧测试，新同步不再调用）。
- `src/services/sync/engine.ts`：
  - `doSync` 重写为「现拉索引 → 算本地 sha → 三态判定 → pull/conflict-merge/push/delete → 更新基线落盘」。
  - 新增 `uptodate` 静默态（全 sha 一致、零传输）；`ok` 仅当有传输。
  - 冲突（409）重试 ≤3 次保留；单文件粒度（S10）。
  - 基线经 `adapter.getSyncState/setSyncState` 读写；远端删除成功 → `adapter.purgeLocal` 清本地墓碑。
  - `SyncAdapter` 移除 `getLocalManifestSha/setManifestSha`，新增 `getSyncState/setSyncState/purgeLocal/setSyncMeta`。
- `src/types/index.ts`：`SyncPhase` 新增 `'uptodate'`。
- `src/stores/data.ts`：新增 `wb.syncState.v1` 读写（`syncState` ref + `saveSyncState`）、`lastSyncAt`、`lastSyncMeta`；`applyRemote/applyRemoteTodos` 去 manifest 参数；`setPhase` 在 `uptodate`/`ok` 刷新 `lastSyncAt`；`purgeLocal` 调 `db.deleteArticle/deleteTodo`。
- `src/components/common/SyncChip.vue`：支持 `uptodate`（已是最新 + 上次检查时间）、`mode='pc'|'app'`（药丸 / 纯点，§10.4 已定 App=③、PC=①）、`ok` 展示传输计数、错误态点击即重试；颜色用直接 hex（避免嵌套 var()）。

## 三、验证

- `npm run build`（含 `vue-tsc --noEmit`）：通过，无类型错误。
- `npm test`（Vitest 全量）：201 passed。
- 新增单测：`blobSha.test.ts`（空 blob 已知 sha 交叉验证）、`listDir.test.ts`（目录投影 / 404 空 / 索引映射）、`diff.test.ts`（矩阵 A–G 全 7 行 + 首轮边界）。
- 改写：`contents.test.ts`（fetchIndex + 新 pushRemote 语义）、`engine.test.ts`（新 ContentsApi / SyncAdapter / uptodate / delete 墓碑清理）。
- `manifest.test.ts` 无需改动（`getManifest`/`planDiff`/`entryOf` 仍导出）。

## 四、未覆盖 / 待办
- 真实链路集成测试（IT，06 步骤）需真实 token + 远端仓库，本环境未跑；逻辑已由 UT 覆盖。
- 旧仓库遗留 `manifest.json` 作为孤儿文件保留，未做清理（Plan 明确不在本任务范围）。
