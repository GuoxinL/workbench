<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Article } from '@/types'
import { useDataStore } from '@/stores/data'
import { renderMarkdown } from '@/lib/markdown'
import { slug } from '@/lib/slug'
import { useAutoSave } from '@/composables/useAutoSave'
import LinksPanel from './LinksPanel.vue'
import WikiAutocomplete from './WikiAutocomplete.vue'

const props = defineProps<{ article: Article | null }>()
const emit = defineEmits<{ open: [string]; changed: [] }>()
const store = useDataStore()

const mode = ref<'read' | 'edit'>('read')
const draftTitle = ref('')
const draftContent = ref('')
const draftTags = ref<string[]>([])
const titleRef = ref<HTMLInputElement | null>(null)
const contentRef = ref<HTMLTextAreaElement | null>(null)

function isDirty(): boolean {
  const a = props.article
  if (!a) return false
  return a.title !== draftTitle.value.trim() || a.content !== draftContent.value || JSON.stringify(a.tags) !== JSON.stringify(draftTags.value)
}

// N6：只在切换文章（id 变化）时重置草稿，编辑中外部数据变更不打断
watch(
  () => props.article?.id,
  () => {
    if (props.article) {
      draftTitle.value = props.article.title
      draftContent.value = props.article.content
      draftTags.value = [...props.article.tags]
      mode.value = 'read'
    }
  },
  { immediate: true },
)

// N5：自动保存 700ms 防抖 + flushNow
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

// N5：失焦 / 切回阅读 / 切走前立即落盘
function enterEdit() {
  mode.value = 'edit'
  nextTick(() => {
    titleRef.value?.focus()
    titleRef.value?.select()
  })
}
function enterRead() {
  flush()
  mode.value = 'read'
}

// 供视图层在「新建」「切走」时调用（N3 / N5）
defineExpose({ enterEdit, flush })

function onPreviewClick(e: MouseEvent) {
  const a = (e.target as HTMLElement).closest('.wikilink') as HTMLElement | null
  if (!a) return
  const s = a.getAttribute('data-slug')!
  const target = store.articles.find((n) => !n.deleted && slug(n.title) === s)
  if (target) emit('open', target.id)
  else if (confirm(`创建文章「${a.getAttribute('data-title')}」？`)) {
    const na = store.addArticle(a.getAttribute('data-title')!)
    emit('open', na.id)
  }
}

// TAG1/TAG2：标签编辑（彩色 chip）
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
    await ElMessageBox.confirm(`删除文章「${props.article.title}」？其它文章中的引用将标记为未创建。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    store.removeArticle(props.article.id)
    emit('open', '')
  } catch {
    /* 取消 */
  }
}

const html = computed(() =>
  props.article ? renderMarkdown(draftContent.value, { exists: (s) => store.articles.some((n) => !n.deleted && slug(n.title) === s) }) : '',
)
const wordCount = computed(() => draftContent.value.replace(/\s/g, '').length)
const fromTodoTitle = computed(() => {
  const a = props.article
  if (!a?.fromTodo) return ''
  return store.todoById(a.fromTodo)?.title.slice(0, 20) ?? ''
})
</script>

<template>
  <section v-if="article" class="editor">
    <div class="bar">
      <input
        ref="titleRef"
        v-model="draftTitle"
        class="title-input"
        :readonly="mode === 'read'"
        @input="schedule"
        @blur="schedule"
      />
      <div class="bar-actions">
        <el-button v-if="mode === 'read'" size="small" @click="enterEdit">编辑</el-button>
        <el-button v-else size="small" type="primary" @click="enterRead">完成</el-button>
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
      <span
        v-for="t in draftTags"
        :key="t"
        class="tag"
        :style="{ background: tagColor(t) }"
        @click="mode === 'edit' && removeTag(t)"
      >{{ t }} <template v-if="mode === 'edit'">×</template></span>
      <input
        v-if="mode === 'edit'"
        v-model="tagInput"
        class="tag-input"
        placeholder="加标签回车"
        @keydown.enter.prevent="addTag(tagInput)"
      />
    </div>

    <div class="body">
      <textarea
        v-if="mode === 'edit'"
        ref="contentRef"
        v-model="draftContent"
        class="content"
        placeholder="支持 Markdown 与 [[双链]]…"
        @input="schedule"
        @blur="flush"
      />
      <WikiAutocomplete :textarea="contentRef" v-model="draftContent" :exclude-id="article.id" />
      <div v-if="mode === 'read'" class="preview markdown" @click="onPreviewClick" v-html="html" />
      <div v-else class="preview markdown live" v-html="html" />
    </div>

    <LinksPanel :article="article" @open="emit('open', $event)" />
  </section>
  <section v-else class="editor empty muted">
    <p>从左侧选择一篇文章，或点击「＋ 新建」</p>
  </section>
</template>

<style scoped>
.editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 16px 20px;
  overflow-y: auto;
}
.bar {
  display: flex;
  align-items: center;
  gap: 10px;
}
.title-input {
  flex: 1;
  font-size: 20px;
  font-weight: 700;
  border: none;
  outline: none;
  background: transparent;
  color: var(--fg);
}
.title-input[readonly] {
  cursor: default;
}
.bar-actions {
  display: flex;
  gap: 6px;
  flex: none;
}
.meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  margin: 8px 0;
  flex-wrap: wrap;
}
.tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 10px;
}
.tag {
  color: #fff;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  cursor: default;
}
.tag-input {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  outline: none;
  width: 120px;
}
.body {
  flex: 1;
  display: flex;
  gap: 16px;
  min-height: 0;
}
.content {
  flex: 1;
  min-width: 0;
  resize: none;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.7;
  outline: none;
}
.preview {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px 16px;
  background: #fff;
}
.empty {
  align-items: center;
  justify-content: center;
  display: flex;
}
</style>
