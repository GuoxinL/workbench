# [2026-08-05] 文章转载信息（repost source）

> **本文件是本任务的单一真相源（Single Source of Truth）**。
> 会话恢复时，先读本文件定位当前步骤，再按需加载对应阶段文件。
> ⚠️ Meta 中的 `分支` 字段是上下文恢复时定位任务的唯一依据，须与 `git branch --show-current` 一致。
>
> <!-- 本文件结构 / 字段定义 / Progress / 时间记录 SOP 规则见
>      .harness/plans/_template/00-overview.md；本任务文件精简不重复。
>      规则变更只改 _template/。 -->

---

## Meta

| 项 | 值 |
|----|----|
| 分支 | `feature/article-repost`（待建，实现阶段创建） |
| Issue / 关联单 | — |
| 摘要 | 浏览想转载的网页时，经「转载导入」入口由 AI 把网页转换为工作台文章格式并保存，自动记录原作者/原链接等来源信息；未获授权不可转载 |
| 状态 | 🔵 进行中（代码已实现，构建/类型检查/测试通过） |
| 创建日期 | 2026-08-05 |
| 负责人 | Guoxin.Liu |
| 预期完成 | — |
| 开发模式 | 独立开发 |
| 测试环境 | — |
| 预估代码改动行数 | 约 80–120 行（不含测试/文档） |
| 小需求模式 | ⬜ 否 |

---

## Progress

- [x] 01 Clarify（需求澄清）
- [x] 02 Plan（方案设计，本文档）
- [x] 03 Implement（数据模型/序列化/转换模块/编辑器闸门/列表/分享）
- [x] 04 UT（frontmatter/contents/webRepost 共 212 用例全绿）
- [ ] 05 Deploy（环境敏感，需显式确认）
- [ ] 06 IT（真实链路，需显式确认）
- [ ] 07 Docs（增量文档，可随实现自动）
- [ ] 08 Review
- [ ] 09 Commit（一个 MR 一个 commit，需显式确认后执行）

---

## 关键决策

- **数据结构风格**：采用扁平字段（`repost` / `sourceAuthorized` / `sourceAuthor` / `sourceUrl` / `sourceSite` / `sourcePublishedAt`），**不引入嵌套对象、无 sourceLicense**。原因：现有 `frontmatter.ts` 为极简行式解析器，仅支持 string/number/boolean/string[]，不支持嵌套对象；扁平字段与 `fromTodo`/`tags`/`publish` 风格一致，零风险、零新依赖。
- **真实主路径**：用户给网页 URL 或粘贴网页内容 → AI 抓取正文并转换为工作台文章格式（Markdown + frontmatter）→ 自动回填转载来源字段（`sourceAuthor`/`sourceUrl`/`sourceSite`/`sourcePublishedAt`）→ 用户手动勾选授权闸门后保存。前面设计的扁平字段即 AI 自动回填的数据契约。
- **授权闸门（关键）**：删除 `sourceLicense` 说明字段，改为 `sourceAuthorized: boolean` 强制闸门——**未获授权即不可转载**。AI 导入不替代授权判断：`sourceAuthorized` 留空，须用户手动勾选「我已获得原作者授权」方能存为转载；勾选且填好原作者/原链接才允许标记为转载。
- **抓取通道**：优先方案 A（用户粘贴网页内容，零服务端改造）；方案 B（Worker 受控「文章抓取」端点）为增强项，严守红线 3 不开放任意 URL 中转。
- **合并兼容**：同步为整文件 LWW（blob sha 乐观锁），新增字段只在 `Article` 模型 + 序列化/反序列化三处对齐即可，不影响现有合并逻辑。
- **范围（本次）**：仅产出方案文档，不写实现代码。
