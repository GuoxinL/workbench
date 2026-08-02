import { ref } from 'vue'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'wb.theme'
const theme = ref<Theme>('light')
let inited = false

function apply(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark')
}

/** 初始化主题：localStorage 优先，无则跟随系统 prefers-color-scheme。仅在客户端执行。 */
function init() {
  if (inited) return
  inited = true
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
  if (stored === 'light' || stored === 'dark') {
    theme.value = stored
  } else if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    theme.value = 'dark'
  }
  apply(theme.value)
}

export function useTheme() {
  init()
  const isDark = ref(theme.value === 'dark')
  const toggle = () => {
    const next: Theme = theme.value === 'dark' ? 'light' : 'dark'
    theme.value = next
    isDark.value = next === 'dark'
    localStorage.setItem(STORAGE_KEY, next)
    apply(next)
  }
  return { isDark, toggle }
}
