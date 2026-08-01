<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'

const store = useDataStore()
const router = useRouter()

interface GNode {
  id: string
  title: string
  x: number
  y: number
  r: number
  color: string
  tag?: boolean
}
interface GLink {
  source: GNode
  target: GNode
}

const nodes = ref<GNode[]>([])
const links = ref<GLink[]>([])
const transform = reactive({ x: 40, y: 40, k: 1 })
const svgRef = ref<SVGSVGElement | null>(null)

const palette = ['#3b82f6', '#ef4444', '#f59e0b', '#22c55e', '#a855f7', '#14b8a6', '#ec4899', '#64748b']
function hashColor(s: string): string {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return palette[h % palette.length]
}

const hasNodes = computed(() => nodes.value.length > 0)

// 按标签聚合文章
interface TagBubble { tag: string; ids: string[]; maxUpdatedAt: number }
const tagBubbles = computed<TagBubble[]>(() => {
  const map = new Map<string, { ids: Set<string>; maxUpdatedAt: number }>()
  for (const a of store.articles) {
    if (a.deleted) continue
    for (const t of a.tags) {
      const entry = map.get(t) ?? { ids: new Set(), maxUpdatedAt: 0 }
      entry.ids.add(a.id)
      if (a.updatedAt > entry.maxUpdatedAt) entry.maxUpdatedAt = a.updatedAt
      map.set(t, entry)
    }
  }
  return [...map.entries()]
    .map(([tag, v]) => ({ tag, ids: [...v.ids], maxUpdatedAt: v.maxUpdatedAt }))
    .sort((a, b) => b.ids.length - a.ids.length)
})

const expanded = ref<Set<string>>(new Set())
function isExpanded(id: string) { return expanded.value.has(id) }

function layout() {
  const ns: GNode[] = []
  const ls: { source: string; target: string }[] = []

  // 标签气泡
  const bubbles = tagBubbles.value
  for (const b of bubbles) {
    const radius = Math.max(28, Math.min(60, 20 + b.ids.length * 4))
    ns.push({
      id: b.tag,
      title: b.tag,
      x: 250 + Math.random() * 40 - 20,
      y: 250 + Math.random() * 40 - 20,
      r: radius,
      color: hashColor(b.tag),
      tag: true,
    })
  }

  // 展开的文章节点
  for (const b of bubbles) {
    if (!expanded.value.has(b.tag)) continue
    const allArts = store.articles.filter((a) => !a.deleted)
    for (const aid of b.ids) {
      const a = allArts.find((x) => x.id === aid)
      if (!a || a.deleted) { console.warn('[graph] article not found for:', aid, b.tag); continue }
      ns.push({
        id: a.id,
        title: a.title,
        x: 250 + Math.random() * 150 - 75,
        y: 250 + Math.random() * 150 - 75,
        r: 12,
        color: hashColor(a.id),
      })
    }
  }

  // 展开文章之间的引用连线
  const artSet = new Set(store.articles.filter((a) => !a.deleted).map((a) => a.id))
  for (const b of bubbles) {
    if (!expanded.value.has(b.tag)) continue
    for (const aid of b.ids) {
      const a = store.articles.find((x) => x.id === aid)
      if (!a || a.deleted) continue
      const re = /\[\[([^\|\]]+)(?:\|([^\]]+))?\]\]/g
      let m: RegExpExecArray | null
      while ((m = re.exec(a.content)) !== null) {
        const refTitle = m[1].trim().toLowerCase().replace(/\s+/g, ' ')
        const target = store.articles.find((x) => !x.deleted && x.title.toLowerCase().replace(/\s+/g, ' ') === refTitle)
        if (target && target.id !== a.id && artSet.has(target.id)) {
          ls.push({ source: a.id, target: target.id })
        }
      }
    }
  }

  if (ns.length === 0) {
    nodes.value = []
    links.value = []
    return
  }

  const sim = forceSimulation(ns as any)
    .force('charge', forceManyBody().strength((d: any) => d.tag ? -400 : -200))
    .force('link', forceLink(ls as any).id((d: any) => d.id).distance(80).strength(0.4))
    .force('center', forceCenter(250, 250))
    .force('collide', forceCollide((d: any) => (d.tag ? d.r + 8 : 18)))
    .stop()

  for (let i = 0; i < 300; i++) sim.tick()
  nodes.value = ns
  links.value = ls as any
}

function toggleTag(tag: string) {
  const next = new Set(expanded.value)
  if (next.has(tag)) next.delete(tag)
  else next.add(tag)
  expanded.value = next
  layout()
}

function collapseAll() {
  expanded.value = new Set()
  layout()
}

function openNode(id: string) {
  const n = nodes.value.find((x) => x.id === id)
  if (n?.tag) {
    toggleTag(id)
  } else {
    router.push({ name: 'articles', params: { id } })
  }
}

// ── 拖拽 + 缩放 ──
let dragId: string | null = null
function toUser(e: PointerEvent) {
  const rect = svgRef.value!.getBoundingClientRect()
  return { x: (e.clientX - rect.left - transform.x) / transform.k, y: (e.clientY - rect.top - transform.y) / transform.k }
}
function onNodeDown(e: PointerEvent, id: string) {
  dragId = id
  ;(e.target as Element).setPointerCapture?.(e.pointerId)
}
function onMove(e: PointerEvent) {
  if (!dragId) return
  const p = toUser(e)
  const n = nodes.value.find((x) => x.id === dragId)
  if (n) { n.x = p.x; n.y = p.y }
}
function onUp() { dragId = null }
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const factor = e.deltaY < 0 ? 1.1 : 0.9
  const rect = svgRef.value!.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const newK = Math.min(3, Math.max(0.3, transform.k * factor))
  transform.x = mx - ((mx - transform.x) * newK) / transform.k
  transform.y = my - ((my - transform.y) * newK) / transform.k
  transform.k = newK
}

onMounted(layout)
</script>

<template>
  <div class="graph-wrap">
    <div class="graph-toolbar">
      <button class="btn" @click="collapseAll">收起全部</button>
      <button class="btn" @click="layout">重新布局</button>
      <span v-if="expanded.size" class="muted">已展开 {{ expanded.size }} 个标签</span>
      <span v-else class="muted">点击气泡展开</span>
    </div>
    <p v-if="!hasNodes" class="empty muted">还没有文章，添加标签后即可查看</p>
    <svg v-else ref="svgRef" class="canvas" viewBox="0 0 500 500"
      @pointermove="onMove" @pointerup="onUp" @pointerleave="onUp" @wheel="onWheel">
      <g :transform="`translate(${transform.x},${transform.y}) scale(${transform.k})`">
        <line v-for="(l, i) in links" :key="'l' + i" :x1="l.source.x" :y1="l.source.y" :x2="l.target.x" :y2="l.target.y" class="edge" />
        <g v-for="n in nodes" :key="n.id"
          :transform="`translate(${n.x},${n.y})`"
          class="node" :class="{ tag: n.tag, expanded: n.tag && isExpanded(n.id) }"
          @pointerdown="onNodeDown($event, n.id)"
          @click.prevent="openNode(n.id)">
          <circle :r="n.r" :fill="n.color" :opacity="n.tag && !isExpanded(n.id) ? 0.85 : 1" />
          <template v-if="n.tag">
            <text v-if="!isExpanded(n.id)" y="2" text-anchor="middle" class="tag-label">{{ n.title }}</text>
            <text v-else y="-14" text-anchor="middle" class="tag-label small">{{ n.title }}</text>
          </template>
          <text v-else :y="n.r + 12" text-anchor="middle" class="label">{{ n.title }}</text>
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.graph-wrap { height: calc(100vh - 110px); display: flex; flex-direction: column; }
.graph-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.btn { padding: 6px 14px; border: 1px solid var(--line); border-radius: 7px; background: #fff; cursor: pointer; }
.canvas { flex: 1; width: 100%; border: 1px solid var(--line); border-radius: 10px; background: #fff; touch-action: none; }
.edge { stroke: #cbd5e1; stroke-width: 1.5; }
.node { cursor: pointer; }
.node circle { stroke: #fff; stroke-width: 2; transition: r 0.3s; }
.node.tag circle { stroke-width: 3; }
.node.expanded circle { opacity: 0.6; stroke-dasharray: 4 2; }
.tag-label { font-size: 14px; fill: #fff; font-weight: 600; pointer-events: none; text-shadow: 0 1px 2px rgba(0,0,0,0.3); }
.tag-label.small { font-size: 11px; fill: #666; font-weight: 600; text-shadow: none; }
.label { font-size: 11px; fill: var(--fg); pointer-events: none; }
.empty { flex: 1; display: flex; align-items: center; justify-content: center; }
.muted { color: var(--muted); font-size: 13px; }
</style>
