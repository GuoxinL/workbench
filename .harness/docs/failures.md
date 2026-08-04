# 踩坑记录

> 状态：生效中 | 维护者：全员 | 最后更新：2026-08-04
>
> ⚠️ **出处说明（必读）**：本文件 §记录 中的 7 条条目均记录于 **2026-07-30 旧架构时期**（原生 `js/*.js` IIFE + `window.WB` + 单 JSON `data/workbench.json` + `bump-version.sh`）。2026-07-31 已重构为 **Vue3 + Vite + TS + Pinia**（`kb/<id>.md` + `manifest.json` + 同步引擎 `services/sync/engine.ts`）。
> 条目中的 `js/github.js:NN`、`js/app.js:NN`、`js/store.js:NN`、`bump-version.sh:NN` 等**文件:行号引用为历史快照，对应代码已不存在**；但每条提炼的**工程教训**仍适用于当前架构。本文以「✅ 已规约」形式把这些教训映射到了当前模块（见各条目『沉淀去向』）。

## 范围

记录开发/部署/运行中遇到的非显然问题、AI 协作的失败案例、已知 Bug 的临时绕过方案。每条记录的目的不是"留念"，而是**逐步转化为规约要求**（更新 `coding-style.md` / `unittest/unittest.md` / `code-review.md` / `AGENTS.md` 红线等）。

## 写作规范

- 每条独立成节，标题用一句话描述现象
- 必备字段：日期、上下文、根因、临时绕过、根治方案、相关链接（PR/Issue/commit）
- **禁止编造**：每条必须能指向真实证据（commit sha / `文件:行号` / README 原文）。从 git log 推断的条目标注「来源：git log \<sha\>」
- AI 失败案例必须保留：原始 Prompt、AI 输出、期望 vs 实际、根因分析
- 已沉淀为规约的条目标记 `✅ 已规约`，可定期归档

## 模板

```markdown
### YYYY-MM-DD：{{一句话现象}}

- **上下文**：{{何时何地、何种操作触发}}
- **根因**：{{真正的原因，非表象}}
- **临时绕过**：{{当时怎么解决的}}
- **根治方案**：{{长期方案 / 已合入 PR 链接}}
- **沉淀去向**：{{更新到哪个规约文件 或 待办}}
- **参考**：{{Issue / PR / commit / 文件:行号}}
```

---

## 记录

<!-- 新增条目追加在最上方，倒序排列；历史条目保留并标注当前对应模块 -->

### 2026-07-30：设置面板点 ✕ / 点遮罩关不掉，且 `index.html` 自身被缓存导致版本号更新不生效

- **上下文**：设置窗口（`#cfgMask` / `#cfgSheet`）在触屏与部分交互路径下点关闭按钮或遮罩无反应；同时发现即使 `?v=` 已 bump，用户访问到的仍是旧页面。
- **根因**：
  1. 关闭按钮未声明 `type="button"`，遮罩只监听 `mousedown`（触屏/键盘路径不触发），且 sheet 内部点击会冒泡到 mask 造成误关/误判；
  2. `?v=` 版本参数只能破 `js`/`css` 的缓存，**`index.html` 自己被浏览器缓存时，新的版本号根本读不到**——破缓存机制对入口文件自身失效。
- **临时绕过**：强制刷新 / 无痕窗口打开。
- **根治方案**：
  - 关闭按钮改 `click` + `e.preventDefault()`，遮罩改监听 `click` 并判定 `e.target === mask`，sheet 内部 `stopPropagation()` 阻断冒泡；
  - 关闭动作加空值保护并清理残留状态提示；
  - `index.html` 增加 `Cache-Control: no-cache, no-store, must-revalidate` / `Pragma` / `Expires` 三个 meta，让入口文件不被缓存。
- **沉淀去向**：✅ 当前架构下弹层交互规范（按钮显式 `type`、遮罩关闭需同时防冒泡）已纳入 `coding-style.md`；**缓存失效改由 Vite 内容哈希保证**（产物 `app.<hash>.js`，无需 `?v=` / `wb-version` meta，也无 `bump-version.sh`）。
- **参考**：来源：git log `cf46195`；历史文件 `index.html`、`js/app.js`（旧架构，已不存在）

---

### 2026-07-30：仓库地址留空后同步直接判为「配置无效」——默认值回落只做在了 UI 层

- **上下文**：上一次提交刚把默认数据仓库设为 `GuoxinL/workbench-data` 并加了空值回落，但用户把设置里的仓库输入框清空后，同步仍然失效。
- **根因**：回落只加在 **UI 读写层**和载入时；同步引擎内部的 `cfgValid()` / `runSync()` / `test()` / `diagnose()` **四条路径都直接用原值**，绕过了回落，于是 `repo` 为空 → 格式校验不通过 → 判为未配置。典型的「兜底放错了层」。
- **临时绕过**：在设置里手工填完整 `owner/repo`。
- **根治方案**：新增 `normCfg()` 做配置归一化（`repo`/`branch`/`path` 空值统一回落到默认值），各入口一律先归一化；载入旧配置时逐项回落。
- **沉淀去向**：✅ 已规约为「配置/数据的默认值与校验必须收敛在单一入口」。当前架构由 `services/github/diagnose.ts` 的 `isConfigComplete()` 统一把关（`enabled`/`repo`含`/`/`token`/`branch` 全齐才视为完整），`engine.doSync()` 与 `testConnection()` 均先经它判断，杜绝「回落放错层」；呼应 AGENTS.md 红线 4（配置/数据的默认值与校验单一入口）。
- **参考**：来源：git log `6427394`（前序 `253bc3b`）；历史文件 `js/github.js`、`js/store.js`（旧架构，已不存在）

---

### 2026-07-30：改完代码线上行为不变——GitHub Pages + 浏览器缓存住了旧 JS/CSS ✅ 已规约

- **上下文**：多次修改 `js/*.js` 并 push 到 GitHub Pages 后，浏览器里的表现仍是旧逻辑，导致「代码明明改了、现象却对不上」，排障方向被严重误导。
- **根因**：`<script src="js/xxx.js">` / `<link href="css/style.css">` 无任何版本参数，静态资源被浏览器长缓存，Pages 侧也不会主动失效。
- **临时绕过**：强刷（Ctrl/Cmd+Shift+R）或清站点缓存——**但这只能救开发者自己，救不了其它设备/其他人的浏览器**。
- **根治方案**：新增 `bump-version.sh`，给所有 `js`/`css` 引用追加 `?v=<时间戳>`；设置面板显示当前版本号方便肉眼核对线上跑的是哪一版。
- **沉淀去向**：✅ 当前架构下已由 **Vite 内容哈希**彻底解决（产物 `app.<hash>.js`，文件名随内容变化自动失效缓存），`bump-version.sh` 已随 2026-07-31 重构移除；AGENTS.md 红线 3 已作废。
- **参考**：来源：git log `81429d7`；历史文件 `bump-version.sh`、`index.html`（旧架构，已不存在）

---

### 2026-07-30：网络明明正常却提示「同步失败」——并发互斥标志被当成失败信号

- **上下文**：用户在设置里点「保存并同步」，或正常编辑触发防抖推送时，高频出现「同步失败」的红色提示，但网络与令牌都没问题。
- **根因**：早期用 `let running = false` 做互斥，检测到已有同步在跑时直接 `return false`；而调用方一律以 `=== false` 判定失败。轮询每 5 秒触发一次、单次同步耗时最长两秒多，**用户手动同步撞上正在跑的轮询是大概率事件**——「正忙」被误报成「失败」。
- **临时绕过**：无（重试一次通常就好，但用户无从判断）。
- **根治方案**：改为 `inflight` Promise 排队：静默调用（轮询、防抖推送）复用进行中的那次结果避免重复请求；用户主动调用则等当前这次结束后再真正跑一次，保证刚改的内容一定被推上去。
- **沉淀去向**：✅ 已规约为「异步入口的并发控制用排队而非丢弃；'忙'不是'失败'」。当前架构见 `services/sync/engine.ts` 的 `sync()`（`inFlight` 复用进行中的 Promise，`engine.ts:161-169`）。
- **参考**：来源：git log `81429d7`；历史文件 `js/github.js`（旧架构，已不存在）/ 当前 `engine.ts:161-169`

---

### 2026-07-30：两端数据已一致的「空同步」被误报为失败——布尔返回值语义重载

- **上下文**：本地与远端无差异时执行同步，仍弹出「同步失败」。
- **根因**：`runSync()` 在「两端已一致、无需推送」分支直接 `return merged`，而 `merged` 表示「本次合并是否产生了变更」，**完全可能为 `false`**；调用方却拿它当成功标志（`=== false` 即失败）。一个布尔值同时承担「操作结果」和「业务语义」两种含义。
- **临时绕过**：无，属误报，忽略即可。
- **根治方案**：改为返回对象 `{ merged, pushed: false }`（真值），把「是否合并出变更」与「是否成功」两个语义拆开。
- **沉淀去向**：✅ 已规约为「禁止用同一个布尔返回值同时表达『成功与否』和『业务结果』；成功路径必须返回真值或结构化对象」。当前架构见 `engine.ts` 的 `SyncOutcome { ok, merged, pushed }` 与 `doSync()` 在「本地无领先变更」分支返回 `{ ok:true, merged:changed, pushed:false }`（`engine.ts:123-127`）。
- **参考**：来源：git log `81429d7`；历史文件 `js/github.js`（旧架构，已不存在）/ 当前 `engine.ts:123-127`

---

### 2026-07-30：同步请求无限挂起 + 保存配置后窗口卡住不关

- **上下文**：在访问不了 GitHub 的网络环境点「保存并同步」，设置窗口一直停在「配置已保存，正在同步…」，既不成功也不失败，窗口也关不掉。
- **根因**：
  1. 各处直接调用裸 `fetch`，**没有超时**——网络不可达时请求 pending 永不 settle；
  2. 把关闭窗口排在 `await sync()` **之后**，同步不返回窗口就永远不关，UI 被一个网络请求绑死。
- **临时绕过**：刷新页面。
- **根治方案**：
  - 新增带超时的 `req()` 包装（`AbortController` + 12 秒），超时抛中文错误并标记 `err.net = true`，所有 GitHub 请求改走 `req()`；
  - 交互改为**先关窗、后异步同步**，同步结果通过 toast 通知，UI 不再等待网络。
- **沉淀去向**：✅ 已规约为「所有外部网络调用必须带超时；UI 关闭动作不得依赖网络请求返回」。当前架构见 `services/github/diagnose.ts` 的 `repoFetch`（`AbortController` + 12s，`diagnose.ts:27-44`）；UI 关闭动作由 `SettingsSheet` 异步触发、不阻塞。
- **参考**：来源：git log `f6bd3c0`；历史文件 `js/github.js`、`js/app.js`（旧架构，已不存在）/ 当前 `diagnose.ts:27-44`

---

### 2026-07-30：受限网络下只有一句英文 `Failed to fetch`，「同步失败」四个字完全无法定位

- **上下文**：GitHub API 不可达的网络里，同步失败只给出笼统提示，用户无法判断是令牌错、仓库错、权限不足还是网络不通。
- **根因**：浏览器 `fetch` 在**网络不可达 / DNS 失败 / 被 CORS 拒绝**这三种完全不同的场景下，统一抛出裸 `TypeError('Failed to fetch')`，错误信息里不含任何可区分的线索；上层又把所有异常收敛成一句「同步失败」。
- **临时绕过**：开浏览器 DevTools Network 面板人工看。
- **根治方案**：
  - 新增五步诊断 `diagnose()`（配置检查 → 网络连通 → 令牌有效性 → 仓库访问与写权限 → 数据文件），逐步定位并给出中文处置建议；
  - 网络类错误统一中文化并标记 `err.net`；
  - 支持自定义 `apiBase` 走代理，并附带可直接部署的 `proxy/cloudflare-worker.js`。
- **配套踩坑（同一提交内已规避）**：
  - **判定 `TypeError` 必须用 `e.name` 而非 `instanceof`**——`fetch` 若来自其它 realm（polyfill、浏览器扩展注入），`instanceof` 会失效；
  - **代理必须回 CORS 响应头并处理 `OPTIONS` 预检**；
  - **`workers.dev` 默认域名在部分网络同样受限**，需绑定自有域名；
  - 代理会看到令牌明文，必须只用自己部署的服务，且限制 `ALLOW_ORIGINS` + 接口白名单防止被当公共代理滥用。
- **沉淀去向**：✅ 已规约到 AGENTS.md 安全基线 3（Worker 代理只做白名单透传）；当前架构五步诊断见 `diagnose.ts:83-128`（步骤名：配置检查 / 网络连通 / 令牌有效性 / 仓库访问与写权限 / 数据文件），网络错误中文化见 `diagnose.ts:55-66`。
- **参考**：来源：git log `963e6f0`；历史文件 `js/github.js`、`proxy/cloudflare-worker.js`、`README.md`（旧架构，已不存在）/ 当前 `diagnose.ts:83-128`

---

### 2026-07-30：新建的空数据仓库没有默认分支，导致 Contents API 找不到 `main`

- **上下文**：按 README 指引新建 GitHub 数据仓库后首次同步失败。
- **根因**：GitHub 上不勾选 "Add a README file" 创建出来的**完全空仓库没有默认分支**，按 `main` 请求 Contents API 时无法命中。
- **临时绕过**：手动在仓库里提交任意一个文件以创建默认分支。
- **根治方案**：README 在代码仓库、数据仓库两处创建步骤中都显式提示勾选 "Add a README file"；诊断把「文件不存在」与「仓库/分支不存在」区分开来提示。
- **沉淀去向**：✅ 已写入 README；当前诊断第 4 步「仓库访问与写权限」对 404 给出 `notfound` 提示（含分支/权限处置建议，`diagnose.ts:70`）。
- **参考**：历史 `README.md`（旧架构，已不存在）/ 当前 `diagnose.ts:70`

---

## 预防性约束（来自代码注释，未见对应故障提交）

> 以下条目为历史架构（`js/*.js`）时期的代码注释约定，**代码已不存在**；其中与安全/XSS 相关的通用原则已延续到当前架构的 `coding-style.md` §7。

- **Base64 编码必须分块 + UTF-8 安全**（历史 `js/util.js` 注释）：`btoa` 不接受多字节字符，且大数组 `String.fromCharCode.apply` 会栈溢出，需 `subarray` 分块。当前架构走 `kb/<id>.md` + `manifest.json` 的 Contents API（JSON 文本），分块 Base64 已非主路径；若仍有二进制（如图片）走 git `images/`，由 `services/image/*` + Worker 处理。
- **GitHub Pages 必须保留根目录 `.nojekyll`**：否则文件会被 Jekyll 当模板处理。当前架构经 Vite 构建 + GitHub Actions 发布，`.nojekyll` 仍应保留于发布产物。
- **Markdown 渲染必须先转义再拼接**：历史 `js/markdown.js` 注释「不依赖任何第三方库，输出前统一转义，避免 XSS」。当前架构改用 `@milkdown/kit` + `DOMPurify` 净化（安全基线 2 精神延续，`coding-style.md` §7.2）。

---

## 已归档（已沉淀为规约）

- 2026-07-30 改完 js/css 后线上跑旧代码 → 规约：Vite 内容哈希（原 AGENTS.md 红线 3 已作废）
- 2026-07-30 代理令牌与转发面暴露风险 → 规约：AGENTS.md 安全基线 3（Worker 白名单透传）
- 2026-07-30 配置回落放错层 / 并发误报失败 / 空同步误报 / 无超时挂起 / 英文报错无定位 → 规约：`diagnose.ts` 五步诊断 + `engine.ts` 并发排队 + `SyncOutcome` 结构化返回 + `repoFetch` 超时（见各条目『沉淀去向』）
