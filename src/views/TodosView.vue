<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ColorKey, Todo } from '@/types'
import { useDataStore } from '@/stores/data'
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
    // T4：未完成在前，同组内按 updatedAt 倒序
    .sort((a, b) => {
      const da = a.status === 'done' ? 1 : 0
      const db = b.status === 'done' ? 1 : 0
      if (da !== db) return da - db
      return b.updatedAt - a.updatedAt
    })
})

function openEdit(t: Todo) {
  editing.value = t
  editOpen.value = true
}
</script>

<template>
  <section class="view">
    <h2>待办</h2>
    <TodoComposer />
    <TodoFilters v-model:status="status" v-model:color="color" v-model:search="search" />

    <div v-if="list.length" class="list">
      <TodoCard v-for="t in list" :key="t.id" :todo="t" @edit="openEdit(t)" />
    </div>
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
.empty {
  text-align: center;
  padding: 40px 0;
}
</style>
