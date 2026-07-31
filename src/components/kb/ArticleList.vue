<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { useDataStore } from '@/stores/data'
import { buildGraph } from '@/lib/links'
import { COLOR_MAP } from '@/lib/colors'

const props = defineProps<{ selected: string | null }>()
const emit = defineEmits<{ select: [string]; create: [] }>()
const store = useDataStore()

const q = ref('')
const query = ref('')
const pushQuery = useDebounceFn((v: string) => (query.value = v), 150)

const graph = computed(() => buildGraph(store.articles))
const outCount = (id: string) => graph.value.out.get(id)?.size ?? 0
const inCount = (id: string) => graph.value.in.get(id)?.size ?? 0

const list = computed(() => {
  const k = query.value.trim().toLowerCase()
  return store.articles
    .filter((n) => !n.deleted)
    .filter((n) => (k === '' ? true : n.title.toLowerCase().includes(k) || n.content.toLowerCase().includes(k)))
    .sort((a, b) => b.updatedAt - a.updatedAt)
})

function fmt(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

watch(q, (v) => pushQuery(v))
</script>

<template>
  <aside class="list">
    <div class="list-head">
      <input v-model="q" class="search" type="search" placeholder="搜索文章…" />
      <button class="new-btn" @click="emit('create')">＋ 新建</button>
    </div>
    <p v-if="!list.length" class="empty muted">还没有文章</p>
    <ul>
      <li
        v-for="n in list"
        :key="n.id"
        :class="{ on: n.id === props.selected }"
        @click="emit('select', n.id)"
      >
        <div class="row1">
          <span class="title" :title="n.title">{{ n.title }}</span>
          <span v-if="n.fromTodo" class="badge-from">来自待办</span>
          <span v-if="n.tags.length" class="tag-dot" :style="{ background: COLOR_MAP[n.tags[0] as keyof typeof COLOR_MAP]?.hex || '#64748b' }" />
        </div>
        <div class="row2 muted">
          <span>{{ fmt(n.updatedAt) }}</span>
          <span>↗{{ outCount(n.id) }}</span>
          <span>↙{{ inCount(n.id) }}</span>
        </div>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.list {
  width: 280px;
  flex: none;
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  height: 100%;
}
.list-head {
  display: flex;
  gap: 6px;
  padding: 10px;
  border-bottom: 1px solid var(--line);
}
.search {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  outline: none;
  font-size: 13px;
}
.search:focus {
  border-color: var(--brand);
}
.new-btn {
  flex: none;
  padding: 6px 10px;
  border: none;
  border-radius: 7px;
  background: var(--brand);
  color: #fff;
  cursor: pointer;
  font-size: 13px;
}
.empty {
  padding: 20px 10px;
  text-align: center;
  font-size: 13px;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
}
li {
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
}
li:hover {
  background: var(--bg);
}
li.on {
  background: var(--brand-weak);
}
.row1 {
  display: flex;
  align-items: center;
  gap: 6px;
}
.title {
  font-weight: 600;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.badge-from {
  font-size: 10px;
  color: #fff;
  background: var(--c-purple);
  border-radius: 999px;
  padding: 1px 6px;
  flex: none;
}
.tag-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
}
.row2 {
  display: flex;
  gap: 12px;
  font-size: 11px;
  margin-top: 4px;
}
</style>
