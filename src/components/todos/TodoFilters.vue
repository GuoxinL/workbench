<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import type { ColorKey, TodoStatus } from '@/types'
import { COLORS } from '@/lib/colors'

export type StatusFilter = 'all' | TodoStatus

const props = defineProps<{
  status: StatusFilter
  color: ColorKey | null
  search: string
}>()
const emit = defineEmits<{
  'update:status': [StatusFilter]
  'update:color': [ColorKey | null]
  'update:search': [string]
}>()

const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '待办', value: 'todo' },
  { label: '进行中', value: 'doing' },
  { label: '已完成', value: 'done' },
]

// T6：颜色筛选——首块「全部颜色」渐变块，点同色取消
function pickColor(key: ColorKey) {
  emit('update:color', props.color === key ? null : key)
}
function clearColor() {
  emit('update:color', null)
}

// T7：关键词搜索，160ms 防抖
const q = ref(props.search)
watch(
  () => props.search,
  (v) => {
    if (v !== q.value) q.value = v
  },
)
const pushSearch = useDebounceFn((v: string) => emit('update:search', v), 160)
watch(q, (v) => pushSearch(v))
</script>

<template>
  <div class="filters">
    <el-segmented :model-value="props.status" :options="statusOptions" @update:model-value="emit('update:status', $event as StatusFilter)" />
    <div class="colors">
      <button
        type="button"
        class="all-block"
        :class="{ on: props.color === null }"
        title="全部颜色"
        @click="clearColor"
      />
      <button
        v-for="c in COLORS"
        :key="c.key"
        type="button"
        class="c-block"
        :class="{ on: props.color === c.key }"
        :style="{ background: c.hex }"
        :title="c.label"
        @click="pickColor(c.key)"
      />
    </div>
    <input v-model="q" class="search" type="search" placeholder="搜索标题或描述…" />
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.colors {
  display: flex;
  gap: 6px;
}
.all-block {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  border: 1px solid var(--line);
  cursor: pointer;
  background: linear-gradient(135deg, #3b82f6, #ef4444, #f59e0b, #22c55e, #a855f7);
  padding: 0;
}
.all-block.on {
  outline: 2px solid var(--fg);
  outline-offset: 1px;
}
.c-block {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
}
.c-block.on {
  border-color: #fff;
  box-shadow: 0 0 0 2px var(--fg);
}
.search {
  margin-left: auto;
  padding: 7px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 13px;
  outline: none;
  min-width: 180px;
}
.search:focus {
  border-color: var(--brand);
}
</style>
