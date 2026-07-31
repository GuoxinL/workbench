# 03. Implement —— 实现记录

> design.html 已评审；本步将 design §5 的步骤 5-9 落地。核心逻辑层（types/store/services/lib）在接手前已完成并通过单测（61 passed），本步补齐 UI 层。

## 本轮已完成（UI 层）

### 步骤 5 基础组件与样式
- `src/lib/colors.ts`：8 色分类常量（T2），供色板 / 标签取色复用。
- `src/styles/variables.css` / `base.css`：CSS 变量 + 布局（沿用旧版语义）。
- `src/components/common/SyncChip.vue`：顶栏同步状态胶囊 + 手动同步（S6/S15）。
- App 顶栏接入 SyncChip，三视图 + 标签导航齐备。

### 步骤 6 待办视图（T1-T15）✅
- `views/TodosView.vue` + `components/todos/{TodoComposer,TodoFilters,TodoCard,TodoEditSheet,ColorSelect}.vue`
- 覆盖：快速创建(T1)、8 色(T2)、3 档状态(T3)、未完成在前排序(T4)、状态筛选(T5)、颜色筛选二次点击取消(T6)、160ms 搜索防抖(T7)、圆圈切换完成(T8)、编辑抽屉(T9)、Esc/⌘Enter(T10)、遮罩关闭(T11)、逾期高亮(T12)、删除确认(T13)、空状态区分(T14)、标题非空校验(T15)。

### 步骤 7 知识库视图（N1-N10 / L1-L11 / A1-A7 / TAG1-TAG2）✅
- `views/NotesView.vue` + `components/kb/{ArticleList,ArticleEditor,LinksPanel,WikiAutocomplete}.vue`
- 覆盖：列表(T1)、150ms 搜索(T2)、新建去重+进编辑全选(T3)、阅读/编辑双模式(T4)、700ms 自动保存+flushNow(T5)、编辑防打断(N6)、元信息(T7)、标题去重(N8)、删除(N9)、双链出/入链面板(L3/L4)、缺失创建(L5)、计数(L6)、预览跳转(L7)、缺失样式(L8/L9/L10)、改名联动改引用(L11)、`[[` 自动补全(镜像 div 坐标 / 候选过滤 / 新建项 / 键盘 / 智能闭合)(A1-A7)、标签编辑与彩色 chip(TAG1/TAG2)。

### 步骤 8 图谱视图（G1-G8）✅
- `views/GraphView.vue`（延迟 30ms 渲染 G8）+ `components/graph/GraphCanvas.vue`（d3-force 布局、SVG 渲染、手写指针拖拽/滚轮缩放、点击跳转、重新布局、空状态）。

### 步骤 7 续 标签云视图（TAG3/TAG4）✅
- `views/TagsView.vue`：`/tags` 路由 + 顶栏「标签」；字号随频次、彩色、点击筛选该标签文章。

## 验证
- `npm run build`（`vue-tsc --noEmit` + vite build）零错误，产物 ~169KB gzip。
- `npx vitest run` 全绿：68 passed（含新增 `stores/__tests__/data.test.ts` 覆盖 T2/T8/T13/X7/N3/N9/L11）。
- 注：Node 当前 shell 为 20.14.0，Vite 8 建议 ≥20.19；构建仍通过。

## 与 Plan 的差异 / 待办（尚未实现）
- **步骤 9 设置面板 + 诊断 + 导出（S17-S21）✅ 已完成**：新增 `services/github/diagnose.ts`（S17 测试连接 / S18 五步诊断）、store `saveConfig`/`getConfig`/`exportBackup`、首次播种 `seedIfEmpty`（X3）；`components/common/SettingsSheet.vue`（配置同步、测试连接、五步诊断、导出备份、保存校验）；App 顶栏接入「⚙ 设置」入口；`beforeunload` flush（S20）。
- **AGENTS.md 红线改写（decision 2）✅ 已执行**：红线 2（禁框架）/ 红线 3（必跑 bump-version.sh）标注已移除；红线 4 指向新模块路径；令牌安全红线保留；「技术栈与验证方式」更新为 Vite 构建 + CI 校验。
- **TAG5 / §3.5 VitePress 发布站**：独立工程，未启动（可后续单独立项）。
- **X5 PWA manifest / X6 版本号**：`manifest.json` 与版本展示未接（低优先）。

## 下一步建议
1. SettingsSheet（配置同步 + 五步诊断 + 导出 + 首次播种）—— 让同步真正可启用。
2. AGENTS.md 红线改写（decision 2）。
3. （可选）VitePress 发布站（TAG5 / §3.5）。
