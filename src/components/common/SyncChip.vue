<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'

const store = useDataStore()

const label = computed(() => {
  switch (store.phase) {
    case 'syncing':
      return '同步中…'
    case 'ok':
      return '已同步'
    case 'error':
      return '同步失败'
    case 'off':
      return '本地模式'
    default:
      return '待同步'
  }
})

function manualSync() {
  store.sync(true) // S6：手动同步
}
</script>

<template>
  <button class="chip" :class="store.phase" :title="store.phase === 'error' ? '点击重试' : '点击手动同步'" @click="manualSync">
    <span class="dot" />
    {{ label }}
  </button>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 4px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--card-bg);
  cursor: pointer;
  white-space: nowrap;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--muted);
}
.chip.syncing .dot {
  background: #f59e0b;
}
.chip.ok .dot {
  background: #22c55e;
}
.chip.error .dot {
  background: #ef4444;
}
.chip.off .dot {
  background: var(--slate);
}
.chip.syncing {
  color: #b45309;
}
.chip.ok {
  color: #15803d;
}
.chip.error {
  color: #b91c1c;
}

/* 手机端：只显状态圆点，藏文字防断行 */
@media (max-width: 768px) {
  .chip {
    padding: 4px;
    gap: 0;
    font-size: 0;
  }
  .dot {
    margin: 0;
  }
}
</style>
