<script setup lang="ts">
import { computed } from 'vue'
import type { Article } from '@/types'
import { useDataStore } from '@/stores/data'
import { buildGraph, extractRefs } from '@/lib/links'
import { slug } from '@/lib/slug'

const props = defineProps<{ article: Article; content?: string }>()
const emit = defineEmits<{ open: [string] }>()
const store = useDataStore()

const graph = computed(() => buildGraph(store.articles))
const selfSlug = computed(() => slug(props.article.title))

// 出链优先用实时草稿内容（编辑器输入即反映），回退到已保存内容
const sourceContent = computed(() => props.content ?? props.article.content)

// 出链（L3 / L5 / L6）
const outgoing = computed(() => {
  const refs = extractRefs(sourceContent.value)
  return refs.map((r) => {
    const s = slug(r.title)
    const target = store.articles.find((n) => !n.deleted && slug(n.title) === s)
    return {
      slug: s,
      title: r.title,
      missing: !target,
      id: target?.id,
      summary: target ? target.content.replace(/[#>*`\[\]]/g, '').trim().slice(0, 24) : '',
    }
  })
})
const pendingCount = computed(() => outgoing.value.filter((o) => o.missing).length)

// 入链（L4）：来自哪些文章、引用所在行上下文（60 字，别名替换后）
const incoming = computed(() => {
  const sources = graph.value.in.get(props.article.id) ?? new Set<string>()
  return [...sources].map((id) => {
    const src = store.articleById(id)
    return { id, title: src?.title ?? '', excerpt: src ? contextLine(src.content, selfSlug.value) : '' }
  })
})

function contextLine(content: string, targetSlug: string): string {
  for (const line of content.split('\n')) {
    if (!line.includes('[[')) continue
    const refs = extractRefs(line)
    if (refs.some((r) => slug(r.title) === targetSlug)) {
      const cleaned = line.replace(/\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]/g, (_, t: string, a?: string) => a || t)
      const text = cleaned.replace(/[#>*`]/g, '').trim()
      return text.length > 60 ? text.slice(0, 60) + '…' : text
    }
  }
  return ''
}

function openOutgoing(o: { missing: boolean; id?: string; title: string }) {
  if (o.missing) {
    const a = store.addArticle(o.title) // L5：点击立即创建并跳转
    emit('open', a.id)
  } else if (o.id) {
    emit('open', o.id)
  }
}
</script>

<template>
  <div class="links">
    <div class="panel">
      <h4>引用了 <span v-if="pendingCount" class="pend">(+{{ pendingCount }} 待建)</span></h4>
      <p v-if="!outgoing.length" class="muted">无出链</p>
      <ul>
        <li
          v-for="o in outgoing"
          :key="o.slug"
          :class="{ missing: o.missing }"
          @click="openOutgoing(o)"
        >
          <template v-if="o.missing">＋ {{ o.title }}（未创建）</template>
          <template v-else>{{ o.title }} <span class="muted">— {{ o.summary }}</span></template>
        </li>
      </ul>
    </div>
    <div class="panel">
      <h4>被引用</h4>
      <p v-if="!incoming.length" class="muted">无入链</p>
      <ul>
        <li v-for="i in incoming" :key="i.id" @click="i.id && emit('open', i.id)">
          {{ i.title }} <span class="muted">— {{ i.excerpt }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.links {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.panel h4 {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--muted);
}
.pend {
  color: #f59e0b;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
li {
  font-size: 13px;
  padding: 4px 0;
  cursor: pointer;
  border-bottom: 1px dashed var(--line);
}
li.missing {
  color: #f59e0b;
}
.muted {
  color: var(--muted);
  font-size: 12px;
}
</style>
