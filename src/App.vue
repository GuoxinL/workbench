<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const active = computed(() => route.name)
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <span class="brand">个人工作台</span>
      <nav class="tabs">
        <router-link :to="{ name: 'todos' }" :class="{ on: active === 'todos' }">待办</router-link>
        <router-link :to="{ name: 'notes' }" :class="{ on: active === 'notes' }">笔记</router-link>
        <router-link :to="{ name: 'graph' }" :class="{ on: active === 'graph' }">图谱</router-link>
      </nav>
    </header>
    <main class="content">
      <router-view />
    </main>
    <footer class="foot">
      <el-button type="primary" size="small">Element Plus 已就绪</el-button>
    </footer>
  </div>
</template>
