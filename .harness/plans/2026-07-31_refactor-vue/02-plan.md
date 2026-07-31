# 02. Plan —— 方案设计

> 派生自 `.harness/design.html`（已评审）。实现严格对齐 design §2 功能清单。

## 代码结构与现状（design §3.2 落地情况）

| 层 | 路径 | 状态 |
|----|------|------|
| 入口 | `index.html` / `src/main.ts` / `src/App.vue` / `src/router/index.ts` | ✅ 脚手架 + hash 路由（todos/notes/graph）；App 顶栏仅占位 |
| 类型 | `src/types/index.ts` | ✅ Todo/Article/Config/Manifest/SyncPhase |
| 数据层 | `src/stores/data.ts` | ✅ CRUD + batch + 双链改名联动 + Todo→Article + SyncAdapter |
| 同步纯函数 | `src/services/sync/{merge,serialize}.ts` | ✅ LWW 合并 / 30 天墓碑清理（已单测） |
| 同步引擎 | `src/services/sync/engine.ts` | ✅ 防抖推送 / 轮询 / 并发排队 / 冲突重试×3 / 统一返回值 |
| GitHub 服务 | `src/services/github/{client,notes,manifest,contents,diagnose}.ts` | ✅ 超时/错误映射/代理/逐文件 PUT/manifest/五步诊断（已单测） |
| Markdown | `src/lib/markdown/{index,wikilink,frontmatter,highlight}.ts` | ✅ marked + DOMPurify + 双链/高亮扩展（已单测） |
| 双链/标签 | `src/lib/{links,slug}.ts` | ✅ 出链/入链/缺失/改名联动/标签聚合（已单测） |
| 基础组件 | `src/components/common/*` | ❌ 未建（BaseSheet/Toast/SyncChip/Settings/Diagnose） |
| 待办组件 | `src/components/todos/*` | ❌ 未建 |
| 知识库组件 | `src/components/kb/*` | ❌ 未建（ArticleList/Editor/Preview/LinksPanel/WikiAutocomplete/TagCloud） |
| 图谱组件 | `src/components/graph/GraphCanvas.vue` | ❌ 未建 |
| 视图 | `src/views/{TodosView,NotesView,GraphView}.vue` | ❌ 均为占位 stub |

## 调用链（以"改标题联动改引用"为例）

`NotesView` → `useDataStore.updateArticle(id, {title})` → `lib/links.renameRefs`（纯函数，重写其它文章 `[[旧标题]]`）→ 置脏 + `engine.schedulePush()`（1.5s 防抖）→ `engine.doSync` → `fetchRemote`（manifest + 各 kb 文件）→ `mergeNotes`（LWW）→ `pushRemote`（逐文件 PUT + manifest 乐观锁，S10 重试）。

## 实施顺序（design §5，标注已完成项）

1. ✅ 脚手架 + TS/目录/CI 配置
2. ✅ 类型 + 数据层 + 纯算法 + 单测（**已全绿：61 passed**）
3. ✅ 同步引擎移植（单测 + 类型检查通过）
4. ✅ Markdown（marked + 扩展 + DOMPurify，单测通过）
5. ⬜ 基础组件与样式（BaseSheet / Toast / 布局 / CSS 变量融合 Element Plus）
6. ⬜ 待办视图（T1-T15）
7. ⬜ 知识库视图 + 双链 + 自动补全 + 标签云（N1-N10/L1-L11/A1-A7/TAG1-TAG5）
8. ⬜ 图谱视图（G1-G8，d3-force）
9. ⬜ 设置面板 + 诊断 + 导出（S17-S21）
10. ⬜ 全量回归 + 移动端 + 部署（配合 AGENTS.md 红线改写）

## 数据模型（design §2.10 / §4.1）

- 文章 = `kb/<slug>.md`（frontmatter: id/title/createdAt/updatedAt/deleted/fromTodo/tags/publish/aliases + 正文）。
- `manifest.json`：`{version, updatedAt, articles: {slug -> {id,title,updatedAt,deleted,sha}}, todosSha}`。
- 待办结构化，本地 `wb.data.v1` 缓存快照；令牌仅存 `wb.cfg.v1`，不落库。

## 测试策略（design §6）

- 单元（Vitest）：合并/墓碑/slug/双链/改名/标签聚合/Markdown 语法 —— **已完成并全绿**。
- 组件（Vitest + @vue/test-utils）：筛选/搜索组合、卡片状态切换、自动补全键盘交互 —— **待补**。
- 类型检查：`vue-tsc --noEmit`，CI 强制 —— **当前零错误**。

## 风险

- 重写遗漏行为（🔴）：design §2 清单逐条验收。
- 联调误写生产仓（🔴）：测试仓库隔离，提交前不配置生产 repo。
- UI 工作量大（🟡）：按视图分片推进，每片以单测 + 类型检查门禁。
