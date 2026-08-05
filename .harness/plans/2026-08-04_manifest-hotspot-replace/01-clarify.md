# 01. Clarify —— 中央 manifest.json 热点替代

## 背景

当前同步架构（`src/services/github/contents.ts` 的 `pushRemote`）每轮同步结束后都会 **PUT 整个 `manifest.json`**（目录本），用它携带每篇文章的 `updatedAt` 与 blob `sha` 作 LWW 合并与乐观锁基准。

冲突机制：设备 A、B 在时间上重叠同步时，都拿着旧 `manifest.json` 的 sha 去写，后写者必然 409「sha 不匹配」→ 整轮同步冲突重试（最多 3 次，S10）。只要任意两设备/两次轮询重叠，就几乎必然在 `manifest.json` 这一关撞车。**这是整套同步里唯一的单文件写入热点。**

## 目标

- 移除中央 `manifest.json` 写入，消除单文件热点。
- 把「索引 + 乐观锁」下沉到**每文件粒度**：用 Git 目录树里每个 blob 自带的 `sha` 作索引与锁。
- 冲突面从「任意两设备重叠即冲突」降到「仅同一文件被并发编辑才冲突」。
- 满足用户明确提出的同步前判定：**目录树中 sha 与本地一致则不更新，不一致才更新。**

## 范围

**包含**
- 索引获取：从「读 `manifest.json`」改为「列 `kb/` + `todos/` 目录拿到每文件 sha」。
- 本地基线缓存：新增 `wb.syncState.v1`（path→sha），替代 `wb.manifestSha.v1` 单值。
- 同步前判定逻辑：三态（仅本地改 / 仅远端改 / 双方改）→ push / pull / LWW 合并。
- 删除传播：本地删除经墓碑集合发 DELETE。
- 适配 `pushImage` / `publishToMirror`（本就不依赖 manifest，基本不变）。
- 旧仓库迁移：过渡期读一次远端 `manifest.json` 播种本地基线。

**不包含**
- 不改 GitHub 远端仓库结构（`kb/`、`todos/`、`images/` 路径不变）。
- 不改 Worker 代理白名单（目录列表复用现有 `contents/*` 路径）。
- 不引入新的同步协议/版本号（向后兼容旧仓库）。
- 不处理「同一文件内容级三方合并」（保持现有 LWW，按 `updatedAt` 取新）。

## 待确认问题（已确认）

1. **索引端点**：✅ **目录列表 `contents/kb` + `contents/todos`**（复用代理白名单，零代理改动）。`git/trees` 备选被否。
2. **旧 `wb.manifestSha.v1` / 旧仓库迁移**：✅ **直接重推自愈**——不读远端 `manifest.json` 播种，首轮按 LWW 全量重推（实现更简单，接受首轮一批写）。故 `getManifest` 可直接废弃，不做播种分支。
3. **本地删除模型**：✅ **硬删 + 本地墓碑集合**（DELETE 带 treeSha 锁），与每文件自管元数据一致；不保留 `deleted:true` 软删。
4. **images 是否进索引**：✅ 不进（内容寻址、天然幂等、无冲突），保持现有 `pushImage`/`deleteImage` 自管 sha。

> 用户明确：方案先不进入 03 实现，待进一步调整后再启动。

## 验收口径

- 多设备各改不同文章并发同步：不再出现 `manifest.json` 409 冲突（冲突重试计数应主要为 0）。
- 同步前判定：远端 sha == 本地基线 sha 的文件，本轮不发任何 PUT/GET（日志可证）。
- 单测：blob sha 计算与 GitHub 一致；三态判定矩阵全绿；旧仓库迁移首轮自愈。
- 回归：现有 `npm test` 全绿、`npm run build` 通过。
