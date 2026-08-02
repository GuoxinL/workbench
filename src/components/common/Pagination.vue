<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ page: number; totalPages: number }>()
const emit = defineEmits<{ 'update:page': [number] }>()

const pages = computed(() => {
  const tp = props.totalPages
  const cur = props.page
  if (tp <= 7) return Array.from({ length: tp }, (_, i) => i + 1)
  // 显示首尾 + 当前页前后 1 页 + 省略
  const res: (number | '...')[] = [1]
  const start = Math.max(2, cur - 1)
  const end = Math.min(tp - 1, cur + 1)
  if (start > 2) res.push('...')
  for (let i = start; i <= end; i++) res.push(i)
  if (end < tp - 1) res.push('...')
  res.push(tp)
  return res
})

function go(p: number) {
  if (p < 1 || p > props.totalPages || p === props.page) return
  emit('update:page', p)
}
</script>

<template>
  <div v-if="totalPages > 1" class="pager">
    <button class="nav" :disabled="page <= 1" @click="go(page - 1)">‹ 上一页</button>
    <template v-for="(p, i) in pages" :key="i">
      <span v-if="p === '...'" class="ellipsis">…</span>
      <button v-else class="num" :class="{ on: p === page }" @click="go(p)">{{ p }}</button>
    </template>
    <button class="nav" :disabled="page >= totalPages" @click="go(page + 1)">下一页 ›</button>
  </div>
</template>

<style scoped>
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 20px;
  padding: 12px 0;
  flex-wrap: wrap;
}
button {
  border: 1px solid var(--line);
  background: var(--card-bg);
  color: var(--fg);
  border-radius: 6px;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 13px;
  min-width: 32px;
}
button:hover:not(:disabled):not(.on) {
  border-color: var(--brand);
  color: var(--brand);
}
button.on {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}
button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ellipsis {
  padding: 0 4px;
  color: var(--muted);
}
</style>
