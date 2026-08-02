<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { parseFrontmatter } from '@/lib/markdown/frontmatter'
import { renderMarkdown } from '@/lib/markdown'
import { useDataStore } from '@/stores/data'

const route = useRoute()
const store = useDataStore()

const loading = ref(true)
const error = ref('')
const title = ref('')
const html = ref('')
const tags = ref<string[]>([])
const createdAt = ref(0)

/** 推导公开镜像仓库：优先本地 config.publicRepo；否则从 github.io 域名取 owner。 */
const publicRepo = computed(() => {
  const cfg = store.getConfig()
  if (cfg.publicRepo && /^[^/\s]+\/[^/\s]+$/.test(cfg.publicRepo)) return cfg.publicRepo
  const m = location.hostname.match(/^([^.]+)\.github\.io$/)
  if (m) return `${m[1]}/workbench-public`
  return ''
})

onMounted(async () => {
  const id = route.params.id as string
  const repo = publicRepo.value
  if (!repo) {
    error.value = '未配置公开镜像仓库（仅可在作者浏览器预览）'
    loading.value = false
    return
  }
  const branch = store.getConfig().branch || 'main'
  const url = `https://raw.githubusercontent.com/${repo}/${branch}/kb/${id}.md`
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      error.value = res.status === 404 ? '文章未发布或不存在' : `加载失败（${res.status}）`
      loading.value = false
      return
    }
    const raw = await res.text()
    const { data, content } = parseFrontmatter(raw)
    title.value = String(data.title ?? '未命名文章')
    tags.value = Array.isArray(data.tags) ? (data.tags as unknown[]).map(String) : []
    createdAt.value = Number(data.createdAt ?? 0)
    html.value = renderMarkdown(content)
  } catch {
    error.value = '网络错误，无法加载文章'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="share">
    <p v-if="loading" class="muted">加载中…</p>
    <p v-else-if="error" class="muted">{{ error }}</p>
    <article v-else class="article">
      <h1 class="title">{{ title }}</h1>
      <div class="meta muted">
        <span v-if="createdAt">{{ new Date(createdAt).toLocaleDateString() }}</span>
        <span v-for="t in tags" :key="t" class="tag">{{ t }}</span>
      </div>
      <div class="content milkdown" v-html="html"></div>
    </article>
  </section>
</template>

<style scoped>
.share {
  max-width: 760px;
  margin: 0 auto;
  padding: 24px 16px 80px;
}
.title {
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 12px;
}
.meta {
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 13px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}
.tag {
  background: var(--brand-weak);
  color: var(--brand);
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
}
.content {
  line-height: 1.8;
}
.content :deep(h1) { font-size: 1.8em; margin: 1em 0 0.5em; }
.content :deep(h2) { font-size: 1.5em; margin: 1em 0 0.5em; }
.content :deep(h3) { font-size: 1.25em; margin: 0.8em 0 0.4em; }
.content :deep(pre) {
  background: var(--bg);
  padding: 12px 14px;
  border-radius: 8px;
  overflow-x: auto;
}
.content :deep(code) {
  font-family: ui-monospace, monospace;
  background: var(--bg);
  padding: 0 4px;
  border-radius: 4px;
}
.content :deep(pre code) { background: none; padding: 0; }
.content :deep(blockquote) {
  border-left: 3px solid var(--brand);
  margin: 0;
  padding: 4px 14px;
  color: var(--muted);
}
.content :deep(img) { max-width: 100%; border-radius: 8px; }
.content :deep(table) { border-collapse: collapse; width: 100%; }
.content :deep(th), .content :deep(td) { border: 1px solid var(--line); padding: 6px 10px; }
.muted { color: var(--muted); }
</style>
