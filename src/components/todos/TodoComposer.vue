<script setup lang="ts">
import { ref } from 'vue'
import type { ColorKey } from '@/types'
import { useDataStore } from '@/stores/data'
import ColorSelect from './ColorSelect.vue'

const store = useDataStore()
const title = ref('')
const color = ref<ColorKey>('blue')
const inputRef = ref<HTMLInputElement | null>(null)

function add() {
  const t = title.value.trim()
  if (!t) {
    // T1：空标题时聚焦不创建
    inputRef.value?.focus()
    return
  }
  store.addTodo({ title: t, color: color.value })
  // T1：创建后清空并保持聚焦
  title.value = ''
  inputRef.value?.focus()
}
</script>

<template>
  <div class="composer">
    <input
      ref="inputRef"
      v-model="title"
      class="composer-input"
      type="text"
      placeholder="添加待办，回车创建…"
      @keydown.enter.prevent="add"
    />
    <ColorSelect v-model="color" />
    <button type="button" class="add-btn" @click="add">添加</button>
  </div>
</template>

<style scoped>
.composer {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.composer-input {
  flex: 1;
  min-width: 200px;
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
}
.composer-input:focus {
  border-color: var(--brand);
}
.add-btn {
  padding: 9px 18px;
  border: none;
  border-radius: 8px;
  background: var(--brand);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}
.add-btn:hover {
  filter: brightness(1.05);
}
</style>
