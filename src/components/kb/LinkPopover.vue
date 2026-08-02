<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export type LinkKind = 'wikilink' | 'anchor' | 'external'

const props = defineProps<{
  x: number
  y: number
  kind: LinkKind
  title?: string
  slug?: string
  href?: string
  missing?: boolean
}>()
const emit = defineEmits<{ action: []; close: [] }>()

const visible = ref(true)

const label = computed(() => {
  if (props.kind === 'wikilink') {
    return props.missing ? `➕ 创建文章：「${props.title}」` : `📖 打开文章：「${props.title}」`
  }
  if (props.kind === 'anchor') return `⇣ 跳到：${props.slug}`
  return `↗ 在新窗口打开`
})
const sub = computed(() => (props.kind === 'external' ? props.href : ''))

function onOverlayClick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('.link-pop')) return
  close()
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}
function close() {
  visible.value = false
  emit('close')
}
onMounted(() => {
  document.addEventListener('click', onOverlayClick, true)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onOverlayClick, true)
  document.removeEventListener('keydown', onKeydown)
})

function doAction() {
  emit('action')
  close()
}

const style = computed(() => {
  const w = Math.min(320, window.innerWidth - 24)
  return {
    left: Math.min(props.x, window.innerWidth - w - 12) + 'px',
    top: Math.min(props.y + 8, window.innerHeight - 80) + 'px',
    maxWidth: w + 'px',
  }
})
</script>

<template>
  <div v-if="visible" class="link-pop" :style="style" @click.stop>
    <button class="action" @click="doAction">
      <span class="action-label">{{ label }}</span>
      <span v-if="sub" class="action-sub">{{ sub }}</span>
    </button>
  </div>
</template>

<style scoped>
.link-pop {
  position: fixed;
  z-index: 9999;
  min-width: 200px;
  max-width: 320px;
  background: var(--card-bg);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  padding: 6px;
}
.action {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  color: var(--fg);
  font-size: 13px;
  transition: background 0.15s;
}
.action:hover {
  background: var(--brand-weak);
}
.action-label {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.action-sub {
  font-size: 11px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
