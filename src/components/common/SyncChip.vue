<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'

withDefaults(defineProps<{ mode?: 'pc' | 'app' }>(), { mode: 'pc' })

const store = useDataStore()

// 语义色（直接 hex，避免嵌套 var() 在部分浏览器解析失败，见 02-plan.md §10.3）
const COLOR: Record<string, string> = {
  idle: '#94a3b8',
  off: '#374151',
  syncing: '#2563eb',
  uptodate: '#16a34a',
  ok: '#22c55e',
  error: '#dc2626',
}

const LABEL: Record<string, string> = {
  idle: '待同步',
  off: '本地模式',
  syncing: '同步中…',
  uptodate: '已是最新',
  ok: '已同步',
  error: '同步失败',
}

const color = computed(() => COLOR[store.phase] ?? COLOR.idle)
const label = computed(() => LABEL[store.phase] ?? LABEL.idle)

function fmtTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

// PC 药丸的副信息（长说明）
const meta = computed(() => {
  if (store.phase === 'error') {
    return store.lastSyncError ? `点击重试 · ${store.lastSyncError}` : '点击重试'
  }
  if (store.phase === 'uptodate') {
    return store.lastSyncAt ? `上次检查 ${fmtTime(store.lastSyncAt)}` : '无变更'
  }
  if (store.phase === 'ok') {
    const { pulled, pushedN, deleted } = store.lastSyncMeta
    if (pulled || pushedN || deleted) {
      const parts: string[] = []
      if (pushedN) parts.push(`↑${pushedN}`)
      if (pulled) parts.push(`↓${pulled}`)
      if (deleted) parts.push(`✕${deleted}`)
      return parts.join(' ') + (store.lastSyncAt ? ` · ${fmtTime(store.lastSyncAt)}` : '')
    }
    return store.lastSyncAt ? `上次检查 ${fmtTime(store.lastSyncAt)}` : ''
  }
  return '点击手动同步'
})

// App 纯点的 title（无文字，仅悬浮提示）
const title = computed(() => {
  if (store.phase === 'error') return store.lastSyncError ? `同步失败 · ${store.lastSyncError}` : '同步失败'
  return `${label.value}${meta.value ? ' · ' + meta.value : ''}`
})

function manualSync() {
  store.sync(true) // S6：手动同步（error 态即「重试」）
}
</script>

<template>
  <button
    v-if="mode === 'app'"
    class="dot-only"
    :title="title"
    :style="{ background: color, animation: store.phase === 'syncing' ? 'sc-pulse 1s infinite' : 'none' }"
    @click="manualSync"
  />
  <button v-else class="chip" :class="store.phase" :title="title" @click="manualSync">
    <span class="dot" :style="{ background: color, animation: store.phase === 'syncing' ? 'sc-pulse 1s infinite' : 'none' }" />
    <span class="txt">{{ label }}</span>
    <span v-if="meta" class="meta">{{ meta }}</span>
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
  color: var(--muted);
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 auto;
}
.txt {
  font-weight: 600;
}
.meta {
  font-size: 11px;
  opacity: 0.7;
}
.chip.error {
  color: #b91c1c;
  border-color: #fca5a5;
}
.chip.ok,
.chip.uptodate {
  color: #15803d;
}
.chip.syncing {
  color: #1d4ed8;
}
.dot-only {
  width: 9px;
  height: 9px;
  padding: 0;
  border: none;
  border-radius: 50%;
  cursor: pointer;
}
@keyframes sc-pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
  100% {
    opacity: 1;
  }
}
</style>
