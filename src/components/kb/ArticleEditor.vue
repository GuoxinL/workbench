<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import type { Article } from '@/types'
import { useDataStore } from '@/stores/data'
import { useAutoSave } from '@/composables/useAutoSave'
import { slug } from '@/lib/slug'
import { markMissingLinks } from '@/lib/markdown/wikilink-mark'
import MilkdownEditor from './MilkdownEditor.vue'
import ArticleOutline from './ArticleOutline.vue'
import RelatedPanel from './RelatedPanel.vue'
import LinksPanel from './LinksPanel.vue'
import EditorContextMenu from './EditorContextMenu.vue'
import type { MenuAction } from './EditorContextMenu.vue'
import LinkPopover, { type LinkKind } from './LinkPopover.vue'
import { compressImage } from '@/lib/image'
import { openConfirm, openTableDialog } from '@/composables/useDialog'

const props = defineProps<{ article: Article | null }>()
const emit = defineEmits<{ open: [string]; changed: [] }>()
const store = useDataStore()

// 大纲+推荐面板：PC 默认开（现有侧栏），手机默认关（点浮动按钮 → 抽屉）
const isMobile = ref(typeof window !== 'undefined' && window.innerWidth <= 768)
const outlineOpen = ref(!isMobile.value)
function onResize() {
  const m = window.innerWidth <= 768
  if (m !== isMobile.value) {
    isMobile.value = m
    // 切到 PC 默认开、切到手机默认关
    outlineOpen.value = !m
  }
}
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))

const draftTitle = ref('')
const draftContent = ref('')
const draftTags = ref<string[]>([])

function isDirty(): boolean {
  const a = props.article
  if (!a) return false
  return a.title !== draftTitle.value.trim() || a.content !== draftContent.value || JSON.stringify(a.tags) !== JSON.stringify(draftTags.value)
}

watch(
  () => props.article?.id,
  () => {
    if (props.article) {
      draftTitle.value = props.article.title
      draftContent.value = props.article.content
      draftTags.value = [...props.article.tags]
    }
  },
  { immediate: true },
)

const { schedule, flush } = useAutoSave(() => {
  if (isDirty()) doSave()
}, 700)

// 编辑态标识：编辑器聚焦时高亮文章框；离开时 flush 保存并提示「已保存」
const editing = ref(false)
function onEditorFocusIn() {
  editing.value = true
}
function onEditorFocusOut(e: FocusEvent) {
  // 焦点仍在本编辑区内（如标题→正文）不视为离开
  const rt = e.relatedTarget as HTMLElement | null
  if (rt && (e.currentTarget as HTMLElement).contains(rt)) return
  editing.value = false
  if (isDirty()) {
    flush()
    ElMessage.success('已保存')
  }
}

function doSave() {
  const a = props.article
  if (!a || !isDirty()) return
  const { affected } = store.updateArticle(a.id, {
    title: draftTitle.value.trim(),
    content: draftContent.value,
    tags: [...draftTags.value],
  })
  if (affected > 0) ElMessage.success(`已联动更新 ${affected} 篇引用`)
  emit('changed')
}

/** Milkdown 内容变更回调 */
function onContentChange(md: string) {
  draftContent.value = md
  schedule()
}

/** 外部 flush：ArticlesView 切走前落盘 */
defineExpose({ flush })

/** 链接点击：不直接跳转，在鼠标处弹小窗口提示打开 */
const linkPopover = ref<{ x: number; y: number; kind: LinkKind; title?: string; slug?: string; href?: string; missing?: boolean; targetId?: string } | null>(null)

function onLinkClick(e: MouseEvent) {
  const wl = (e.target as HTMLElement).closest('.wikilink') as HTMLElement | null
  if (wl) {
    e.preventDefault()
    const title = wl.getAttribute('data-title') || ''
    const s = wl.getAttribute('data-slug') || ''
    const target = store.articles.find((n) => !n.deleted && slug(n.title) === s)
    linkPopover.value = { x: e.clientX, y: e.clientY, kind: 'wikilink', title, slug: s, missing: !target, targetId: target?.id || '' }
    return
  }
  const anchor = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null
  if (anchor) {
    e.preventDefault()
    const id = decodeURIComponent((anchor.getAttribute('href') || '').slice(1))
    linkPopover.value = { x: e.clientX, y: e.clientY, kind: 'anchor', slug: id }
    return
  }
  const ext = (e.target as HTMLElement).closest('a[href^="http"]') as HTMLAnchorElement | null
  if (ext) {
    e.preventDefault()
    linkPopover.value = { x: e.clientX, y: e.clientY, kind: 'external', href: ext.getAttribute('href') || '' }
    return
  }
}

async function onLinkAction() {
  const p = linkPopover.value
  if (!p) return
  if (p.kind === 'wikilink') {
    if (p.targetId) {
      emit('open', p.targetId)
    } else {
      const title = p.title || p.slug || ''
      if (await openConfirm({ title: '创建文章', message: `创建文章「${title}」？`, confirmText: '创建' })) {
        const na = store.addArticle(title)
        emit('open', na.id)
      }
    }
  } else if (p.kind === 'anchor' && p.slug) {
    onJumpToHeading(p.slug)
  } else if (p.kind === 'external' && p.href) {
    window.open(p.href, '_blank', 'noopener')
  }
}

/** 扫描 Milkdown 中的 wikilink，标记缺失目标为红色 */
function refreshMissingLinks() {
  requestAnimationFrame(() => {
    markMissingLinks(document, store.articles)
  })
}
watchDebounced(() => store.articles, refreshMissingLinks, { debounce: 300 })

// ── 右键上下文菜单 ──
const ctxMenu = ref({ x: 0, y: 0, show: false })

const menuActions: MenuAction[] = [
  { key: 'image', label: '插入图片…', shortcut: 'Ctrl+V', action: 'image' },
  { key: 'link', label: '插入链接…', shortcut: 'Ctrl+K', action: 'link' },
  { key: 'table', label: '插入表格…', action: 'table' },
  { key: 'div1', label: '', divider: true },
  { key: 'h1', label: '一级标题', shortcut: 'Ctrl+1' },
  { key: 'h2', label: '二级标题', shortcut: 'Ctrl+2' },
  { key: 'h3', label: '三级标题', shortcut: 'Ctrl+3' },
  { key: 'div2', label: '', divider: true },
  { key: 'ul', label: '无序列表', shortcut: 'Ctrl+Shift+U' },
  { key: 'ol', label: '有序列表', shortcut: 'Ctrl+Shift+O' },
  { key: 'quote', label: '引用块', shortcut: 'Ctrl+Shift+Q' },
  { key: 'codeblock', label: '代码块', shortcut: 'Ctrl+Shift+K' },
  { key: 'hr', label: '分割线' },
]

function onEditorContextMenu(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest('.milkdown, .milkdown-editor, .ProseMirror')
  if (!el) return // 不在编辑器内：放行浏览器原生右键菜单（标题/标签输入框等）
  e.preventDefault()
  ctxMenu.value = { x: e.clientX, y: e.clientY, show: true }
}

/** 右键菜单：与工具栏同源。所有格式/链接项直接复用 MilkdownEditor 暴露的
 *  cmd 命令；图片（文件上传后）与表格走同源的节点插入函数。
 *  彻底替换原先 insertAtCursor 插入原始 markdown 文本的错误做法。 */
async function handleMenuAction(key: string, _a: MenuAction) {
  ctxMenu.value.show = false
  const api = (window as any).__milkdownApi
  if (!api) return
  if (key === 'image') {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const dataUri = await compressImage(file)
        api.insertImageNode(dataUri)
      } catch { /* ignore */ }
    }
    input.click()
  } else if (key === 'table') {
    const r = await openTableDialog()
    if (!r) return
    api.insertTableNode(r.rows, r.cols)
  } else if (key === 'link') {
    // 与工具栏「插入链接」同源：内部 prompt 收集文字 + URL
    api.cmd('link')
  } else {
    // 格式项（h1-h3/ul/ol/quote/codeblock/hr）键名与 cmd 命令一一对应
    api.cmd(key)
  }
}

// 大纲跳转：向编辑区内的 Milkdown 发送滚动事件
/** 大纲跳转：在 Milkdown 编辑区滚动到匹配的标题 */
function onJumpToHeading(id: string) {
  const container = document.querySelector('.milkdown')
  const scrollEl = document.querySelector('.editor-scroll')
  if (!container || !scrollEl) return
  const headings = container.querySelectorAll('h1, h2, h3, h4')
  for (const h of headings) {
    const text = (h.textContent || '').trim()
    if (text.toLowerCase().replace(/\s+/g, '-') === id) {
      const offset = h.getBoundingClientRect().top - container.getBoundingClientRect().top + scrollEl.scrollTop - 20
      scrollEl.scrollTo({ top: offset, behavior: 'smooth' })
      break
    }
  }
}

// 标签
function addTag(v: string) {
  const t = v.trim()
  if (t && !draftTags.value.includes(t)) draftTags.value.push(t)
  tagInput.value = ''
  schedule()
}
function removeTag(t: string) {
  draftTags.value = draftTags.value.filter((x) => x !== t)
  schedule()
}
const tagInput = ref('')
function tagColor(t: string): string {
  const palette = ['#3b82f6', '#ef4444', '#f59e0b', '#22c55e', '#a855f7', '#14b8a6', '#ec4899', '#64748b']
  let h = 0
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return palette[h % palette.length]
}

async function remove() {
  if (!props.article) return
  try {
    await ElMessageBox.confirm(`删除文章「${props.article.title}」？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    store.removeArticle(props.article.id)
    emit('open', '')
  } catch { /* 取消 */ }
}

function scrollTop() {
  document.querySelector('.editor-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
}

// 发布到公开镜像库（只读分享）
const shareUrl = computed(() => {
  const a = props.article
  if (!a?.published) return ''
  return `${location.origin}${location.pathname}#/share/${a.id}`
})
async function onTogglePublish(v: boolean | string | number) {
  if (!props.article) return
  try {
    await store.setPublished(props.article.id, Boolean(v))
    ElMessage.success(v ? '已发布，可分享链接给他人只读查看' : '已取消发布')
  } catch {
    ElMessage.error('发布失败：请在设置中确认公开镜像仓库已配置且 token 有写权限')
  }
}
async function copyShare() {
  if (!shareUrl.value) return
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    ElMessage.success('分享链接已复制')
  } catch {
    ElMessage.warning('复制失败，请手动选中链接复制')
  }
}

const wordCount = computed(() => draftContent.value.replace(/\s/g, '').length)
const fromTodoTitle = computed(() => {
  const a = props.article
  if (!a?.fromTodo) return ''
  return store.todoById(a.fromTodo)?.title.slice(0, 20) ?? ''
})
</script>

<template>
  <section v-if="article" class="editor">
    <!-- 中栏：编辑区 -->
    <div
      class="editor-scroll"
      :class="{ editing }"
      @click="onLinkClick"
      @contextmenu="onEditorContextMenu"
      @focusin="onEditorFocusIn"
      @focusout="onEditorFocusOut"
    >
      <div class="bar">
        <input
          v-model="draftTitle"
          class="title-input"
          placeholder="文章标题"
          @input="schedule"
          @blur="schedule"
        />
        <div class="bar-actions">
          <el-tooltip :content="article.published ? '已发布，外人可只读访问' : '发布到公开镜像库供外人只读访问'" placement="bottom">
            <el-switch
              :model-value="article.published"
              inline-prompt
              active-text="发布"
              inactive-text="私密"
              @change="onTogglePublish"
            />
          </el-tooltip>
          <el-button size="small" type="danger" plain @click="remove">删除</el-button>
        </div>
      </div>

      <div v-if="article.published" class="share-row">
        <span class="muted">分享链接：</span>
        <code class="share-link">{{ shareUrl }}</code>
        <el-button size="small" @click="copyShare">复制</el-button>
      </div>

      <div class="meta muted">
        <span>创建 {{ new Date(article.createdAt).toLocaleString() }}</span>
        <span>更新 {{ new Date(article.updatedAt).toLocaleString() }}</span>
        <span>字数 {{ wordCount }}</span>
        <span v-if="fromTodoTitle">源自待办：{{ fromTodoTitle }}</span>
      </div>

      <div class="tags">
        <span v-for="t in draftTags" :key="t" class="tag" :style="{ background: tagColor(t) }" @click="removeTag(t)">{{ t }} ×</span>
        <input v-model="tagInput" class="tag-input" placeholder="加标签回车" @keydown.enter.prevent="addTag(tagInput)" />
      </div>

      <details class="help">
        <summary>Markdown 语法帮助</summary>
        <div class="help-body">
          <p class="help-h">标题</p>
          <ul>
            <li><code># 一级标题</code> / <code>## 二级标题</code> / <code>### 三级标题</code></li>
          </ul>
          <p class="help-h">文字格式</p>
          <ul>
            <li><code>**粗体**</code>、<code>*斜体*</code>、<code>~~删除线~~</code>、<code>`行内代码`</code></li>
            <li><code>==高亮==</code> 文字高亮</li>
          </ul>
          <p class="help-h">段落与块</p>
          <ul>
            <li><code>- 无序列表</code> / <code>1. 有序列表</code></li>
            <li><code>- [ ] 待办</code> / <code>- [x] 已完成</code></li>
            <li><code>> 引用块</code></li>
            <li><code>```</code> 围栏代码块（可带语言 <code>```js</code>）</li>
            <li><code>---</code> 分割线</li>
          </ul>
          <p class="help-h">链接与图片</p>
          <ul>
            <li><code>[文字](https://url)</code> 外部链接</li>
            <li><code>[[文章标题]]</code> 双链引用文章 · <code>[[文章标题|别名]]</code> 显示别名</li>
            <li><code>![描述](图片url)</code> 插入图片</li>
          </ul>
          <p class="help-h">表格</p>
          <ul>
            <li><code>| 列1 | 列2 |</code> + <code>|---|---|</code> + 数据行</li>
          </ul>
          <p class="help-h">标签</p>
          <ul>
            <li>上方标签区输入框回车即可添加标签</li>
          </ul>
        </div>
      </details>

      <MilkdownEditor
        v-if="draftContent !== undefined"
        :key="article?.id"
        :model-value="draftContent"
        @update:model-value="onContentChange"
        @ready="refreshMissingLinks"
      />

      <LinksPanel :article="article" :content="draftContent" @open="emit('open', $event)" />
    </div>

    <!-- 右栏：大纲(上2/3) + 推荐(下1/3) —— 仅 PC 默认开 -->
    <div v-if="outlineOpen && !isMobile" class="right-side">
      <ArticleOutline :content="draftContent" @jump="onJumpToHeading" />
      <RelatedPanel :article="article" @open="emit('open', $event)" />
    </div>

    <!-- 手机端：大纲+推荐抽屉（默认关，浮动按钮打开） -->
    <el-drawer
      v-if="isMobile"
      v-model="outlineOpen"
      title="大纲 · 推荐"
      direction="rtl"
      size="280px"
    >
      <ArticleOutline :content="draftContent" @jump="onJumpToHeading" />
      <RelatedPanel :article="article" @open="emit('open', $event)" />
    </el-drawer>

    <!-- 浮动按钮：回到顶部 + 大纲开关（PC/手机都有） -->
    <button class="top-btn" title="回到顶部" @click="scrollTop">⬆</button>
    <button class="outline-btn" :class="{ on: outlineOpen }" title="大纲/推荐" @click="outlineOpen = !outlineOpen">☰</button>

    <!-- 右键上下文菜单 -->
    <EditorContextMenu
      v-if="ctxMenu.show"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      :actions="menuActions"
      @select="handleMenuAction"
      @close="ctxMenu.show = false"
    />

    <!-- 链接点击弹窗 -->
    <LinkPopover
      v-if="linkPopover"
      :x="linkPopover.x"
      :y="linkPopover.y"
      :kind="linkPopover.kind"
      :title="linkPopover.title"
      :slug="linkPopover.slug"
      :href="linkPopover.href"
      :missing="linkPopover.missing"
      @action="onLinkAction"
      @close="linkPopover = null"
    />
  </section>
  <section v-else class="editor empty muted">
    <p>从列表选择一篇文章，或点击「＋ 新建」</p>
  </section>
</template>

<style scoped>
.editor {
  display: flex;
  flex: 1;
  min-width: 0;
  height: calc(100vh - 110px);
  position: relative;
}

.editor-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px 120px;
  min-width: 0;
  border: 2px solid transparent;
  border-radius: 10px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
/* 编辑态：文章框高亮，明确「正在输入」 */
.editor-scroll.editing {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-weak);
  /* 底色基于当前 bg 微提亮（RGB++ 约 4%），编辑区像被抬起的活跃面；明暗自动跟随 */
  background: color-mix(in srgb, var(--bg), white 4%);
}

.right-side {
  width: 200px;
  flex: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.right-side > :first-child {
  flex: 2;
  overflow-y: auto;
  min-height: 0;
}
.right-side > :last-child {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.title-input {
  flex: 1;
  font-size: 22px;
  font-weight: 700;
  border: none;
  outline: none;
  background: transparent;
  color: var(--fg);
}
.bar-actions { display: flex; gap: 6px; flex: none; align-items: center; }

.share-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}
.share-link {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  background: var(--brand-weak);
  border-radius: 6px;
  color: var(--brand);
  font-family: ui-monospace, monospace;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 8px;
}
.tag {
  color: #fff;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  cursor: pointer;
}
.tag-input {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  outline: none;
  width: 120px;
}

.help {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--card-bg);
  padding: 4px 12px;
  font-size: 13px;
  margin-bottom: 12px;
}
.help summary { cursor: pointer; color: var(--muted); font-weight: 600; padding: 4px 0; }
.help-body { padding: 4px 0 8px; }
.help-body ul { margin: 4px 0 10px; padding-left: 18px; }
.help-body li { margin: 2px 0; }
.help-h { font-weight: 600; margin: 8px 0 2px; }
.help code { background: var(--bg); border-radius: 4px; padding: 0 4px; font-family: ui-monospace, monospace; }

.top-btn {
  position: fixed;
  bottom: 32px;
  right: 32px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: var(--card-bg);
  color: var(--fg);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  cursor: pointer;
  font-size: 16px;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: box-shadow 0.15s;
}
.top-btn:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.15); }

/* 浮动大纲按钮（PC + 手机） */
.outline-btn {
  position: fixed;
  bottom: 82px;
  right: 32px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: var(--card-bg);
  color: var(--fg);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  cursor: pointer;
  font-size: 16px;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: box-shadow 0.15s, border-color 0.15s, color 0.15s;
}
.outline-btn:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
.outline-btn.on {
  border-color: var(--brand);
  color: var(--brand);
}

.empty {
  align-items: center;
  justify-content: center;
  display: flex;
}
.muted { color: var(--muted); }

/* ── 手机端响应式（≤768px）：PC base 不动 ── */
@media (max-width: 768px) {
  .editor-scroll {
    padding: 12px 14px 120px;
  }
  .top-btn,
  .outline-btn {
    right: 16px;
    width: 36px;
    height: 36px;
  }
  .outline-btn {
    bottom: 64px;
  }
}
</style>
