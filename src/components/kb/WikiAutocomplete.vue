<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDataStore } from '@/stores/data'

const props = defineProps<{
  textarea: HTMLTextAreaElement | null
  modelValue: string
  excludeId: string
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()
const store = useDataStore()

const open = ref(false)
type AcItem = { type: 'exist' | 'new'; id?: string; title: string }
const items = ref<AcItem[]>([])
const sel = ref(0)
const pos = ref({ left: 0, top: 0 })

function detect() {
  const ta = props.textarea
  if (!ta) return close()
  const p = ta.selectionStart
  const before = ta.value.slice(0, p)
  const m = before.match(/\[\[([^[\]]*)$/)
  if (!m) return close()
  const query = m[1]
  const q = query.trim().toLowerCase()
  const arts = store.articles
    .filter((n) => !n.deleted && n.id !== props.excludeId)
    .filter((n) => !q || n.title.toLowerCase().includes(q))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8)
  const list: AcItem[] = arts.map((n) => ({ type: 'exist', id: n.id, title: n.title }))
  // A3：输入的标题不存在时追加「＋ 新建」选项
  if (query.trim() && !arts.some((n) => n.title.toLowerCase() === query.trim().toLowerCase())) {
    list.push({ type: 'new', title: query.trim() })
  }
  if (!list.length) return close()
  items.value = list
  sel.value = 0
  open.value = true
  position(ta, p)
}

function close() {
  open.value = false
  items.value = []
}

// A5：镜像 div 测算光标像素坐标
const MIRROR_PROPS = [
  'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontSize', 'lineHeight',
  'fontFamily', 'letterSpacing', 'textTransform', 'wordSpacing', 'textIndent',
]
let mirror: HTMLDivElement | null = null
function position(ta: HTMLTextAreaElement, caret: number) {
  if (!mirror) {
    mirror = document.createElement('div')
    document.body.appendChild(mirror)
  }
  const cs = getComputedStyle(ta)
  mirror.id = '__wb-mirror'
  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.wordWrap = 'break-word'
  mirror.style.top = '0'
  mirror.style.left = '-9999px'
  MIRROR_PROPS.forEach((p) => ((mirror as any).style as any)[p] = (cs as any)[p])
  const rect = ta.getBoundingClientRect()
  mirror.style.width = `${rect.width}px`
  mirror.textContent = ta.value.slice(0, caret)
  const mark = document.createElement('span')
  mark.textContent = ta.value.slice(caret) || '.'
  mirror.appendChild(mark)
  const top = rect.top - ta.scrollTop + mark.offsetTop - 4
  const left = rect.left - ta.scrollLeft + mark.offsetLeft
  pos.value = { left, top }
}

function move(dir: number) {
  if (!items.value.length) return
  sel.value = (sel.value + dir + items.value.length) % items.value.length
}

async function apply(item: { type: 'exist' | 'new'; id?: string; title: string }) {
  const ta = props.textarea
  if (!ta) return
  const p = ta.selectionStart
  const before = ta.value.slice(0, p)
  const after = ta.value.slice(p)
  const mm = before.match(/\[\[([^[\]]*)$/)
  if (!mm) return
  // A6：光标后已有 ]] 则不重复插入
  const tail = after.startsWith(']]') ? '' : ']]'
  const inserted = `[[${item.title}${tail}`
  const newBefore = before.slice(0, mm.index) + inserted
  const newContent = newBefore + after
  const newCaret = newBefore.length
  close()
  emit('update:modelValue', newContent)
  await nextTick()
  ta.focus()
  ta.setSelectionRange(newCaret, newCaret)
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    move(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    move(-1)
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    apply(items.value[sel.value])
  } else if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}

function onInput() {
  detect()
}

onMounted(() => {
  const ta = props.textarea
  if (!ta) return
  ta.addEventListener('input', onInput)
  ta.addEventListener('keydown', onKeydown)
  ta.addEventListener('blur', () => setTimeout(close, 120))
  ta.addEventListener('scroll', close)
})
onBeforeUnmount(() => {
  const ta = props.textarea
  if (ta) {
    ta.removeEventListener('input', onInput)
    ta.removeEventListener('keydown', onKeydown)
  }
  if (mirror) mirror.remove()
})

watch(
  () => props.textarea,
  (ta, old) => {
    if (old) {
      old.removeEventListener('input', onInput)
      old.removeEventListener('keydown', onKeydown)
    }
    if (ta) {
      ta.addEventListener('input', onInput)
      ta.addEventListener('keydown', onKeydown)
      ta.addEventListener('blur', () => setTimeout(close, 120))
      ta.addEventListener('scroll', close)
    }
  },
)

const stylePos = computed(() => ({ left: `${pos.value.left}px`, top: `${pos.value.top}px` }))
</script>

<template>
  <div v-if="open" class="ac" :style="stylePos">
    <div
      v-for="(it, i) in items"
      :key="it.type + it.title"
      class="ac-item"
      :class="{ on: i === sel }"
      @mousedown.prevent="apply(it)"
      @mouseenter="sel = i"
    >
      <template v-if="it.type === 'new'">＋ 新建「{{ it.title }}」</template>
      <template v-else>{{ it.title }}</template>
    </div>
  </div>
</template>

<style scoped>
.ac {
  position: fixed;
  z-index: 1000;
  background: var(--card-bg);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  max-height: 220px;
  overflow-y: auto;
  min-width: 180px;
  font-size: 13px;
}
.ac-item {
  padding: 7px 12px;
  cursor: pointer;
  white-space: nowrap;
}
.ac-item.on {
  background: var(--brand-weak);
}
</style>
