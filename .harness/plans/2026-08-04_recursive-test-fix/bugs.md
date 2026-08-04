# Bug 收集与修复清单

> 递归测试线上页面收集的 bug。每发现一个即修复一个并推送到线上（不等待验证），
> 修复记录写入本文档，全部测完后统一验证。

## Bug #1 — 描述中点击双链会误触发「编辑待办」抽屉

- **状态**：🟢 已修复，已合入 main 推送部署（merge `43593b7`）
- **严重度**：中（UX 冲突，非崩溃）
- **现象**：待办卡片描述里包含双链时，点击链接会冒泡触发 `.body` 的 `@click="emit('edit')"`，导致弹出「编辑待办」抽屉。missing 链接（href="#"）点击只弹抽屉不跳转，尤为明显。
- **根因**：`src/components/todos/TodoCard.vue:64` `<div class="body" @click="emit('edit')">` 未对 v-html 注入的 `<a class="wikilink">` 点击做隔离。
- **修复**：在 `.body` 点击处理器中，若 `event.target` 是最接近的 `a` 链接则跳过编辑（让链接默认行为跳转/不冒泡）。

## Bug #2 — milkdown 序列化把行首 `#` 转义为 `\#`，导致 markdown 标题失效

- **状态**：🟢 已修复，已合入 main 推送部署（merge `6a176eb`）
- **严重度**：高（破坏 markdown 标题/H1-H6 解析，影响字数/大纲/链接关系）
- **现象**：文章在 milkdown 编辑器中输入 `## 测试标题` 后保存，存储内容被序列化为 `\# 测试标题`（行首 `#` 前多了反斜杠）。渲染时因 `\#` 不是 markdown 标题语法，`#` 当字面字符显示，标题不生效；列表/卡片中显示带 `\` 的摘要；「大纲」显示「暂无标题」；字数计算也按字面字符。
- **受影响范围**：所有通过 milkdown 编辑的文章的行首 `#` 标题字符都会被转义，同样可能影响 `*`（行首列表）、`**`（行首加粗）、`>`（行首引用）等其他 markdown 标记。
- **根因**：`src/components/kb/MilkdownEditor.vue` 配置 `remarkStringifyOptionsCtx` 时只合并了 `handlers`，保留了默认的 `gfm/commonmark` 字符串化器但没处理 `escape` 行为：remark 当文档中 `text` 节点内容包含 markdown 特殊字符（`#`、`*`、`_`、`` ` ``、`[`、`]`、`(`、`)` 等）时会自动加反斜杠转义。这是 `text` 节点序列化器默认行为，需要通过 `remarkStringifyOptions.escape` 或包装 handler 来跳过。
- **修复**：在 `remarkStringifyOptionsCtx` 中增加对 `text` 节点的 handlers 包装：跳过原始 markdown 标记的转义（保留文档原始字符，例如行首 `#` 不转义）。

## Bug #3 — 同步失败时静默吞错，用户无法诊断原因

- **状态**：🟢 已修复，已 push 到 main 部署中（`7693501`，待部署完成 + 待统一验证）
- **严重度**：中（同步是核心功能，失败无诊断信息影响排障）
- **现象**：右上角显示「同步失败」红色 chip，但点击「测试连接」返回「诊断全部通过」；新建文章后状态变为「同步失败」，但没有任何错误信息。点击 chip 重试也没线索。
- **根因**：`src/services/sync/engine.ts:155` `catch { adapter.setPhase('error') }` 直接吞掉异常，没有记录/传递错误信息；`src/stores/data.ts:322` `setPhase` 只设置 phase，没有错误信息字段。
- **修复**：在 `setPhase('error')` 时记录错误到 store（如 `lastSyncError`），在 SyncChip 点击时显示一个简短错误。

## Bug #4 — 含双链/强调的标题点击大纲无法定位

- **状态**：🟢 已修复，已 push 到 main 部署完成（`7bf8e73`，Deploy run 成功，待统一验证）
- **严重度**：中（大纲导航失效，影响长文阅读体验）
- **现象**：文章标题若包含双链 `[[x]]` 或强调 `**x**`/`*x*`/`` `x` ``/链接，点击右侧大纲项不会滚动定位到该标题（如同点击无反应）。
- **根因**：`src/components/kb/ArticleOutline.vue:13` 大纲的 `id` slug 由**序列化 markdown 原文** `text.toLowerCase().replace(/\s+/g,'-')` 生成（含 `[[x]]`/`**` 等原始语法）；而 `src/components/kb/ArticleEditor.vue:206 onJumpToHeading` 用**渲染后纯文本** `h.textContent` 生成 slug 匹配。两者不一致，例如标题 `## 见 [[文档]]`：大纲 id=`见-[[文档]]`、渲染 slug=`见-文档`，永不相等。普通场景 `## **重要** 标题` 同样失效。
- **修复**：在 `ArticleOutline.vue` 增加 `cleanHeadingText()`，对标题文本先剥离 markdown 语法（`[[x]]`→`x`、`**x**`/`*x*`/`` `x` ``/`~~x~~`→`x`、`[t](u)`→`t`）后再用于显示与生成 slug；显示也同步去掉丑陋的原始语法。大纲 slug 与渲染 textContent slug 由此对齐，`jump` 可正确命中。

## Bug #5 — 文章代码渲染无可见外框（行内 + 围栏代码块）

- **状态**：🟢 已修复，已 push 到 main 部署中（待统一验证）
- **严重度**：中（代码不可辨识，影响阅读体验，但非数据/功能损坏）
- **现象**：文章（阅读视图与编辑器内）中行内代码 `code` 与多行围栏代码块 `pre code` 都没有可见外框/背景，行内代码与正文几乎无区分，代码块只有极浅边框。
- **根因**：`src/styles/base.css` 中 `.milkdown code` 背景设为 `var(--bg)`（等于页面背景 → 不可见）且无边框；`.milkdown pre` 只用 `--line`（极浅分割线）作边框。而 nord 主题（`@milkdown/theme-nord/style.css`，经 `main.ts:6` 引入）本应提供灰色背景，但其规则依赖 Tailwind v4 变量（`--color-gray-200/100/700`、`--spacing`、`--font-mono` 等），本项目未引入 Tailwind v4，这些变量未定义 → nord 的代码背景声明无效，实际完全回退到 base.css 的不可见配色。编辑器内 nord 的 `.milkdown-theme-nord code`（特异性 0,2,1，且可能运行时注入）还会盖过 base.css 的 `.milkdown code`（0,1,1）。
- **修复**：在 `src/styles/variables.css` 新增令牌 `--code-bg`/`--code-block-bg`/`--code-border`（明/暗双模式）；`src/styles/base.css` 中将代码规则选择器提升为 `.milkdown code, .milkdown-theme-nord code, .milkdown pre, .milkdown-theme-nord pre` 并加 `!important` 覆盖 nord 运行时注入，确保行内代码有可见背景+边框、代码块有清晰边框，且不影响代码块内部 `code`（重置背景/边框）。
