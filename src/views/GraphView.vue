<script setup lang="ts">
import { onMounted, ref } from 'vue'
import GraphCanvas from '@/components/graph/GraphCanvas.vue'

// G8：切到图谱视图时才渲染，延迟 30ms 让视图先挂载
const ready = ref(false)
onMounted(() => {
  setTimeout(() => (ready.value = true), 30)
})
</script>

<template>
  <section class="view">
    <GraphCanvas v-if="ready" />
  </section>
</template>

<style scoped>
.view {
  height: calc(100vh - 110px);
}
</style>
