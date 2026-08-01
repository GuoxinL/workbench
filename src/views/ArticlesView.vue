<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import ArticleEditor from '@/components/kb/ArticleEditor.vue'
import ArticleGrid from '@/components/kb/ArticleGrid.vue'

const store = useDataStore()
const route = useRoute()
const router = useRouter()
const editorRef = ref<InstanceType<typeof ArticleEditor> | null>(null)

const selectedId = ref<string>((route.params.id as string) || '')
const selected = computed(() => (selectedId.value ? store.articleById(selectedId.value) ?? null : null))

watch(
  () => route.params.id,
  (id) => {
    selectedId.value = (id as string) || ''
  },
)

function onSelect(id: string) {
  editorRef.value?.flush() // N5：切走前落盘
  selectedId.value = id
  router.push({ name: 'articles', params: { id } })
}

function onCreate() {
  editorRef.value?.flush()
  const a = store.addArticle() // N3：默认「未命名文章」+ 同名去重
  selectedId.value = a.id
  router.push({ name: 'articles', params: { id: a.id } })
}
</script>

<template>
  <section class="view" :class="{ grid: !selected }">
    <ArticleGrid v-if="!selected" @select="onSelect" @create="onCreate" />
    <template v-else>
      <ArticleEditor ref="editorRef" :article="selected" @open="onSelect" />
    </template>
  </section>
</template>

<style scoped>
.view {
  height: calc(100vh - 110px);
}
.view.grid {
  display: block;
}
</style>
