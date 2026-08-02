<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ColorKey, Todo } from '@/types'
import { useDataStore } from '@/stores/data'
import TodoComposer from '@/components/todos/TodoComposer.vue'
import TodoFilters, { type StatusFilter } from '@/components/todos/TodoFilters.vue'
import TodoCard from '@/components/todos/TodoCard.vue'
import TodoEditSheet from '@/components/todos/TodoEditSheet.vue'
import Pagination from '@/components/common/Pagination.vue'

const store = useDataStore()

const status = ref<StatusFilter>('all')
const color = ref<ColorKey | null>(null)
const search = ref('')
const editOpen = ref(false)
const editing = ref<Todo | null>(null)

const hasFilter = computed(
  () => status.value !== 'all' || color.value !== null || search.value.trim() !== '',
)

// 全局按 time 倒序（最新在最前），筛选后回到第 1 页
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
    .sort((a, b) => b.time - a.time)
})

const PAGE_SIZE = 20
const page = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(list.value.length / PAGE_SIZE)))
const paged = computed(() =>
  list.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
)
watch([status, color, search], () => (page.value = 1))

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

    <template v-if="list.length">
      <div class="list">
        <TodoCard v-for="t in paged" :key="t.id" :todo="t" @edit="openEdit(t)" />
      </div>
      <Pagination v-model:page="page" :total-pages="totalPages" />
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
.empty {
  text-align: center;
  padding: 40px 0;
}
</style>
