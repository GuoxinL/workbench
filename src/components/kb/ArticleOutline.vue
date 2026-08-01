<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ content: string; activeId?: string }>()
const emit = defineEmits<{ jump: [headingId: string] }>()

interface Gh {
  level: number
  text: string
  id: string
}

const headings = computed<Gh[]>(() =>
  props.content
    .split('\n')
    .filter((l) => /^#{1,4}\s/.test(l))
    .map((l) => {
      const m = l.match(/^(#{1,4})\s+(.+)/)!
      const text = m[2].trim()
      return {
        level: m[1].length,
        text,
        id: text.toLowerCase().replace(/\s+/g, '-'),
      }
    }),
)
</script>

<template>
  <aside v-if="headings.length" class="outline">
    <div class="label">大纲</div>
    <nav>
      <a
        v-for="h in headings"
        :key="h.id"
        class="item"
        :class="`lv${h.level}`"
        @click.prevent="emit('jump', h.id)"
      >{{ h.text }}</a>
    </nav>
  </aside>
  <aside v-else class="outline empty muted">
    <div class="label">大纲</div>
    <p>暂无标题</p>
  </aside>
</template>

<style scoped>
.outline {
  overflow-y: auto;
  padding: 12px 10px;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}
.label {
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.item {
  display: block;
  padding: 3px 0;
  cursor: pointer;
  border-radius: 4px;
  color: var(--fg);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: background 0.1s;
}
.item:hover { background: var(--bg); }
.item.lv2 { padding-left: 0; font-weight: 600; }
.item.lv3 { padding-left: 12px; }
.item.lv4 { padding-left: 24px; }
.empty p { font-size: 12px; }
.muted { color: var(--muted); }
</style>
