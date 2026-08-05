# 08. 代码审查（Review）

> 阶段目标：对本次「去中央 manifest.json + sha 冲突自愈加固」的代码改动做质量把关。
> 审查对象：commit `3c96921`（去中央 manifest 索引）+ `80e1b40`（非 409 的 sha 冲突视为可重试）。
> 时间：2026-08-05（与 07 Docs 同批）。

---

## 一、改动概览

| 维度 | 结论 |
|------|------|
| 功能正确性 | ✅ 端到端线上实测通过（06 IT：索引 / 拉取 / 墓碑删除 / 推送全链路）；首轮 sha 冲突已自愈 |
| 测试 | ✅ 202 用例全绿（原 201 + 1 冲突加固单测），`npm run build` 类型零错误 |
| 红线合规 | ✅ 未绕过 `stores/data.ts` / `services/github|sync`；令牌未落库/落日志/硬编码 |
| 文档 | ✅ 见 07-docs.md，权威文档已全部对齐新架构 |

---

## 二、重点审查：`80e1b40` 首轮 sha 冲突裸错修复

**问题**：首轮同步偶发 `SyncChip` 进入 `error` 态，文案 `is at <远端sha> but expected <本地sha>`。
**根因**：`repoFile.putFile/deleteFile` 仅把 HTTP **409/422** 转成可重试 `ConflictError`；而 GitHub 在某些情况下以**非 409 状态码 + sha 冲突文案**返回（线上实测 PUT/DELETE 错 sha 多为 409 `"<path> does not match <sha>"`，但存在变体），这些被原样抛成 `GithubError`，绕过引擎的冲突重试循环 → 整轮同步直接红错，而非自愈。

**修复**（`src/services/github/repoFile.ts`）：
```ts
export function isConflictMessage(msg: string): boolean {
  return /does not match|but expected|conflict|out of date/i.test(msg)
}
// putFile / deleteFile catch：
if (e instanceof GithubError && (e.status === 409 || e.status === 422 || isConflictMessage(e.message))) {
  throw new ConflictError(e.status === 409 ? sha : undefined)
}
```
- ✅ 用**消息内容**兜底 HTTP 状态码的不确定性，任何 sha / 版本冲突文案都进重试路径；
- ✅ 不改重试上限（`MAX_RETRY=3`）与退避（`RETRY_BACKOFF×attempt`），无死循环风险；
- ✅ `deleteFile` 仍保留 `notfound` 短路（远端已无该文件即视为成功），不受影响。

**新增单测**（`contents.test.ts`）：mock `fetch` 返回 `status:423` + 文案 `is at abc123 but expected def456` 的 PUT，断言 `pushRemote` 返回 `conflictSlug === 'kb/1.md'`（而非抛错中断）——覆盖"非 409 的 sha 冲突自愈"这一此前缺失的分支。

---

## 三、重点审查：`3c96921` 去中央 manifest 索引

- ✅ 索引改由 `listDir.fetchIndex()` 现拉 `kb/` + `todos/` 目录树 blob sha，复用既有 `contents/**` 代理白名单路径，**未引入新代理白名单**（02-plan 决策已论证）。
- ✅ 本地基线 `wb.syncState.v1`（`path→sha`）仅经 `stores/data.ts` 读写，符合红线 4。
- ✅ `manifest.ts` 仅留 `@deprecated` 只读 `getManifest`，新路径不依赖它；旧仓库残留 `manifest.json` 作为孤儿文件无害。
- ⚠️ 已知限制（非缺陷）：旧仓库 `wb.manifestSha.v1` 无法推导每文件基线 → 首次同步按 LWW 全量重推；属预期过渡行为（06 IT 已验证自愈）。

---

## 四、审查结论

- **必须修复（阻塞合入）**：无。
- **建议修改（非阻塞）**：无。
- **结论**：✅ 通过。代码改动精准、测试覆盖到位、线上实测验证充分；可随 09 Commit 一并合入（实际 05 阶段已推 `main` 合并，本次 07/08 仅补文档与审查产物）。
