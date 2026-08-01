<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { useDataStore } from '@/stores/data'
import { buildGraph } from '@/lib/links'
import { extractExcerpt, extractFirstImage, safeImageUrl } from '@/lib/markdown/excerpt'
import { COLOR_MAP } from '@/lib/colors'
import TagCloud from './TagCloud.vue'

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
  const tg = activeTag.value
  return store.articles
    .filter((n) => !n.deleted)
    .filter((n) => (k === '' ? true : n.title.toLowerCase().includes(k) || n.content.toLowerCase().includes(k)))
    .filter((n) => (tg === '' ? true : n.tags.includes(tg)))
    .sort((a, b) => b.updatedAt - a.updatedAt)
})

const featured = computed(() => list.value[0] ?? null)
const rest = computed(() => list.value.slice(1))

function fmt(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function excerpt(md: string) { return extractExcerpt(md, 120) }
function cover(md: string) { return safeImageUrl(extractFirstImage(md)) }

watch(q, (v) => pushQuery(v))

// 标签云：统计所有文章标签频次
const activeTag = ref('')
const tagStats = computed(() => {
  const map = new Map<string, number>()
  for (const a of store.articles) {
    if (a.deleted) continue
    for (const t of a.tags) map.set(t, (map.get(t) ?? 0) + 1)
  }
  return [...map.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count)
})
function onTagClick(tag: string) {
  activeTag.value = activeTag.value === tag ? '' : tag
}
</script>

<template>
  <section class="grid">
    <!-- 顶栏 -->
    <div class="bar">
      <input v-model="q" class="search" type="search" placeholder="搜索文章…" />
      <button class="new-btn" @click="emit('create')">＋ 新建</button>
    </div>

    <TagCloud v-if="tagStats.length" :tags="tagStats" :active="activeTag" @select="onTagClick" />

    <p v-if="!list.length" class="empty muted">还没有文章，点击「＋ 新建」开始写作</p>
    <template v-else>
      <!-- 首篇大卡（C 风格） -->
      <div v-if="featured" class="hero" @click="emit('select', featured.id)">
        <img v-if="cover(featured.content)" class="hero-img" :src="cover(featured.content)!" alt="" />
        <div class="hero-body">
          <div class="hero-title">{{ featured.title }}</div>
          <div class="hero-tags" v-if="featured.tags.length">
            <span v-for="t in featured.tags.slice(0, 4)" :key="t" class="tag" :style="{ background: COLOR_MAP[t as keyof typeof COLOR_MAP]?.hex || '#64748b' }">{{ t }}</span>
          </div>
          <div class="hero-excerpt">{{ excerpt(featured.content) }}</div>
          <div class="hero-meta muted">
            <span>{{ fmt(featured.updatedAt) }}</span>
            <span>↗{{ outCount(featured.id) }}</span>
            <span>↙{{ inCount(featured.id) }}</span>
          </div>
        </div>
      </div>

      <!-- 其余列表（B 风格） -->
      <div class="rest">
        <div
          v-for="n in rest"
          :key="n.id"
          class="card"
          @click="emit('select', n.id)"
        >
          <div class="card-thumb">
            <img v-if="cover(n.content)" :src="cover(n.content)!" alt="" />
            <div v-else class="no-img">{{ n.title.charAt(0) }}</div>
          </div>
          <div class="card-body">
            <div class="card-title">{{ n.title }}</div>
            <div class="card-tags" v-if="n.tags.length">
              <span v-for="t in n.tags.slice(0, 3)" :key="t" class="tag sm" :style="{ background: COLOR_MAP[t as keyof typeof COLOR_MAP]?.hex || '#64748b' }">{{ t }}</span>
            </div>
            <div class="card-excerpt muted">{{ excerpt(n.content) }}</div>
            <div class="card-meta muted">
              <span>{{ fmt(n.updatedAt) }}</span>
              <span>↗{{ outCount(n.id) }}</span>
              <span>↙{{ inCount(n.id) }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.grid {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

/* 顶栏 */
.bar {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}
.search {
  flex: 1;
  padding: 8px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  outline: none;
  font-size: 14px;
}
.search:focus { border-color: var(--brand); }
.new-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: var(--brand);
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  flex: none;
}

.empty { text-align: center; padding: 60px 0; font-size: 14px; }

/* 首篇大卡 */
.hero {
  cursor: pointer;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 24px;
  transition: box-shadow 0.15s;
}
.hero:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
.hero-img {
  width: 100%;
  height: 220px;
  object-fit: cover;
  display: block;
}
.hero-body { padding: 16px 20px; }
.hero-title {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 8px;
}
.hero-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.hero-excerpt {
  font-size: 14px;
  line-height: 1.7;
  color: var(--muted);
  margin-bottom: 8px;
}
.hero-meta { display: flex; gap: 16px; font-size: 12px; }

/* B 风格卡片列表 */
.rest { display: flex; flex-direction: column; gap: 10px; }
.card {
  display: flex;
  gap: 14px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
  transition: box-shadow 0.15s;
}
.card:hover { box-shadow: 0 1px 8px rgba(0,0,0,0.06); }

.card-thumb {
  width: 120px;
  height: 80px;
  flex: none;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg);
}
.card-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.no-img {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 700;
  color: var(--brand);
  background: var(--brand-weak);
}
.card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.card-title {
  font-weight: 600;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-excerpt {
  font-size: 13px;
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.card-meta { display: flex; gap: 12px; font-size: 11px; margin-top: auto; }

/* 标签 */
.tag {
  color: #fff;
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 999px;
}
.tag.sm { font-size: 11px; padding: 1px 7px; }

.muted { color: var(--muted); }
</style>
