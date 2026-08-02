<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Editor } from '@milkdown/kit/core'
import { useDataStore } from '@/stores/data'
import { slug } from '@/lib/slug'
import { insertWikilink, insertLinkMark } from './editorCommands'

const props = defineProps<{ editor: Editor | null }>()
const emit = defineEmits<{ close: [] }>()

const store = useDataStore()
const q = ref('')

/** 本文标题（H1/H2/H3），从编辑器 DOM 实时取 */
const headings = computed(() => {
  const view = (window as any).__milkdownView
  if (!view) return []
  const els = view.dom.querySelectorAll('h1, h2, h3')
  return [...els].map((el: Element) => ({
    level: Number(el.tagName.slice(1)),
    text: (el.textContent || '').trim(),
    slug: slug((el.textContent || '').trim()),
  }))
})

const isUrl = computed(() => /^https?:\/\/\S+$/i.test(q.value.trim()))
const isNative = computed(() => /^[^|]+\|\s*https?:\/\/\S+$/i.test(q.value.trim()))

/** 文章建议（双链） */
const articleMatches = computed(() => {
  const k = q.value.trim().toLowerCase()
  if (!k || isUrl.value || isNative.value) return []
  return store.articles
    .filter((a) => !a.deleted && a.title.toLowerCase().includes(k))
    .slice(0, 6)
})

/** 本文标题建议（文章内链接） */
const headingMatches = computed(() => {
  const k = q.value.trim().toLowerCase()
  if (!k || isUrl.value || isNative.value) return []
  return headings.value.filter((h) => h.text.toLowerCase().includes(k)).slice(0, 6)
})

function pickArticle(title: string) {
  if (!props.editor) return
  insertWikilink(props.editor, title)
  emit('close')
}

function pickHeading(text: string) {
  if (!props.editor) return
  insertLinkMark(props.editor, '#' + slug(text), text)
  emit('close')
}

function confirm() {
  if (!props.editor) return
  const v = q.value.trim()
  if (!v) return
  if (isUrl.value) {
    insertLinkMark(props.editor, v, v)
  } else if (isNative.value) {
    const [text, url] = v.split('|').map((s) => s.trim())
    insertLinkMark(props.editor, url, text)
  } else {
    // 纯文字：作为双链目标插入（若无匹配文章，会标记 missing，点击可创建）
    insertWikilink(props.editor, v)
  }
  emit('close')
}

// 打开时聚焦输入框
const inputRef = ref<any>(null)
watch(inputRef, (el) => el?.focus?.())
</script>

<template>
  <el-dialog :model-value="true" title="插入链接" width="480px" align-center :close-on-click-modal="false" @close="emit('close')">
    <div class="link-dialog">
      <el-input
        ref="inputRef"
        v-model="q"
        placeholder="输入文章标题（双链）/ 本文标题（锚点）/ https://URL（外部）/ 文字 | URL（原生）"
        @keydown.enter="confirm"
      />

      <!-- 三种链接说明 -->
      <div class="hints muted">
        <span>可引用：</span><span>·</span>
        <span>双链 [[文章]]</span><span>·</span>
        <span>本文标题锚点 #标题</span><span>·</span>
        <span>外部 URL</span>
      </div>

      <!-- URL 识别 -->
      <div v-if="isUrl" class="row">
        <span class="row-label">外部链接</span>
        <button class="pick" @click="confirm">插入链接 → {{ q.trim() }}</button>
      </div>
      <div v-else-if="isNative" class="row">
        <span class="row-label">原生链接</span>
        <button class="pick" @click="confirm">插入 [{{ q.split('|')[0].trim() }}]({{ q.split('|')[1].trim() }})</button>
      </div>

      <!-- 文章建议（双链） -->
      <div v-if="articleMatches.length" class="section">
        <div class="section-title">知识库文章（双链）</div>
        <button v-for="a in articleMatches" :key="a.id" class="pick" @click="pickArticle(a.title)">
          <span class="pick-main">{{ a.title }}</span>
          <span class="pick-sub">双链</span>
        </button>
      </div>

      <!-- 本文标题建议（锚点） -->
      <div v-if="headingMatches.length" class="section">
        <div class="section-title">本文标题（文章内链接）</div>
        <button v-for="(h, i) in headingMatches" :key="i" class="pick" @click="pickHeading(h.text)">
          <span class="pick-main">H{{ h.level }} · {{ h.text }}</span>
          <span class="pick-sub">#{{ h.slug }}</span>
        </button>
      </div>

      <!-- 纯文字无匹配：创建双链 -->
      <div v-if="q.trim() && !isUrl && !isNative && !articleMatches.length && !headingMatches.length" class="row">
        <span class="row-label">双链</span>
        <button class="pick" @click="confirm">创建双链 [[{{ q.trim() }}]]（目标不存在，点击可新建）</button>
      </div>
    </div>

    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" :disabled="!q.trim()" @click="confirm">插入</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.link-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.hints {
  display: flex;
  gap: 6px;
  font-size: 12px;
  flex-wrap: wrap;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.row-label {
  font-size: 12px;
  color: var(--brand);
  background: var(--brand-weak);
  padding: 2px 8px;
  border-radius: 999px;
  flex: none;
}
.section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.section-title {
  font-size: 12px;
  color: var(--muted);
  font-weight: 600;
  margin-bottom: 2px;
}
.pick {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  text-align: left;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--card-bg);
  color: var(--fg);
  cursor: pointer;
  font-size: 13px;
  transition: border-color 0.15s, background 0.15s;
}
.pick:hover {
  border-color: var(--brand);
  background: var(--brand-weak);
}
.pick-main {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pick-sub {
  font-size: 11px;
  color: var(--muted);
  flex: none;
}
.muted {
  color: var(--muted);
}
</style>
