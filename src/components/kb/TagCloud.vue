<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ tags: { tag: string; count: number }[]; active?: string }>()
const emit = defineEmits<{ select: [string] }>()

const palette = ['#3b82f6', '#ef4444', '#f59e0b', '#22c55e', '#a855f7', '#14b8a6', '#ec4899', '#64748b']
function hex(t: string): string {
  let h = 0
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return palette[h % palette.length]
}

const maxCount = computed(() => Math.max(1, ...props.tags.map((t) => t.count)))
const MIN = 12
const MAX = 28

const styled = computed(() =>
  props.tags.map((t) => ({
    ...t,
    color: hex(t.tag),
    size: MIN + Math.round(((t.count - 1) / (maxCount.value - 1 || 1)) * (MAX - MIN)),
    active: t.tag === props.active,
  })).sort((a, b) => a.tag.localeCompare(b.tag))
)
</script>

<template>
  <div class="cloud" v-if="tags.length">
    <span class="label">标签云</span>
    <span
      v-for="t in styled"
      :key="t.tag"
      class="tag"
      :class="{ on: t.active }"
      :style="{ fontSize: t.size + 'px', color: t.active ? '#fff' : t.color, background: t.active ? t.color : 'transparent' }"
      @click="emit('select', t.tag)"
    >{{ t.tag }}</span>
  </div>
</template>

<style scoped>
.cloud {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 14px;
  padding: 10px 0 14px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 16px;
}
.label {
  font-weight: 600;
  color: var(--muted);
  font-size: 12px;
  margin-right: 4px;
}
.tag {
  cursor: pointer;
  border-radius: 4px;
  padding: 1px 4px;
  transition: all 0.15s;
  line-height: 1.5;
}
.tag:hover { opacity: 0.75; }
.tag.on {
  border-radius: 4px;
  padding: 0 6px;
}
</style>
