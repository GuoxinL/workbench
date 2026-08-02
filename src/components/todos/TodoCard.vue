<script setup lang="ts">
import { computed } from 'vue'
import type { Todo } from '@/types'
import { useDataStore } from '@/stores/data'
import { colorHex, colorLabel } from '@/lib/colors'
import { formatTime } from '@/lib/datetime'

const props = defineProps<{ todo: Todo }>()
const emit = defineEmits<{ edit: [] }>()
const store = useDataStore()

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
      <div v-if="todo.desc" class="desc">{{ todo.desc }}</div>
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
  border-radius: 10px;
  margin-bottom: 10px;
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
  white-space: pre-wrap;
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
