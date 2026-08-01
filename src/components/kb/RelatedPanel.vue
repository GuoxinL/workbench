<script setup lang="ts">
import { computed } from 'vue'
import type { Article } from '@/types'
import { useDataStore } from '@/stores/data'
import { extractFirstImage, safeImageUrl } from '@/lib/markdown/excerpt'

const props = defineProps<{ article: Article }>()
const emit = defineEmits<{ open: [string] }>()
const store = useDataStore()

const related = computed(() =>
  store.articles
    .filter((a) => !a.deleted && a.id !== props.article.id)
    .filter((a) => a.tags.some((t) => props.article.tags.includes(t)))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8),
)

function cover(content: string) {
  return safeImageUrl(extractFirstImage(content))
}
</script>

<template>
  <aside class="related">
    <div class="label">推荐阅读</div>
    <p v-if="!related.length" class="empty muted">无相同标签的文章</p>
    <div v-for="r in related" :key="r.id" class="card" @click="emit('open', r.id)">
      <div class="thumb">
        <img v-if="cover(r.content)" :src="cover(r.content)!" alt="" />
        <div v-else class="no-img">{{ r.title.charAt(0) }}</div>
      </div>
      <div class="info">
        <span class="title">{{ r.title }}</span>
        <span class="tags" v-if="r.tags.length">
          <span v-for="t in r.tags.slice(0, 2)" :key="t" class="tag">{{ t }}</span>
        </span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.related {
  overflow-y: auto;
  padding: 10px;
  font-size: 12px;
}
.label {
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.empty {
  padding-top: 10px;
}
.card {
  display: flex;
  gap: 8px;
  padding: 6px 0;
  cursor: pointer;
  border-bottom: 1px dashed var(--line);
}
.card:hover { opacity: 0.8; }
.thumb {
  width: 48px;
  height: 36px;
  flex: none;
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.no-img {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: var(--brand);
  background: var(--brand-weak);
  width: 100%;
  height: 100%;
}
.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tags { display: flex; gap: 3px; flex-wrap: wrap; }
.tag {
  background: var(--brand);
  color: #fff;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
}
.muted { color: var(--muted); }
</style>
