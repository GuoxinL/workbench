# 02. Plan —— 文章转载导入（AI 网页 → 工作台格式）

> 用户真实需求：「浏览想要转载的网页，通过 AI 将其转换为个人工作台的格式并保存，同时记录被转载文章的人和原链接等信息。」
> 决策：扁平字段（已设计）；**删除 sourceLicense，改为 `sourceAuthorized` 授权闸门——未获授权即不可转载**；本次仅出方案文档，不实装。

---

## 一、核心思路一句话

提供「转载导入」入口：用户给出目标网页 URL（或粘贴网页内容）→ AI 抓取正文并转换为工作台文章格式（Markdown + frontmatter）→ 自动回填转载来源字段（`sourceAuthor`/`sourceUrl`/`sourceSite`/`sourcePublishedAt`）→ 用户**手动勾选授权闸门**后保存为转载文章。整文件 LWW 同步天然兼容，旧文章无字段即视为原创、无需迁移。

---

## 二、真实主路径：AI 网页转载导入流程

```
┌────────────┐   ① URL/粘贴   ┌──────────────────────────┐
│  用户在工作台  │ ───────────▶ │  转载导入入口（命令/按钮）     │
│  浏览到好文   │              └────────────┬─────────────┘
└────────────┘                            │ ② 抓取正文
                                          ▼
                          ┌────────────────────────────────┐
                          │  抓取层（见 §2.1，受控/合规）      │
                          │   URL → 网页 HTML/正文文本         │
                          └────────────┬───────────────────┘
                                       │ ③ AI 转换
                                       ▼
                          ┌────────────────────────────────┐
                          │  AI 转换（见 §2.2）               │
                          │   HTML/正文 → Markdown 正文        │
                          │   meta/署名 → 转载字段             │
                          │   图片 → pushImage 内联引用        │
                          └────────────┬───────────────────┘
                                       │ ④ 回填编辑器
                                       ▼
                          ┌────────────────────────────────┐
                          │  文章编辑器（见 §五）             │
                          │   正文 + 转载信息区（字段已预填）   │
                          │   sourceAuthorized 留空待确认      │
                          └────────────┬───────────────────┘
                                       │ ⑤ 用户勾选「已获授权」
                                       ▼
                          ┌────────────────────────────────┐
                          │  保存：data.ts 单一出入口          │
                          │  repost=true（仅当授权+来源齐全）  │
                          │  → 同步 kb/<id>.md（见 §四）       │
                          └────────────────────────────────┘
```

### 2.1 抓取层（两种方案，推荐先 A）

- **方案 A（零服务端改造，推荐先落地）**：用户在浏览器复制网页内容直接**粘贴**到导入框，AI 在本地/对话内转换，不依赖服务端抓取。简单、合规、无需改造代理。
- **方案 B（自动抓取，增强项）**：经现有 `proxy/cloudflare-worker.js` 新增**受控「文章抓取」端点**——仅允许 `GET` 指定 URL、限流、返回正文文本，**不开放任意 URL 中转**（守红线 3：Worker 代理只做白名单透传）。需扩展代理白名单 + 服务端部署更新。
- 首版可只做 A，B 作为后续增强；两者产出的「网页正文」给到同一 AI 转换步骤。

### 2.2 AI 转换（核心）

AI 将网页内容转换为工作台文章结构：

1. **正文转 Markdown**：保留标题层级、段落、列表、代码块、引用、表格、图片链接；剥离广告/导航/侧边栏等噪声。
2. **提取转载字段**（即 §三 设计的字段）：
   - `sourceUrl` = 用户输入的 URL（权威，必填）。
   - `sourceAuthor` = 页面作者署名 / `<meta name="author">` / 文章 byline（必填项，提取不到则留空、保存时强制用户补）。
   - `sourceSite` = 站点域名或媒体名（如「微信公众号 / 知乎 / 某博客」）。
   - `sourcePublishedAt` = 页面发布时间（`<time>` / `article:published_time` / 正文日期），转 ms。
3. **图片处理（v1 保留原图 URL）**：v1 **不下载图片**，直接保留网页原始图片链接（实现简单，无 CORS/代理负担）；代价是可能死链或遇防盗链失效。后续增强可选：经 Worker 代理（受控图片抓取白名单）下载后由 `pushImage` 转仓库内 `images/<sha>.<ext>` 引用。
4. **安全净化**：AI 接收的 HTML/富文本先经 `DOMPurify`（`dompurify` 已在依赖）净化后再转 Markdown；最终渲染仍走 `esc()`，守安全基线 2，防 XSS。

### 2.3 授权闸门（人力不可省）

AI 导入**不替代授权判断**：导入结果回填编辑器后，`sourceAuthorized` 留空，用户必须**手动勾选「我已获得原作者授权，确认可转载」**才能保存为转载（`repost=true`）；若未授权，文章只能作为原创草稿保存（此时不应带转载字段，或提示用户先去获取授权）。这把「没有授权即不能转载」做成流程硬约束，而非仅靠文本字段。

### 2.4 LLM 接入机制（可选增强，非必须）

本工作台是纯客户端 PWA，**无内置 AI**；若要用 LLM 做转换/兜底，LLM 由**用户自配置**（OpenAI 兼容端点，云厂商或自托管均可），通过现有 Cloudflare Worker 代理接入：

1. `Config` 新增 `aiBaseUrl` + `aiApiKey`，存入 `wb.cfg.v1`，与 GitHub `token` 同机制（不落库/不日志/不硬编码，守红线 5）。
2. 浏览器因 CORS + 密钥暴露**不可直连** LLM 厂商域名 → 复用 Worker 代理，将 LLM 域名加入 `ALLOW` 白名单（仍是白名单透传，守红线 3，非任意 URL 中转）。
3. 调用 OpenAI 兼容 `/v1/chat/completions`，用结构化输出要求模型返回 `{ title, markdown, sourceAuthor, sourceUrl, sourceSite, sourcePublishedAt }`，前端解析回填。
4. LLM 产出仍须 `DOMPurify` 兜底净化；**确定性流水线（§二主路径）优先，LLM 仅作启发式失败时的兜底**——对本任务确定性方案通常更稳更省。

---

## 三、数据模型改动（`src/types/index.ts`）

`Article` 接口（`src/types/index.ts:19`）新增字段（**无 sourceLicense，授权以 sourceAuthorized 表示**）：

```ts
export interface Article {
  id: string
  title: string
  content: string
  fromTodo: string
  tags: string[]
  createdAt: number
  updatedAt: number
  deleted: boolean
  published?: boolean
  // ↓↓↓ 新增：转载信息（原创文章这些字段为空/省略）↓↓↓
  repost?: boolean            // 是否转载 = sourceAuthorized && 来源必填项已填
  sourceAuthorized?: boolean // 授权闸门：是否已获原作者授权/确认可转载（必选才能转载）
  sourceAuthor?: string      // 被转载文章的人（原作者），必填当 repost=true
  sourceUrl?: string         // 原链接，必填当 repost=true
  sourceSite?: string        // 来源平台/媒体名，可选
  sourcePublishedAt?: number // 原文发布时间 ms，可选
}
```

**为什么扁平而非嵌套**：现有 `frontmatter.ts` 为极简行式解析器，仅支持 string/number/boolean/string[]，不支持嵌套对象；扁平字段与 `fromTodo`/`tags`/`publish` 同构，序列化/反序列化零改动风险。

**授权模型**：`sourceAuthorized: boolean` 表示「已获授权」，不存授权说明文本。`repost` 推导为 `sourceAuthorized === true && sourceAuthor && sourceUrl 均非空`；不满足时强制 `repost=false` 并清空来源字段。这些字段既可由 AI 导入自动预填（`sourceAuthor/sourceUrl/sourceSite/sourcePublishedAt`），也可由用户在编辑器手动补（来源不明时）。

---

## 四、序列化 / 反序列化（`src/services/github/contents.ts`）

### 4.1 序列化 `serializeArticle`（约 `contents.ts:10`）

仅 `repost` 为真时写入来源字段（含 `sourceAuthorized`），避免污染原创文章文件：

```ts
if (a.repost) {
  fm.repost = true
  fm.sourceAuthorized = true
  fm.sourceAuthor = a.sourceAuthor ?? ''
  fm.sourceUrl = a.sourceUrl ?? ''
  if (a.sourceSite) fm.sourceSite = a.sourceSite
  if (a.sourcePublishedAt) fm.sourcePublishedAt = a.sourcePublishedAt
}
```

### 4.2 反序列化 `fetchArticles`（约 `contents.ts:44`）

读取时补回 `repost` / `sourceAuthorized` / `sourceAuthor` / `sourceUrl` / `sourceSite` / `sourcePublishedAt`（默认 undefined = 原创）。`frontmatter.ts` 的 `parseValue` 已能正确处理这些标量，**无需改动解析器**。

---

## 五、页面设计（导入入口 + 编辑器 + 阅读/列表/分享）

### 5.1 转载导入入口
- 工作台新增「转载导入」命令/按钮：弹窗输入 URL 或粘贴网页内容 → 触发 §二 流程。
- AI 转换中显示进度；完成后自动打开文章编辑器，正文与转载信息区已预填。

### 5.2 编辑器「转载信息」区块（`ArticleEditor.vue`）

AI 导入后字段已预填，用户在此**确认/补正**并过授权闸门：

```
┌─ 转载信息 ───────────────────────────────────────┐
│ ☐ 我已获得原作者授权，确认可转载（必选）            │
│ ── 未勾选授权时下方表单整体禁用/折叠 ──            │
│ 原作者 *   [ 自动提取/可编辑 ________ ]            │
│ 原链接 *   [ https://____________ ]               │
│ 来源平台   [ 微信公众号/知乎/博客… ]               │
│ 原文发布   [ 2026-08-05          📅 ]             │
│ * 必填。未获授权不可转载；保存时校验。             │
└───────────────────────────────────────────────────┘
```

**交互逻辑（硬性闸门）**
1. `sourceAuthorized` 复选框在最前，**未勾选时下方表单全部禁用/折叠**，保存时 `repost` 强制为 `false`、来源字段清空。
2. 勾选授权后展开表单；`sourceAuthor` 与 `sourceUrl` 为必填（原链接校验 URL 格式）。AI 未提取到作者时，用户须手动补。
3. 「保存」校验：`sourceAuthorized === true` 时 `sourceAuthor`/`sourceUrl` 任一为空 → 禁用保存并提示。
4. 用户取消勾选授权 → 清空来源字段并收起表单，文章恢复为原创。
5. `repost` 由校验结果推导，经 `data.ts` 单一出入口落盘（守红线 4）。

> 设计意图：把「授权」做成不可绕过的**前置确认**，从流程层面落实「没有授权即不能转载」。

### 5.3 阅读视图（文章详情组件）
正文**底部**渲染转载声明块（安全转义，不拼 `innerHTML`）：

```
> 本文转载自 **{sourceAuthor}**{sourceSite ? ` @ ${sourceSite}` : ''}{sourcePublishedAt ? `（原文发布于 {YYYY-MM-DD}）` : ''}，已获原作者授权。
> 原文链接：[{sourceUrl}]({sourceUrl})
```

### 5.4 列表页（`ArticleList.vue`）
对 `repost` 为真的条目，标题旁加「转载」角标（小 tag），并可按「原创/转载」筛选。

### 5.5 公开分享（`ShareView.vue`）
`publish` 为真的转载文章，发布到镜像库时**必须**带上来源署名块（含「已获授权」字样），与阅读视图共用同一安全渲染函数，确保公开场景版权合规。

---

## 六、改动文件清单

| 文件 | 改动 |
|------|------|
| `src/types/index.ts` | `Article` 增 `repost` / `sourceAuthorized` / `sourceAuthor` / `sourceUrl` / `sourceSite` / `sourcePublishedAt`（无 sourceLicense） |
| `src/services/github/contents.ts` | `serializeArticle` 仅在 `repost=true` 写来源字段（含 `sourceAuthorized`）；`fetchArticles` 读回 |
| 转载导入模块（新增，如 `src/services/import/webRepost.ts` + `src/components/kb/RepostImport.vue`） | URL/粘贴接入 → AI 转换 → 图片内联 → 回填编辑器 |
| `proxy/cloudflare-worker.js`（方案 B 增强） | 受控「文章抓取」端点（白名单/限流），非必须 |
| `src/components/kb/ArticleEditor.vue` | 「转载信息」区块：授权闸门 + 来源表单 + 校验（支持 AI 预填） |
| 文章阅读视图组件 | 渲染转载声明块（安全转义，含「已获授权」） |
| `src/components/kb/ArticleList.vue` | 「转载」角标 + 筛选 |
| `src/views/ShareView.vue` | 复用声明块渲染，确保公开署名 |

---

## 七、测试（UT / IT）

**UT**
1. `frontmatter.test.ts`：含 `repost/sourceAuthorized/sourceAuthor/sourceUrl/...` 的文档解析往返一致。
2. `contents.test.ts`：`repost=false` 时不写来源字段；`repost=true` 时完整写入（含 `sourceAuthorized: true`）；`fetchArticles` 正确还原。
3. 导入转换单测：给定一段网页 HTML → 断言产出 Markdown 正文 + 正确提取 `sourceUrl`/`sourceAuthor`/`sourceSite`/`sourcePublishedAt`；图片被替换为 `images/<sha>` 引用；`DOMPurify` 已净化。
4. `data.test.ts`：转载文章经 `data.ts` 落盘与读回字段不丢。
5. 校验单测：未勾选授权时 `repost` 被强制为 false、来源字段清空。

**IT（真实链路，06 步骤）**
- IT-1：输入 URL（或粘贴）→ AI 导入 → 编辑器预填正文 + 来源字段。
- IT-2：勾选授权 + 填原作者/原链接 → 保存 → `kb/<id>.md` frontmatter 含 `repost: true`、`sourceAuthorized: true` 与来源字段。
- IT-3：未勾选授权直接保存 → 文章为原创，`repost` 缺省/false，无来源字段写入。
- IT-4：从远端拉取带转载字段的文章 → 列表显示「转载」角标、阅读页显示署名块（含「已获授权」）。
- IT-5：转载文章 `publish=true` → 镜像库文章含来源署名与授权声明。

---

## 八、兼容与迁移

- 旧文章无 `repost`/来源字段 → `repost` 默认 false、来源字段为空 → 渲染为原创，**无需迁移脚本**。
- 同步：整文件 LWW（blob sha 乐观锁），新增字段随文章整体合并，不影响 `sync/merge.ts` 现有逻辑。

---

## 九、风险与缓解

| # | 风险 | 缓解 |
|---|------|------|
| 1 | 解析器不支持嵌套对象 | 采用扁平字段，绕开限制 |
| 2 | 用户绕过 UI 直接改数据绕过授权 | 序列化侧兜底：`repost=true` 须以 `sourceAuthorized=true` + 来源必填齐全为前提；保存前统一校验 |
| 3 | 公开分享漏标来源致版权风险 | ShareView 强制复用声明块渲染（含「已获授权」） |
| 4 | 原链接/网页内容为不可信输入 → XSS | 转换前 `DOMPurify` 净化；渲染经 `esc()`，不拼 `innerHTML` |
| 5 | 方案 B 抓取开放任意 URL 中转 | 严守红线 3：Worker 仅做白名单/限流的文章抓取端点，绝不开放任意 URL 中转 |
| 6 | 网页图片外链失效/防盗链 | v1 保留原图 URL（接受风险）；后续可选经 Worker 代理下载内联（需扩白名单） |
| 7 | AI 提取作者/时间不准 | 字段可编辑；作者缺失时强制用户补；以用户输入 URL 为权威原链接 |

---

## 十、预估改动行数

核心逻辑（types + contents + 导入转换模块 + 编辑器闸门/校验 + 阅读/列表/分享渲染）约 **200–300 行**（不含测试/文档），**非小需求模式**，按标准 SOP 九步推进（实现阶段建 `feature/article-repost` 分支）。
