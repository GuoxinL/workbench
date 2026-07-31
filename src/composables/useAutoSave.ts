import { onUnmounted } from 'vue'

/**
 * 自动保存（对应 N5）：输入后 delay 防抖落盘；失焦/切文章/返回/同步前调用 flushNow 立即保存。
 */
export function useAutoSave(onSave: () => void, delay = 700) {
  let timer: ReturnType<typeof setTimeout> | null = null

  function schedule() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      onSave()
    }, delay)
  }

  function flush() {
    if (timer) {
      clearTimeout(timer)
      timer = null
      onSave()
    }
  }

  onUnmounted(flush)
  return { schedule, flush }
}
