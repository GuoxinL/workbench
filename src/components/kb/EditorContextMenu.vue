<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export interface MenuAction {
  key: string
  label: string
  shortcut?: string
  markdown?: string // 直接插入的 markdown 文本
  action?: string   // 特殊动作标识
  divider?: boolean
  children?: MenuAction[]
}

const props = defineProps<{ x: number; y: number; actions: MenuAction[] }>()
const emit = defineEmits<{ select: [string, MenuAction]; close: [] }>()

const visible = ref(true)
const activeChild = ref('')

function onItemClick(a: MenuAction) {
  if (a.children) return
  emit('select', a.key, a)
  close()
}

function close() {
  visible.value = false
  emit('close')
}

// 点击菜单内部不关闭（由菜单项 @click 处理）；仅点击外部时关闭。
// 必须判断 target：此 listener 是 capture 阶段，先于菜单项 @click 触发，
// 若不判断会先关菜单导致项点击丢失（真实鼠标点击时序下复现）。
function onOverlayClick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('.ctx-menu')) return
  close()
}
function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape') close() }

onMounted(() => document.addEventListener('click', onOverlayClick, true))
onBeforeUnmount(() => document.removeEventListener('click', onOverlayClick, true))

// 位置随 props 实时计算：菜单已显示时再次右键也能更新位置
const style = computed(() => ({
  left: Math.min(props.x, window.innerWidth - 240) + 'px',
  top: Math.min(props.y, window.innerHeight - 400) + 'px',
}))
</script>

<template>
  <div
    v-if="visible"
    class="ctx-menu"
    :style="style"
    @keydown="onKeydown"
    @click.stop
  >
    <template v-for="a in actions" :key="a.key">
      <div v-if="a.divider" class="divider" />
      <div
        v-else
        class="item"
        :class="{ hasChild: !!a.children }"
        @mousedown.prevent
        @click="onItemClick(a)"
        @mouseenter="a.children && (activeChild = a.key)"
        @mouseleave="activeChild = ''"
      >
        <span class="label">{{ a.label }}</span>
        <span v-if="a.shortcut" class="shortcut">{{ a.shortcut }}</span>
        <span v-if="a.children" class="arrow">▶</span>
        <!-- 子菜单 -->
        <div v-if="a.children && activeChild === a.key" class="submenu">
          <div
            v-for="child in a.children"
            :key="child.key"
            class="item"
            @mousedown.prevent
            @click="onItemClick(child)"
          >
            <span class="label">{{ child.label }}</span>
            <span v-if="child.shortcut" class="shortcut">{{ child.shortcut }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ctx-menu {
  position: fixed;
  z-index: 9999;
  min-width: 200px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.12);
  padding: 6px 0;
  font-size: 13px;
}
.divider {
  height: 1px;
  background: var(--line);
  margin: 4px 8px;
}
.item {
  display: flex;
  align-items: center;
  padding: 6px 14px;
  cursor: pointer;
  position: relative;
  user-select: none;
}
.item:hover {
  background: var(--brand-weak);
}
.label { flex: 1; }
.shortcut {
  color: var(--muted);
  font-size: 11px;
  margin-left: 16px;
}
.arrow {
  margin-left: 8px;
  font-size: 10px;
  color: var(--muted);
}
.submenu {
  position: absolute;
  left: 100%;
  top: 0;
  min-width: 160px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.12);
  padding: 6px 0;
}
</style>
