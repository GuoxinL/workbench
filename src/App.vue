<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import SyncChip from '@/components/common/SyncChip.vue'
import SettingsSheet from '@/components/common/SettingsSheet.vue'
import { useDataStore } from '@/stores/data'

const route = useRoute()
const active = computed(() => route.name)
const store = useDataStore()
const settingsOpen = ref(false)

// S20：离场前 flush 编辑器（确保最新内容已落盘）
window.addEventListener('beforeunload', () => {
  store.sync(false)
})
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <span class="brand">个人工作台</span>
      <nav class="tabs">
        <router-link :to="{ name: 'todos' }" :class="{ on: active === 'todos' }">待办</router-link>
        <router-link :to="{ name: 'articles' }" :class="{ on: active === 'articles' }">知识库</router-link>
        <router-link :to="{ name: 'graph' }" :class="{ on: active === 'graph' }">图谱</router-link>
        <router-link :to="{ name: 'tags' }" :class="{ on: active === 'tags' }">标签</router-link>
      </nav>
      <div class="right">
        <SyncChip />
        <button class="gear" title="设置" @click="settingsOpen = true">⚙</button>
      </div>
    </header>
    <main class="content">
      <router-view />
    </main>
    <SettingsSheet v-model="settingsOpen" />
  </div>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--line);
  padding-bottom: 12px;
  margin-bottom: 16px;
  gap: 12px;
}
.right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.gear {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 8px;
  width: 32px;
  height: 32px;
  cursor: pointer;
  font-size: 16px;
}
</style>
