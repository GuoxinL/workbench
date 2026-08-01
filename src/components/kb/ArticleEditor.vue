<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import type { Article } from '@/types'
import { useDataStore } from '@/stores/data'
import { useAutoSave } from '@/composables/useAutoSave'
import { slug } from '@/lib/slug'
import MilkdownEditor from './MilkdownEditor.vue'
import ArticleOutline from './ArticleOutline.vue'
import RelatedPanel from './RelatedPanel.vue'
import LinksPanel from './LinksPanel.vue'
import EditorContextMenu from './EditorContextMenu.vue'
import type { MenuAction } from './EditorContextMenu.vue'
import { compressImage } from '@/lib/image'

const props = defineProps<{ article: Article | null }>()
const emit = defineEmits<{ open: [string]; changed: [] }>()
const store = useDataStore()

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

/** 双链点击：wikilink 的 data-slug → 查找文章 → 跳转；不存在则提示创建 */
function onWikilinkClick(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest('.wikilink') as HTMLElement | null
  if (!el) return
  const s = el.getAttribute('data-slug')
  if (!s) return
  const target = store.articles.find((n) => !n.deleted && slug(n.title) === s)
  if (target) {
    emit('open', target.id)
  } else {
    const title = el.getAttribute('data-title') || s
    if (confirm(`创建文章「${title}」？`)) {
      const na = store.addArticle(title)
      emit('open', na.id)
    }
  }
}

/** 扫描 Milkdown 中的 wikilink，标记缺失目标为红色 */
function refreshMissingLinks() {
  requestAnimationFrame(() => {
    document.querySelectorAll('.milkdown .wikilink').forEach((el) => {
      const s = el.getAttribute('data-slug')
      const existed = s ? store.articles.some((n) => !n.deleted && slug(n.title) === s) : false
      el.classList.toggle('missing', !existed)
    })
  })
}
watchDebounced(() => store.articles, refreshMissingLinks, { debounce: 300 })
onMounted(refreshMissingLinks)

// ── 右键上下文菜单 ──
const ctxMenu = ref({ x: 0, y: 0, show: false })

const menuActions: MenuAction[] = [
  { key: 'image', label: '插入图片…', shortcut: 'Ctrl+V', action: 'image' },
  { key: 'link', label: '插入链接…', shortcut: 'Ctrl+K', action: 'link' },
  { key: 'table', label: '插入表格…', action: 'table' },
  { key: 'div1', label: '', divider: true },
  { key: 'h1', label: '一级标题', shortcut: 'Ctrl+1', markdown: '# ' },
  { key: 'h2', label: '二级标题', shortcut: 'Ctrl+2', markdown: '## ' },
  { key: 'h3', label: '三级标题', shortcut: 'Ctrl+3', markdown: '### ' },
  { key: 'div2', label: '', divider: true },
  { key: 'ul', label: '无序列表', shortcut: 'Ctrl+Shift+U', markdown: '- ' },
  { key: 'ol', label: '有序列表', shortcut: 'Ctrl+Shift+O', markdown: '1. ' },
  { key: 'quote', label: '引用块', shortcut: 'Ctrl+Shift+Q', markdown: '> ' },
  { key: 'code', label: '代码块', shortcut: 'Ctrl+Shift+K', markdown: '`\n\`' },
  { key: 'hr', label: '分割线', markdown: '---\n' },
]

function onEditorContextMenu(e: MouseEvent) {
  e.preventDefault()
  const el = (e.target as HTMLElement).closest('.milkdown, .milkdown-editor, .ProseMirror')
  if (!el) return
  ctxMenu.value = { x: e.clientX, y: e.clientY, show: true }
}

/** 在 Milkdown 光标处插入文本 */
function insertAtCursor(text: string) {
  const view = (window as any).__milkdownView
  if (!view) return
  const tr = view.state.tr.insertText(text)
  view.dispatch(tr)
}

async function handleMenuAction(key: string, a: MenuAction) {
  ctxMenu.value.show = false
  if (key === 'image') {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const dataUri = await compressImage(file)
        insertAtCursor(`![](${dataUri})`)
      } catch { /* ignore */ }
    }
    input.click()
  } else if (key === 'link') {
    const url = prompt('链接 URL：', 'https://')
    if (url) insertAtCursor(`[${url}](${url})`)
  } else if (key === 'table') {
    const rows = prompt('表格行数（默认 3）', '3')
    const cols = prompt('表格列数（默认 3）', '3')
    const r = parseInt(rows || '3', 10) || 3
    const c = parseInt(cols || '3', 10) || 3
    let table = ''
    for (let i = 0; i < r; i++) {
      table += '| ' + Array(c).fill('  ').join(' | ') + ' |\n'
      if (i === 0) table += '| ' + Array(c).fill('---').join(' | ') + ' |\n'
    }
    insertAtCursor(table)
  } else if (a.markdown) {
    insertAtCursor(a.markdown)
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
    <div class="editor-scroll" @click="onWikilinkClick" @contextmenu.prevent="onEditorContextMenu">
      <div class="bar">
        <input
          v-model="draftTitle"
          class="title-input"
          placeholder="文章标题"
          @input="schedule"
          @blur="schedule"
        />
        <div class="bar-actions">
          <el-button size="small" type="danger" plain @click="remove">删除</el-button>
        </div>
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
        <summary>Markdown / 双链引用语法帮助</summary>
        <div class="help-body">
          <p class="help-h">Markdown：</p>
          <ul>
            <li><code># 标题</code> / <code>## 小标题</code> 分级标题</li>
            <li><code>**粗体**</code>、<code>*斜体*</code>、<code>`行内代码`</code></li>
            <li><code>- 列表项</code> / <code>1. 列表项</code></li>
            <li><code>![[图片说明]](url)</code> 图片</li>
          </ul>
          <p class="help-h">双链引用：</p>
          <ul>
            <li><code>[[文章标题]]</code> 引用文章</li>
            <li><code>[[文章标题|别名]]</code> 引用并显示别名</li>
          </ul>
          <p class="help-h">标签：</p>
          <ul>
            <li>上方标签区输入框回车即可添加标签</li>
          </ul>
        </div>
      </details>

      <MilkdownEditor
        v-if="draftContent !== undefined"
        :model-value="draftContent"
        @update:model-value="onContentChange"
      />

      <LinksPanel :article="article" @open="emit('open', $event)" />
    </div>

    <!-- 右栏：大纲(上2/3) + 推荐(下1/3) -->
    <div class="right-side">
      <ArticleOutline :content="draftContent" @jump="onJumpToHeading" />
      <RelatedPanel :article="article" @open="emit('open', $event)" />
    </div>

    <!-- Top 按钮 -->
    <button class="top-btn" title="回到顶部" @click="scrollTop">⬆</button>

    <!-- 右键上下文菜单 -->
    <EditorContextMenu
      v-if="ctxMenu.show"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      :actions="menuActions"
      @select="handleMenuAction"
      @close="ctxMenu.show = false"
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
.bar-actions { display: flex; gap: 6px; flex: none; }

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
  background: #fff;
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
  background: #fff;
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

.empty {
  align-items: center;
  justify-content: center;
  display: flex;
}
.muted { color: var(--muted); }
</style>
