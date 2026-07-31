<script setup lang="ts">
import type { ColorKey } from '@/types'
import { COLORS } from '@/lib/colors'

const props = defineProps<{ modelValue: ColorKey }>()
const emit = defineEmits<{ 'update:modelValue': [ColorKey] }>()

function pick(key: ColorKey) {
  emit('update:modelValue', key)
}
</script>

<template>
  <div class="color-select">
    <button
      v-for="c in COLORS"
      :key="c.key"
      type="button"
      class="dot"
      :class="{ on: props.modelValue === c.key }"
      :style="{ background: c.hex }"
      :title="c.label"
      @click="pick(c.key)"
    />
  </div>
</template>

<style scoped>
.color-select {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  transition: transform 0.1s;
}
.dot:hover {
  transform: scale(1.12);
}
.dot.on {
  border-color: var(--fg);
  box-shadow: 0 0 0 2px #fff inset;
}
</style>
