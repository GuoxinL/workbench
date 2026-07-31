<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ColorKey, Todo } from '@/types'
import { useDataStore } from '@/stores/data'
import { sameMonth, sameWeek, sameYear, startOfDay } from '@/lib/datetime'
import TodoComposer from '@/components/todos/TodoComposer.vue'
import TodoFilters, { type StatusFilter } from '@/components/todos/TodoFilters.vue'
import TodoCard from '@/components/todos/TodoCard.vue'
import TodoEditSheet from '@/components/todos/TodoEditSheet.vue'

const store = useDataStore()

const status = ref<StatusFilter>('all')
const color = ref<ColorKey | null>(null)
const search = ref('')
const editOpen = ref(false)
const editing = ref<Todo | null>(null)

const hasFilter = computed(
  () => status.value !== 'all' || color.value !== null || search.value.trim() !== '',
)

const list = computed(() => {
  const q = search.value.trim().toLowerCase()
  return store.todos
    .filter((t) => !t.deleted)
    .filter((t) => (status.value === 'all' ? true : t.status === status.value))
    .filter((t) => (color.value === null ? true : t.color === color.value))
    .filter((t) =>
      q === ''
        ? true
        : t.title.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q),
    )
    // T4：未完成在前，同组内按 time 倒序
    .sort((a, b) => {
      const da = a.status === 'done' ? 1 : 0
      const db = b.status === 'done' ? 1 : 0
      if (da !== db) return da - db
      return b.time - a.time
    })
})

// #3：按固定自然周期分桶（今天/本周/本月/本年/更早按年）；月以上（本年、更早）默认收起
interface Segment {
  key: string
  label: string
  order: number
  defaultCollapsed: boolean
  todos: Todo[]
}

function periodOf(t: Todo): Omit<Segment, 'todos'> {
  const now = Date.now()
  if (startOfDay(t.time) === startOfDay(now)) return { key: 'today', label: '今天', order: 0, defaultCollapsed: false }
  if (sameWeek(t.time, now)) return { key: 'week', label: '本周', order: 1, defaultCollapsed: false }
  if (sameMonth(t.time, now)) return { key: 'month', label: '本月', order: 2, defaultCollapsed: false }
  if (sameYear(t.time, now)) return { key: 'year', label: '本年', order: 3, defaultCollapsed: true }
  const y = new Date(t.time).getFullYear()
  return { key: `y${y}`, label: String(y), order: 4 + (new Date(now).getFullYear() - y), defaultCollapsed: true }
}

const collapsed = ref<Record<string, boolean>>({})
function toggle(key: string) {
  collapsed.value = { ...collapsed.value, [key]: !collapsed.value[key] }
}
function isCollapsed(seg: Segment): boolean {
  return seg.key in collapsed.value ? collapsed.value[seg.key] : seg.defaultCollapsed
}

const segments = computed<Segment[]>(() => {
  const groups = new Map<string, Segment>()
  for (const t of list.value) {
    const p = periodOf(t)
    if (!groups.has(p.key)) groups.set(p.key, { ...p, todos: [] })
    groups.get(p.key)!.todos.push(t)
  }
  return [...groups.values()].sort((a, b) => a.order - b.order)
})

function openEdit(t: Todo) {
  editing.value = t
  editOpen.value = true
}
</script>

<template>
  <section class="view">
    <h2>TODO</h2>
    <TodoComposer />
    <TodoFilters v-model:status="status" v-model:color="color" v-model:search="search" />

    <template v-if="segments.length">
      <div v-for="seg in segments" :key="seg.key" class="seg">
        <button class="seg-head" type="button" @click="toggle(seg.key)">
          <span class="caret">{{ isCollapsed(seg) ? '▸' : '▾' }}</span>
          <span class="seg-label">{{ seg.label }}</span>
          <span class="seg-count">{{ seg.todos.length }}</span>
        </button>
        <div v-show="!isCollapsed(seg)" class="list">
          <TodoCard v-for="t in seg.todos" :key="t.id" :todo="t" @edit="openEdit(t)" />
        </div>
      </div>
    </template>
    <!-- T14：空状态区分 -->
    <p v-else class="empty muted">
      {{ hasFilter ? '没有符合条件的待办' : '还没有待办，在上方添加一条吧…' }}
    </p>

    <TodoEditSheet v-model="editOpen" :todo="editing" />
  </section>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
}
.seg {
  margin-bottom: 10px;
}
.seg-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 6px 2px;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
}
.seg-head:hover {
  color: var(--fg);
}
.caret {
  width: 12px;
}
.seg-label {
  flex: none;
}
.seg-count {
  flex: none;
  font-weight: 400;
  background: var(--bg);
  border-radius: 999px;
  padding: 0 8px;
  font-size: 12px;
}
.empty {
  text-align: center;
  padding: 40px 0;
}
</style>
