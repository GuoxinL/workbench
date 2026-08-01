<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { buildGraph } from '@/lib/links'

const store = useDataStore()
const router = useRouter()

interface GNode {
  id: string
  title: string
  x: number
  y: number
  r: number
  color: string
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
function hashColor(id: string): string {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return palette[h % palette.length]
}

const hasLinks = computed(() => links.value.length > 0)

function layout() {
  const arts = store.articles.filter((n) => !n.deleted)
  const ns: GNode[] = arts.map((a) => ({
    id: a.id,
    title: a.title,
    x: 200 + Math.random() * 200,
    y: 200 + Math.random() * 200,
    r: 14,
    color: hashColor(a.id),
  }))
  const g = buildGraph(store.articles)
  const ls: { source: string; target: string }[] = []
  for (const [srcId, targetIds] of g.out) {
    for (const tgtId of targetIds) {
      if (srcId !== tgtId) ls.push({ source: srcId, target: tgtId })
    }
  }
  const sim = forceSimulation(ns as any)
    .force('charge', forceManyBody().strength(-240))
    .force('link', forceLink(ls as any).id((d: any) => d.id).distance(90).strength(0.5))
    .force('center', forceCenter(250, 250))
    .force('collide', forceCollide(30))
    .stop()
  // G1：260 帧模拟
  for (let i = 0; i < 260; i++) sim.tick()
  nodes.value = ns
  // d3 已把 link.source/target 由字符串解析为节点对象
  links.value = ls as any
}

function reLayout() {
  layout()
}

// ── 拖拽（G3）+ 缩放（G4），手写指针事件 ──
let dragId: string | null = null
function toUser(e: PointerEvent) {
  const rect = svgRef.value!.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left - transform.x) / transform.k,
    y: (e.clientY - rect.top - transform.y) / transform.k,
  }
}
function onNodeDown(e: PointerEvent, id: string) {
  dragId = id
  ;(e.target as Element).setPointerCapture?.(e.pointerId)
}
function onMove(e: PointerEvent) {
  if (!dragId) return
  const p = toUser(e)
  const n = nodes.value.find((x) => x.id === dragId)
  if (n) {
    n.x = p.x
    n.y = p.y
  }
}
function onUp() {
  dragId = null
}
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const factor = e.deltaY < 0 ? 1.1 : 0.9
  const rect = svgRef.value!.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const newK = Math.min(3, Math.max(0.3, transform.k * factor))
  // 以指针为中心缩放
  transform.x = mx - ((mx - transform.x) * newK) / transform.k
  transform.y = my - ((my - transform.y) * newK) / transform.k
  transform.k = newK
}

function openNode(id: string) {
  router.push({ name: 'articles', params: { id } })
}

onMounted(layout)
</script>

<template>
  <div class="graph-wrap">
    <div class="graph-toolbar">
      <button class="btn" @click="reLayout">重新布局</button>
      <span class="muted">滚轮缩放 · 拖拽节点</span>
    </div>
    <p v-if="!hasLinks" class="empty muted">还没有文章之间的引用关系</p>
    <svg
      v-else
      ref="svgRef"
      class="canvas"
      viewBox="0 0 500 500"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointerleave="onUp"
      @wheel="onWheel"
    >
      <g :transform="`translate(${transform.x},${transform.y}) scale(${transform.k})`">
        <line
          v-for="(l, i) in links"
          :key="'l' + i"
          :x1="l.source.x"
          :y1="l.source.y"
          :x2="l.target.x"
          :y2="l.target.y"
          class="edge"
        />
        <g
          v-for="n in nodes"
          :key="n.id"
          :transform="`translate(${n.x},${n.y})`"
          class="node"
          @pointerdown="onNodeDown($event, n.id)"
          @click="openNode(n.id)"
        >
          <circle :r="n.r" :fill="n.color" />
          <text :y="n.r + 12" text-anchor="middle" class="label">{{ n.title }}</text>
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.graph-wrap {
  height: calc(100vh - 110px);
  display: flex;
  flex-direction: column;
}
.graph-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.btn {
  padding: 6px 14px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  cursor: pointer;
}
.canvas {
  flex: 1;
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
  touch-action: none;
}
.edge {
  stroke: #cbd5e1;
  stroke-width: 1.5;
}
.node {
  cursor: pointer;
}
.node circle {
  stroke: #fff;
  stroke-width: 2;
}
.label {
  font-size: 11px;
  fill: var(--fg);
  pointer-events: none;
}
.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.muted {
  color: var(--muted);
  font-size: 13px;
}
</style>
