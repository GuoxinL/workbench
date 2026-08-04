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

// Bug #3 修复：error 时同步把错误信息加到 title，鼠标悬浮即可看到详细
// 原因；成功/空闲时 title 提示「点击手动同步」。
const title = computed(() => {
  if (store.phase === 'error') {
    return store.lastSyncError
      ? `点击重试 · ${store.lastSyncError}`
      : '点击重试'
  }
  return '点击手动同步'
})

function manualSync() {
  store.sync(true) // S6：手动同步
}
</script>

<template>
  <button class="chip" :class="store.phase" :title="title" @click="manualSync">
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
