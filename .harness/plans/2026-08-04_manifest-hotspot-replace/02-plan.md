# 02. Plan —— 中央 manifest.json 热点替代

> 用户原话目标：「细化这个方案；整体数据流节点，sha 如何生成，保存在哪里，目录树中 sha 如何存储，同步前查询如果 sha 一致则并不更新，否则更新」

---

## 一、核心思路一句话

不再维护一本所有人都要抢着写的「目录本 `manifest.json`」。改成：**每次同步先列一次 `kb/` 和 `todos/` 目录，GitHub 免费告诉我每个文件当前的 blob `sha`（这本身就是内容指纹）；本地再算一份自己的内容指纹，两边指纹一致 = 没变 = 不碰它，不一致才拉/推/合并。** 写入从「1 个共享文件」变成「N 个独立文件」，冲突面塌缩到「只有同一篇被两个人同时改」才会冲突。

---

## 二、整体数据流节点

```
┌─────────────┐   ① ②      ┌──────────────────────────────┐
│  本地 Pinia   │ ───────▶  │  data.ts（唯一 localStorage 出入口）│
│  articles/    │           │  wb.syncState.v1 = {path→sha}  │
│  todos/       │ ◀───────  │  （本地基线缓存，仅此处读写）      │
│  墓碑集合      │   ③       └──────────────┬───────────────┘
└─────────────┘                            │ ④ load/save 基线
                                           ▼
┌─────────────────────────────────────────────────────────┐
│  sync engine（src/services/sync/engine.ts）               │
│   1. 计算每篇 localSha = gitBlobSha(serialize(本地))        │
│   2. 调 fetchIndex → 远端目录树 {kb/<id>.md: sha, ...}      │
│   3. 三态判定（见第四节）→ pull / push / LWW 合并 集合      │
│   4. 按 id 差分 GET/PUT（带远端 sha 作乐观锁）              │
│   5. 每成功一次 → 更新本地基线[path] = 返回 sha             │
│   6. 冲突(409) → 重拉该文件 + LWW 合并 → 重试（≤3 次 S10）  │
└───────────────┬─────────────────────────────────────────┘
                │ ⑤ contents API（复用现有代理白名单）
                ▼
┌─────────────────────────────────────────────────────────┐
│  GitHub 远端仓库（workbench-data）                          │
│   kb/<id>.md        每篇正文（frontmatter 含元数据）         │
│   todos/<id>.json   每条待办                               │
│   images/<sha>.<ext> 图片（内容寻址，不进索引）              │
│   （不再有 manifest.json 写入；旧文件留作孤儿无害）          │
└─────────────────────────────────────────────────────────┘
```

**节点清单**
- ① 本地数据源：Pinia store → `getLocalArticles()` / `getLocalTodos()` / 本地删除墓碑集合。
- ② 本地基线：`wb.syncState.v1`（`path → sha`），由 `data.ts` 唯一读写（守红线 4）。
- ③ 索引源：`GET /repos/{o}/{r}/contents/kb?ref=main` + `.../contents/todos?ref=main` → 每个条目带 `sha`，**不含正文**。
- ④ 引擎：计算 `localSha`、三态判定、差分 GET/PUT、更新基线、冲突重试。
- ⑤ 远端：每文件独立 blob，自带 GitHub 计算的 `sha`。

---

## 三、sha 如何生成 / 保存在哪里

### 3.1 远端 sha（权威）
GitHub 在每次存储 blob 时计算 **SHA-1(`blob <字节长度>\0<UTF-8 内容>`)**，作为该文件的永久指纹。通过目录列表（每个条目 `sha` 字段）和 PUT 响应（`data.sha`）返回。**无需我们生成，直接用。**

### 3.2 本地 sha（用于「是否变化」判定）
新增 `src/services/github/blobSha.ts`：

```ts
// git blob sha = SHA-1( "blob " + content.length + "\0" + utf8(content) )
export async function gitBlobSha(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content)
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`)
  const buf = new Uint8Array(header.length + bytes.length)
  buf.set(header); buf.set(bytes, header.length)
  const digest = await crypto.subtle.digest('SHA-1', buf)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}
```
- 浏览器（GitHub Pages 为 https，安全上下文）与 Node 20（vitest）均原生支持 `crypto.subtle`。
- 与 GitHub 计算结果**逐字节一致**的前提：`serializeFrontmatter` 输出确定（无随机格式、无时间戳漂移）。基线存「上次成功 PUT 后返回的远端 sha」，与本地重序列化结果天然相等。

### 3.3 保存在哪里
| 角色 | 位置 | 说明 |
|------|------|------|
| 远端 blob sha | GitHub 对象库 | 经目录列表 / PUT 响应读取，不额外存储 |
| 本地基线 | `wb.syncState.v1`（localStorage） | `{ "kb/<id>.md": "abc…", "todos/<id>.json": "def…" }`，**仅经 `src/stores/data.ts` 读写** |
| 旧 `wb.manifestSha.v1` | 废弃 | 过渡期只读一次（若 `wb.syncState.v1` 为空且远端 `manifest.json` 存在），播种基线后不再使用 |

---

## 四、目录树中 sha 如何存储（索引结构）

目录列表 `GET contents/kb?ref=main` 返回 JSON 数组，每项形如：
```json
{ "name": "msen84660w84px.md", "path": "kb/msen84660w84px.md",
  "sha": "a1b2c3…", "size": 312, "type": "blob" }
```
**我们做的事**：把它压成 `Map<path, sha>`，不存任何额外内容到 GitHub。每次同步现拉现用（只读，无写入）。

- `kb/` 列表 → `articlesIndex: Record<id, sha>`（`id` 从 path 截取）。
- `todos/` 列表 → `todosIndex: Record<id, sha>`。
- `images/` **不进索引**（内容寻址、幂等、不会冲突，保持 `pushImage`/`deleteImage` 自管 sha）。

> 这就是「目录树中 sha 的存储」——没有任何中心文件，sha 跟随每个 blob 天然存在，索引只是每次现拉的投影。

---

## 五、同步前判定：sha 一致则不更新，否则更新（核心）

对「本地 id 集合 ∪ 远端 path 集合」中每个 id，取三枚指纹：
- `treeSha` = 远端目录树里的 sha（无则 absent）
- `baseSha` = 本地基线 `wb.syncState.v1[path]`（无则 absent，表示从未成功同步过）
- `localSha` = `gitBlobSha(serialize(本地文章))`（本地已删除则该 id 走墓碑分支）

判定矩阵：

| # | 本地 | treeSha | localSha vs baseSha | 动作 |
|---|------|---------|---------------------|------|
| A | 无 | 有 | — | **PULL**：GET 正文 → LWW 合并入本地 |
| B | 有 | 无 | — | **PUSH**：PUT（无 sha = 新建）|
| C | 有 | 有 | localSha **===** treeSha | **跳过（不更新）** ← 用户要的「sha 一致则不更新」 |
| D | 有 | 有 | localSha === baseSha，treeSha ≠ baseSha | **PULL**：仅远端改，本地没动 |
| E | 有 | 有 | localSha ≠ baseSha，treeSha === baseSha | **PUSH**：仅本地改，锁 sha = treeSha |
| F | 有 | 有 | localSha ≠ baseSha，treeSha ≠ baseSha，treeSha ≠ localSha | **CONFLICT**：GET 远端 → 按 `updatedAt` LWW 合并 → PUSH 合并结果（锁 sha = treeSha）|
| G | 墓碑(已删) | 有 | — | **DELETE**：带 treeSha 锁删远端文件 |

**要点**
- 唯一「整轮不写远端」的短路（沿用现有优化，避免空提交）：当 pull/push/delete 集合全空时直接返回，不触发任何写。
- 冲突只有 F 一种，且限定「同一文件」——相比现在「任何两设备重叠即 manifest 409」，冲突面大幅下降。
- 每次成功写后：`baseSha[path] = 返回 sha`；DELETE 成功后：删除该基线条目 + 墓碑条目。

---

## 六、改动文件与调用链

### 新增
- `src/services/github/blobSha.ts`：`gitBlobSha(content)`（Web Crypto SHA-1）。
- `src/services/github/listDir.ts`：`listDir(dir, config) → { path, sha }[]`（封装 `GET contents/{dir}?ref=...`，复用 `githubRequest`；目录返回数组，非单文件 → `getFile` 不适用，需新写）。
- `src/services/sync/diff.ts`：`planSync(local, treeIndex, baseSha) → { pull, push, del, conflicts }`（实现第四节矩阵，替代 `manifest.planDiff` 的 `updatedAt` 比较）。

### 修改
- `src/services/github/contents.ts`
  - `fetchManifest` → 改名 `fetchIndex`，内部调 `listDir('kb')` + `listDir('todos')`，返回 `{ articles: {id:sha}, todos: {id:sha} }`（不再读 `manifest.json`）。
  - `pushRemote(input, config)`：移除 `baseManifest` / `manifestSha` 入参；改为接收 `baseShaByPath: Record<path,sha>`；逐文件 PUT 用 `treeIndex[path]` 作乐观锁；**删除 `putManifest` 调用**。保留既有的「422 且未带 sha → GET 当前 sha 重试」兜底（针对孤儿文件）。
  - `pushImage` / `deleteImage` / `publishToMirror`：本就不依赖 manifest，基本不动（`getFile` 已自管 sha）。
- `src/services/github/manifest.ts`
  - 删除 `putManifest`（不再写中央文件）。
  - `getManifest` 保留但标 `@deprecated`，仅用于过渡期播种基线（读一次远端 `manifest.json` → 填入 `wb.syncState.v1`）。
  - `planDiff` 标记废弃，逻辑迁至 `sync/diff.ts`。
- `src/services/sync/engine.ts`
  - 用 `fetchIndex` 替 `fetchManifest`；`planDiff` 替 `planSync`。
  - 加载/保存本地基线（经 `data.ts`）；计算 `localSha` 喂给 `planSync`。
  - 删除 `setManifestSha` 回调，改在每次成功写后更新基线并落盘。
  - 冲突重试（S10，≤3 次）保留，但现在是「单文件冲突」粒度而非整轮 manifest 冲突。
- `src/stores/data.ts`
  - 新增 `getSyncState()` / `setSyncState(map)` 读写 `wb.syncState.v1`（守红线 4，唯一出入口）。
  - 首次运行：若 `wb.syncState.v1` 空且 `wb.manifestSha.v1` 存在 → 不阻塞，交由引擎过渡期播种。

### 测试
- 新增 `blobSha.test.ts`：用一段已知内容比对 `@octokit/rest` 风格的 git blob sha（或固定向量）。
- 新增 `listDir.test.ts`：mock `githubRequest` 返回目录数组，断言压成 path→sha。
- 新增 `diff.test.ts`：覆盖第四节矩阵 A–G 全部 7 行。
- 改 `contents.test.ts` / `engine.test.ts`：移除 manifest 相关断言，改为 index + baseline 语义；保留 422 兜底、冲突重试用例。
- 改 `manifest.test.ts`：标记 `getManifest` 仅播种用途，删 `putManifest` 测试。

---

## 七、迁移与兼容

- **新仓库**（无 `manifest.json`）：直接走新流程，基线从空起步，首轮按矩阵自愈。
- **旧仓库**（有 `manifest.json`）：✅ **直接重推自愈**——不读远端 `manifest.json` 播种，`wb.syncState.v1` 从空起步；首轮所有本地文件按矩阵 B/E 行判定为「本地较新 / 新建」→ PUSH，远端被覆盖为本地内容（LWW 取本地胜），远端 `manifest.json` 沦为孤儿文件（无害，可后续手动清理，不在本任务范围）。`getManifest`/`putManifest` 直接废弃删除，不做播种分支。
- **图片**：不受影响，保持内容寻址。

---

## 八、风险与缓解（摘自上 overview 风险速览）

| # | 风险 | 缓解 |
|---|------|------|
| 1 | 旧 `wb.manifestSha.v1` 无法推每文件基线 → 首轮全量重推 | 按用户决策「直接重推自愈」：不读 `manifest.json` 播种，首轮 LWW 全覆盖，远端旧内容被本地胜出 |
| 2 | 序列化非字节稳定 → 同内容 sha 不同，误判变更 | 保证 `serializeFrontmatter` 确定性；基线存远端返回 sha |
| 3 | 目录列表随图片增长 | 索引只列 `kb/`、`todos/` |
| 4 | 本地删除需传播远端 | 墓碑集合 + DELETE（带 treeSha 锁）|

---

## 九、UT / IT 用例（节选，与实现阶段 §6 对齐）

**UT**
1. `gitBlobSha` 对固定串输出等于对应 git blob sha（向量测试）。
2. `listDir` 把 `[{path,sha}]` 正确投影；忽略 `type:'tree'` 的非文件项。
3. `planSync` 矩阵 A–G 七行各一例：C 行断言「跳过」、E 行断言「PUSH 带 treeSha」、F 行断言「conflict」。
4. `pushRemote`：给定 `baseShaByPath`，PUT body 含 `sha`；无 sha 时 422 → GET 重试一次成功。
5. 引擎：基线缺失时首轮按 LWW 全量重推自愈（不读 `manifest.json` 播种）；全一致时零写（短路）。

**IT（真实链路，06 步骤，需真实 token/仓库）**
- IT-1：设备甲改文章 A、设备乙改文章 B，并发同步 → 双方均成功，冲突重试计数 = 0（验证热点消除）。
- IT-2：同文章被两设备并发改 → 触发 F 行冲突，LWW 合并后远端为较新 `updatedAt` 版本，重试 ≤3 次成功。
- IT-3：本地删除文章 → 远端对应 `kb/<id>.md` 被 DELETE（墓碑传播）。
- IT-4：目录树 sha == 本地基线 sha 的文件，本轮日志显示「skip」、无 GET/PUT。

---

## 十、同步状态机与状态指示器（已确认）

### 10.1 状态集合（SyncPhase 终态）
在现有 `'idle' | 'syncing' | 'ok' | 'error' | 'off'` 基础上**新增 `'uptodate'`**：
- `uptodate`：本轮检查完毕、所有 sha 一致、零传输 → **静默态**（只刷「上次检查时间」，不弹提示）。
- `ok`：本轮有传输（push/pull/del 非空）才表示「已同步」。
- 其余不变。`types/index.ts` 的 `SyncPhase` 改为 `'idle' | 'off' | 'syncing' | 'uptodate' | 'ok' | 'error'`。

### 10.2 状态流转（核心，与 §五 矩阵一致）
| 当前态 | 事件 | 下一态 |
|--------|------|--------|
| idle/off | 触发 & 启用 & 配置全 | `syncing` |
| idle/off/任意 | 触发但禁用/配置不全 | `off` |
| syncing | 拉完索引 + 三态判定 pull/push/del 全空（sha 全一致） | `uptodate` |
| syncing | 传输成功（非空） | `ok` |
| syncing | 冲突(409) & 重试 < 3 | `syncing`（自环，自愈）|
| syncing | 冲突耗尽 / 异常 | `error` |
| uptodate/ok/error | 下一轮触发 | `syncing` |

> 唯一「活跃」态是 `syncing`（转圈）；其余皆静止终态，停留到下一轮触发。冲突不自环到 `error`，先重试 ≤3 次（`engine.ts` while 循环），耗尽才落 `error`。

### 10.3 颜色语义（UI 配色）
| 颜色 | 语义 | 对应态 |
|------|------|--------|
| 🔵 蓝 | 活跃/进行中 | `syncing`（脉冲动画）|
| 🟢 绿 | 健康/成功 | `uptodate`（静默）、`ok` |
| 🟡 黄 | 警告/重试 | `syncing` 冲突自环 |
| 🔴 红 | 失败 | `error`（含「重试」按钮）|
| ⚪ 灰 | 中性/静止 | `idle` |
| ⚫ 黑 | 停用 | `off` |

### 10.4 状态指示器样式（**已定：App=③纯点 / PC=①药丸**）
提供三种预览样式（见 `state-machine.html` 的「实际状态指示器预览」），落地决策：
- **PC 端 → ① 药丸（点 + 字）**：透明底 + 彩色圆点 + 短标签 + 长说明（如「上次检查 12:30」「上传 2 · 拉取 1」）。信息最全，用于设置/详情页。
- **App 端 → ③ 纯点（无文字）**：仅一个 9px 彩色圆点，`idle` 空心环、`syncing` 脉冲、`error` 红点；状态名仅在悬浮 `title` 显示。最省空间，用于移动端顶栏。
- ② 徽章（纯色字）作为备选，未采用。

**实现要点（新增一个状态指示器组件，按端切换渲染）**
- 组件入参：`phase: SyncPhase` + `mode: 'pc' | 'app'`。
- `pc` 模式渲染 `pill`：`dot + name + meta`；`syncing` 加 `pulse` 类，`error` 加「重试」按钮（回调 `sync(true)`）。
- `app` 模式渲染纯 `dot`：`background` 取态色，仅 `title` 带状态名。
- 两者颜色均取自 §10.3 的语义色（避免再绕 `var()` 嵌套，直接用 hex，见 `state-machine.html` 已验证）。
- `SyncOutcome` 增加 `pulled/pushedN/deleted` 计数，供 PC 端 `ok` 态显示条数。
- `data.ts` 增加 `lastSyncAt` ref，`uptodate`/`ok` 时刷新，供 PC 端「上次检查」展示。

### 10.5 错误恢复 UI
`error` 态非终态：显示错误文案（冲突 / 401 / 403 / 404 / 网络）+ 冲突文件 slug（若有）+ 「重试」按钮（立即 `sync(true)`）。下一轮轮询自动重试。LWW 可能静默覆盖较旧本地编辑，文案需提示用户。

---

## 十一、预估改动行数

核心逻辑（blobSha + listDir + diff + engine + contents 改造 + data.ts 基线 + 状态指示器组件）约 **300–400 行**（不含测试/文档），**非小需求模式**，按标准 SOP 九步推进。
