<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'

const store = useDataStore()
const router = useRouter()
const selected = ref<string | null>(null)

// TAG3/TAG4 数据源：聚合所有文章 frontmatter 的 tags
const tagCounts = computed(() => {
  const m = new Map<string, number>()
  for (const n of store.articles) {
    if (n.deleted) continue
    for (const t of n.tags) m.set(t, (m.get(t) ?? 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1])
})

function fontSize(count: number): number {
  return 14 + Math.min(count, 12) * 2
}
const palette = ['#3b82f6', '#ef4444', '#f59e0b', '#22c55e', '#a855f7', '#14b8a6', '#ec4899', '#64748b']
function color(t: string): string {
  let h = 0
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return palette[h % palette.length]
}

const filtered = computed(() => {
  const t = selected.value
  return store.articles
    .filter((n) => !n.deleted && (t === null || n.tags.includes(t)))
    .sort((a, b) => b.updatedAt - a.updatedAt)
})

function pick(t: string) {
  selected.value = selected.value === t ? null : t
}
function open(id: string) {
  router.push({ name: 'articles', params: { id } })
}
</script>

<template>
  <section class="view">
    <h2>标签云</h2>
    <p v-if="!tagCounts.length" class="muted">还没有标签，在文章里添加标签即可。</p>
    <div v-else class="cloud">
      <button
        v-for="[t, c] in tagCounts"
        :key="t"
        class="word"
        :class="{ on: selected === t }"
        :style="{ fontSize: fontSize(c) + 'px', color: color(t), borderColor: color(t) }"
        @click="pick(t)"
      >
        {{ t }} <sup>{{ c }}</sup>
      </button>
    </div>

    <div v-if="selected" class="result">
      <h3>「{{ selected }}」下的文章（共 {{ filtered.length }} 篇）</h3>
      <ul>
        <li v-for="n in filtered" :key="n.id" @click="open(n.id)">{{ n.title }}</li>
      </ul>
      <p v-if="!filtered.length" class="muted">该标签下暂无文章</p>
    </div>
  </section>
</template>

<style scoped>
.cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  align-items: center;
  padding: 20px 0;
}
.word {
  background: transparent;
  border: 1px solid;
  border-radius: 999px;
  padding: 2px 12px;
  cursor: pointer;
  line-height: 1.6;
  transition: transform 0.1s;
}
.word:hover {
  transform: scale(1.08);
}
.word.on {
  background: var(--brand-weak);
  font-weight: 700;
}
.result {
  margin-top: 16px;
}
.result h3 {
  font-size: 15px;
}
.result ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.result li {
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
}
.result li:hover {
  background: var(--bg);
}
.muted {
  color: var(--muted);
}
</style>
