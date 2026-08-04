<script setup lang="ts">
import { computed } from 'vue'
import type { Todo } from '@/types'
import { useDataStore } from '@/stores/data'
import { colorHex, colorLabel } from '@/lib/colors'
import { formatTime } from '@/lib/datetime'
import { renderMarkdown } from '@/lib/markdown'
import { slug } from '@/lib/slug'

const props = defineProps<{ todo: Todo }>()
const emit = defineEmits<{ edit: [] }>()
const store = useDataStore()

// 描述按 Markdown 富文本渲染：标题→文章 id 解析，让 [[双链]] 正确高亮/跳转
const descHtml = computed(() => {
  if (!props.todo.desc) return ''
  const resolve = (title: string) => {
    const a = store.articles.find((n) => !n.deleted && slug(n.title) === slug(title))
    return a ? a.id : null
  }
  return renderMarkdown(props.todo.desc, { resolve })
})

const done = computed(() => props.todo.status === 'done')
const hex = computed(() => colorHex(props.todo.color))

const today = new Date().toISOString().slice(0, 10)
const overdue = computed(
  () => !done.value && props.todo.due !== '' && props.todo.due < today,
)
const dueLabel = computed(() =>
  props.todo.due === '' ? '' : overdue.value ? '已逾期' : `截止 ${props.todo.due}`,
)

const related = computed(() =>
  props.todo.articleId ? store.articleById(props.todo.articleId) : undefined,
)

const timeLabel = computed(() => formatTime(props.todo.time))

function toggle() {
  // T8：done ↔ todo 互切
  store.updateTodo(props.todo.id, { status: done.value ? 'todo' : 'done' })
}

async function remove() {
  // T13：删除确认，文案含标题
  try {
    await ElMessageBox.confirm(`确定删除待办「${props.todo.title}」？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    store.removeTodo(props.todo.id)
  } catch {
    /* 取消 */
  }
}
</script>

<template>
  <div class="card" :class="{ done }" :style="{ '--c': hex }">
    <button class="check" :class="{ on: done }" :title="done ? '标记为待办' : '标记为完成'" @click="toggle" />
    <div class="body" @click="emit('edit')">
      <div class="title-row">
        <span class="title">{{ todo.title }}</span>
        <span class="color-tag" :style="{ background: hex }">{{ colorLabel(todo.color) }}</span>
      </div>
      <div v-if="todo.desc" class="desc todo-desc-md" v-html="descHtml" />
      <div class="meta">
        <span v-if="dueLabel" class="due" :class="{ over: overdue }">{{ dueLabel }}</span>
        <span class="time">{{ timeLabel }}</span>
        <router-link
          v-if="related"
          :to="{ name: 'articles', params: { id: related.id } }"
          class="article-link"
          @click.stop
        >📝 {{ related.title }}</router-link>
      </div>
    </div>
    <div class="actions">
      <button class="mini" title="编辑" @click.stop="emit('edit')">✎</button>
      <button class="mini danger" title="删除" @click.stop="remove">🗑</button>
    </div>
  </div>
</template>

<style scoped>
.card {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  background: var(--card-bg);
  border: 1px solid var(--line);
  border-left: 4px solid var(--c);
  border-radius: var(--radius);
  margin-bottom: 10px;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.18s, transform 0.18s;
}
.card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}
.card.done {
  opacity: 0.62;
}
.check {
  flex: none;
  width: 20px;
  height: 20px;
  margin-top: 2px;
  border-radius: 50%;
  border: 2px solid var(--c);
  background: var(--card-bg);
  cursor: pointer;
}
.check.on {
  background: var(--c);
  position: relative;
}
.check.on::after {
  content: '✓';
  color: #fff;
  font-size: 12px;
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.body {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}
.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.title {
  font-weight: 600;
}
.card.done .title {
  text-decoration: line-through;
}
.color-tag {
  font-size: 11px;
  color: #fff;
  padding: 1px 7px;
  border-radius: 999px;
}
.desc {
  color: var(--muted);
  font-size: 13px;
  margin-top: 3px;
  word-break: break-word;
}
.meta {
  margin-top: 6px;
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 12px;
}
.due {
  color: var(--muted);
}
.due.over {
  color: #ef4444;
  font-weight: 600;
}
.time {
  color: var(--muted);
}
.article-link {
  color: var(--brand);
  text-decoration: none;
}
.actions {
  display: flex;
  gap: 4px;
}
.mini {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  padding: 4px 6px;
  border-radius: 6px;
  color: var(--muted);
}
.mini:hover {
  background: var(--bg);
}
.mini.danger:hover {
  color: #ef4444;
}
</style>

<!-- 非 scoped：富文本由 v-html 注入，scoped 的 data-v 不会落到其子树，
     且 Vite 的 lightningcss 会丢弃 :deep() 规则；改用唯一类 .todo-desc-md
     + 普通后代选择器，保证生产构建中样式仍生效。 -->
<style>
.todo-desc-md p {
  margin: 0 0 6px;
}
.todo-desc-md p:last-child {
  margin-bottom: 0;
}
.todo-desc-md ul,
.todo-desc-md ol {
  padding-left: 1.2em;
  margin: 4px 0;
}
.todo-desc-md li {
  margin: 2px 0;
}
.todo-desc-md h1,
.todo-desc-md h2,
.todo-desc-md h3 {
  font-size: 1em;
  font-weight: 600;
  margin: 6px 0 4px;
}
.todo-desc-md code {
  background: var(--bg);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
}
.todo-desc-md pre {
  background: var(--card-bg);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 6px 10px;
  overflow-x: auto;
  margin: 4px 0;
}
.todo-desc-md pre code {
  background: none;
  padding: 0;
}
.todo-desc-md blockquote {
  border-left: 2px solid var(--line);
  padding-left: 8px;
  margin: 4px 0;
  color: var(--muted);
}
.todo-desc-md hr {
  border: 0;
  border-top: 1px solid var(--line);
  margin: 6px 0;
}
.todo-desc-md img {
  max-width: 100%;
}
.todo-desc-md a {
  color: var(--brand);
  text-decoration: none;
}
.todo-desc-md a.wikilink {
  color: var(--brand);
  border-bottom: 1px dashed var(--brand);
  cursor: pointer;
}
.todo-desc-md a.wikilink.missing {
  color: #ef4444;
  border-bottom-color: #ef4444;
}
</style>

