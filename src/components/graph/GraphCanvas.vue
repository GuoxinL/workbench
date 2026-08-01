<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'

const store = useDataStore()
const router = useRouter()

interface GNode { id: string; title: string; x: number; y: number; r: number; color: string; tag?: boolean }
interface GLink { source: GNode; target: GNode }

const nodes = shallowRef<GNode[]>([])
const links = shallowRef<GLink[]>([])
const transform = reactive({ x: 40, y: 40, k: 1 })
const svgRef = shallowRef<SVGSVGElement | null>(null)

const hasNodes = computed(() => nodes.value.length > 0)

// ── 标签聚合 ──
const palette = ['#3b82f6', '#ef4444', '#f59e0b', '#22c55e', '#a855f7', '#14b8a6', '#ec4899', '#64748b']
function hc(s: string): string { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return palette[h % palette.length] }
interface Bubble { tag: string; ids: string[] }
const bubbles = computed<Bubble[]>(() => {
  const m = new Map<string, Set<string>>()
  for (const a of store.articles) { if (a.deleted) continue; for (const t of a.tags) { const s = m.get(t) ?? new Set<string>(); s.add(a.id); m.set(t, s) } }
  return [...m.entries()].map(([tag, ids]) => ({ tag, ids: [...ids] })).sort((a, b) => b.ids.length - a.ids.length)
})

// ── 展开状态（reactive，push/splice 触发依赖追踪） ──
const graphState = reactive({ expandedTags: [] as string[] })
function isExpanded(id: string) { return graphState.expandedTags.includes(id) }
function toggle(tag: string) {
  const i = graphState.expandedTags.indexOf(tag)
  i >= 0 ? graphState.expandedTags.splice(i, 1) : graphState.expandedTags.push(tag)
}
function collapseAll() { graphState.expandedTags.length = 0 }

// ── 自动 layout：expandedTags 或 articles 变化时重建 ──
const rawLayout = computed(() => {
  const ns: GNode[] = []; const ls: { source: string; target: string }[] = []
  const arts = store.articles.filter(a => !a.deleted)
  const artSet = new Set(arts.map(a => a.id))
  const exp = new Set(graphState.expandedTags)  // 声明依赖 graphState.expandedTags
  // 标签气泡
  for (const b of bubbles.value) {
    ns.push({ id: b.tag, title: b.tag, x: 250 + Math.random() * 20, y: 250 + Math.random() * 20, r: Math.max(28, Math.min(60, 18 + b.ids.length * 4)), color: hc(b.tag), tag: true })
  }
  // 展开文章
  for (const b of bubbles.value) {
    if (!exp.has(b.tag)) continue
    for (const aid of b.ids) {
      const a = arts.find(x => x.id === aid)
      if (!a) continue
      ns.push({ id: a.id, title: a.title, x: 250 + Math.random() * 100 - 50, y: 250 + Math.random() * 100 - 50, r: 12, color: hc(a.id) })
    }
  }
  // 展开连线
  for (const b of bubbles.value) {
    if (!exp.has(b.tag)) continue
    for (const aid of b.ids) {
      const a = arts.find(x => x.id === aid)
      if (!a) continue
      const re = /\[\[([^\|\]]+)(?:\|([^\]]+))?\]\]/g
      let m: RegExpExecArray | null
      while ((m = re.exec(a.content)) !== null) {
        const rt = m[1].trim().toLowerCase().replace(/\s+/g, ' ')
        const tgt = arts.find(x => x.title.toLowerCase().replace(/\s+/g, ' ') === rt)
        if (tgt && tgt.id !== a.id && artSet.has(tgt.id)) ls.push({ source: a.id, target: tgt.id })
      }
    }
  }
  return { nodes: ns, links: ls }
})

watch(rawLayout, (l) => {
  if (l.nodes.length === 0) { nodes.value = []; links.value = []; return }
  const sim = forceSimulation(l.nodes as any)
    .force('charge', forceManyBody().strength((d: any) => d.tag ? -400 : -200))
    .force('link', forceLink(l.links as any).id((d: any) => d.id).distance(80).strength(0.4))
    .force('center', forceCenter(250, 250))
    .force('collide', forceCollide((d: any) => (d.tag ? d.r + 8 : 18)))
    .stop()
  for (let i = 0; i < 300; i++) sim.tick()
  nodes.value = l.nodes
  links.value = l.links as any
}, { immediate: true })

// ── 交互 ──
function openNode(id: string) {
  const n = nodes.value.find(x => x.id === id)
  if (n?.tag) toggle(id)
  else router.push({ name: 'articles', params: { id } })
}

let dragId: string | null = null
function toUser(e: PointerEvent) { const r = svgRef.value!.getBoundingClientRect(); return { x: (e.clientX - r.left - transform.x) / transform.k, y: (e.clientY - r.top - transform.y) / transform.k } }
function onDown(e: PointerEvent, id: string) { dragId = id; (e.target as Element).setPointerCapture?.(e.pointerId) }
function onMv(e: PointerEvent) { if (!dragId) return; const p = toUser(e); const n = nodes.value.find(x => x.id === dragId); if (n) { n.x = p.x; n.y = p.y } }
function onUp() { dragId = null }
function onWheel(e: WheelEvent) { e.preventDefault(); const f = e.deltaY < 0 ? 1.1 : 0.9; const r = svgRef.value!.getBoundingClientRect(); const mx = e.clientX - r.left; const my = e.clientY - r.top; const nk = Math.min(3, Math.max(0.3, transform.k * f)); transform.x = mx - ((mx - transform.x) * nk) / transform.k; transform.y = my - ((my - transform.y) * nk) / transform.k; transform.k = nk }
</script>

<template>
  <div class="graph-wrap">
    <div class="tlb">
      <button class="btn" @click="collapseAll">收起全部</button>
      <button class="btn" @click="toggle(graphState.expandedTags[0])" v-if="false">重新布局</button>
      <span v-if="graphState.expandedTags.length" class="muted">已展开 {{ graphState.expandedTags.length }} 个标签</span>
      <span v-else class="muted">点击气泡展开</span>
    </div>
    <p v-if="!hasNodes" class="empty muted">还没有文章，添加标签后即可查看</p>
    <svg v-else ref="svgRef" class="canvas" viewBox="0 0 500 500"
      @pointermove="onMv" @pointerup="onUp" @pointerleave="onUp" @wheel="onWheel">
      <g :transform="'translate('+transform.x+','+transform.y+') scale('+transform.k+')'">
        <line v-for="(l,i) in links" :key="'l'+i" :x1="l.source.x" :y1="l.source.y" :x2="l.target.x" :y2="l.target.y" class="edge" />
        <g v-for="n in nodes" :key="n.id" :transform="'translate('+n.x+','+n.y+')'"
          class="node" :class="{tag:n.tag,expanded:n.tag&&isExpanded(n.id)}"
          @pointerdown="onDown($event,n.id)" @click.prevent="openNode(n.id)">
          <circle :r="n.r" :fill="n.color" :opacity="n.tag&&!isExpanded(n.id)?.85:1" />
          <template v-if="n.tag">
            <text v-if="!isExpanded(n.id)" y="2" text-anchor="middle" class="tl">{{ n.title }}</text>
            <text v-else y="-14" text-anchor="middle" class="tl sm">{{ n.title }}</text>
          </template>
          <text v-else :y="n.r+12" text-anchor="middle" class="label">{{ n.title }}</text>
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.graph-wrap{height:calc(100vh - 110px);display:flex;flex-direction:column}
.tlb{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.btn{padding:6px 14px;border:1px solid var(--line);border-radius:7px;background:#fff;cursor:pointer}
.canvas{flex:1;width:100%;border:1px solid var(--line);border-radius:10px;background:#fff;touch-action:none}
.edge{stroke:#cbd5e1;stroke-width:1.5}
.node{cursor:pointer}
.node circle{stroke:#fff;stroke-width:2;transition:r .3s}
.node.tag circle{stroke-width:3}
.node.expanded circle{opacity:.6;stroke-dasharray:4 2}
.tl{font-size:14px;fill:#fff;font-weight:600;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,.3)}
.tl.sm{font-size:11px;fill:#666;font-weight:600;text-shadow:none}
.label{font-size:11px;fill:var(--fg);pointer-events:none}
.empty{flex:1;display:flex;align-items:center;justify-content:center}
.muted{color:var(--muted);font-size:13px}
</style>
