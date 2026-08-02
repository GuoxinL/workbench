import { ref } from 'vue'

/** 弹窗字段定义（用于 openForm / openTableDialog 之外的通用表单） */
export interface DialogField {
  key: string
  label: string
  default?: string
  placeholder?: string
  type?: 'text' | 'number' | 'password'
  min?: number
  max?: number
}

/** 弹窗负载（不含 resolve） */
export type DialogPayload =
  | {
      kind: 'form'
      title: string
      fields: DialogField[]
      confirmText?: string
    }
  | {
      kind: 'confirm'
      title: string
      message: string
      confirmText?: string
      danger?: boolean
    }

/** 弹窗完整配置（含 resolve 回调，供 DialogHost 调用） */
export type DialogConfig = DialogPayload & { resolve: (r: any) => void }

const current = ref<DialogConfig | null>(null)

function open(payload: DialogPayload): Promise<any> {
  return new Promise((resolve) => {
    current.value = { ...payload, resolve } as DialogConfig
  })
}

/** 单/多字段输入弹窗，返回字段值对象；取消返回 null */
export function openForm(title: string, fields: DialogField[], confirmText = '确定') {
  return open({ kind: 'form', title, fields, confirmText })
}

/** 单字段输入（替代原生 prompt） */
export function openPrompt(opts: {
  title: string
  label?: string
  default?: string
  placeholder?: string
  confirmText?: string
}) {
  return open({
    kind: 'form',
    title: opts.title,
    confirmText: opts.confirmText || '确定',
    fields: [
      {
        key: 'v',
        label: opts.label || '',
        default: opts.default || '',
        placeholder: opts.placeholder,
        type: 'text' as const,
      },
    ],
  }).then((r: Record<string, string> | null) => r?.v ?? null)
}

/** 确认弹窗（替代原生 confirm） */
export function openConfirm(opts: {
  title: string
  message: string
  confirmText?: string
  danger?: boolean
}) {
  return open({
    kind: 'confirm',
    title: opts.title,
    message: opts.message,
    confirmText: opts.confirmText || '确定',
    danger: opts.danger,
  }) as Promise<boolean>
}

/** 表格插入弹窗：行/列数字步进器 + 预览，返回 {rows, cols} 或 null */
export function openTableDialog() {
  return open({
    kind: 'form',
    title: '插入表格',
    confirmText: '插入',
    fields: [
      { key: 'rows', label: '行数', default: '3', type: 'number', min: 1, max: 20 },
      { key: 'cols', label: '列数', default: '3', type: 'number', min: 1, max: 20 },
    ],
  }).then((r: Record<string, string> | null) =>
    r ? { rows: Number(r.rows) || 3, cols: Number(r.cols) || 3 } : null,
  )
}

export function useDialog() {
  return { current }
}
