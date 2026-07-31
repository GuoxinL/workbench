# 01. Clarify —— 需求澄清

> 本任务由 `.harness/design.html`（已评审）驱动，需求已澄清。此处仅固化关键结论，完整需求见 design.html 第 2 节「功能全清单」（验收基线）。

## 背景与目标

- 现有实现为 3185 行零依赖手写前端（Markdown 渲染 / 力导向图谱 / DOM / 状态 / 事件总线全自造），无测试、无类型检查、无 lint，核心算法（LWW 合并）回归会静默丢数据。
- 目标：用成熟生态（Vue3 + TS + Vite + Pinia + Router + marked + DOMPurify + d3-force + Element Plus + d3-cloud）替换手写轮子，**功能严格对齐现有实现，不增不减**，并建立类型检查 + 单测 + CI 的反馈闭环。

## 范围（Scope）

- **做**：design §2 全部功能（T1-T15 / N1-N10 / L1-L11 / A1-A7 / G1-G8 / S1-S22 / TAG1-TAG5），数据层改为 Markdown 文档库（每篇 `kb/<slug>.md` + `manifest.json`），新增标签云视图与 VitePress 发布。
- **不做**：不改 `proxy/cloudflare-worker.js`；不新增业务功能（除非后续确认）；不保留旧 JSON 兼容/迁移代码（清空重来，design §4.1）。

## 已确认决策（design §9，2026-07-31 评审）

1. **数据 schema**：清空重来，结构不变（标题寻址），不移植兼容/迁移代码，生产数据仓库全新起步。
2. **修改 AGENTS.md 红线**：红线 2（禁框架/npm）/ 红线 3（必跑 bump-version.sh）/「script 顺序」删除或改写；令牌安全红线保留。
3. **引入 Element Plus**（按需自动导入），8 色色板等业务件仍自定义。
4. **Markdown h4–h6**：接受 marked 正常渲染（属修复）。

## 验收基线

design §2 的 70+ 项功能清单（T/N/L/A/G/S/X/TAG）为唯一验收基线；细节行为（颜色筛选二次点击取消、光标坐标翻转、`==高亮==`、双链缺失创建等）已在清单固化，逐条对照验收。

## 待确认问题

- 提交时补 TAPD `--story=` id（协同开发，提交前询问）。
- 路由路径 `/notes/:id` 与 design 的 `/kb/:id` 命名差异，实现层暂用 `notes`，后续统一。
- AGENTS.md 红线改写（决策 2）需在实现中同步执行。
