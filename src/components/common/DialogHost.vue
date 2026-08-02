<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDialog, type DialogField } from '@/composables/useDialog'

const { current } = useDialog()

const visible = ref(false)
const form = ref<Record<string, string>>({})

watch(current, (c) => {
  if (!c) {
    visible.value = false
    return
  }
  if (c.kind === 'form') {
    form.value = Object.fromEntries(c.fields.map((f) => [f.key, f.default ?? '']))
  }
  visible.value = true
})

const isForm = computed(() => current.value?.kind === 'form')
const isConfirm = computed(() => current.value?.kind === 'confirm')
const isTable = computed(
  () => isForm.value && (current.value as any)?.title === '插入表格',
)

const tablePreview = computed(() => {
  if (!isTable.value) return null
  const r = Math.min(5, Math.max(1, Number(form.value.rows) || 3))
  const c = Math.min(5, Math.max(1, Number(form.value.cols) || 3))
  return { rows: r, cols: c, realRows: Number(form.value.rows) || 3, realCols: Number(form.value.cols) || 3 }
})

function onConfirm() {
  const c = current.value
  if (!c) return
  visible.value = false
  if (c.kind === 'form') c.resolve({ ...form.value })
  else c.resolve(true)
  current.value = null
}

function onCancel() {
  const c = current.value
  if (!c) return
  visible.value = false
  if (c.kind === 'form') c.resolve(null)
  else c.resolve(false)
  current.value = null
}

function clampNum(f: DialogField, v: string) {
  let n = Number(v)
  if (!Number.isFinite(n)) n = Number(f.default) || 0
  if (f.min !== undefined) n = Math.max(f.min, n)
  if (f.max !== undefined) n = Math.min(f.max, n)
  form.value[f.key] = String(n)
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="current?.title"
    :width="isTable ? '420px' : '440px'"
    align-center
    :close-on-click-modal="false"
    @close="onCancel"
  >
    <template v-if="current">
      <!-- 表单 / 表格 -->
      <div v-if="isForm" class="form">
        <template v-for="f in (current as any).fields" :key="f.key">
          <label v-if="isTable" class="stepper">
            <span class="stepper-label">{{ f.label }}</span>
            <span class="stepper-ctrl">
              <button type="button" :disabled="Number(form[f.key]) <= (f.min ?? 1)" @click="form[f.key] = String(Math.max(f.min ?? 1, (Number(form[f.key]) || 1) - 1))">−</button>
              <input
                v-model="form[f.key]"
                type="number"
                :min="f.min"
                :max="f.max"
                class="stepper-input"
                @blur="clampNum(f, form[f.key])"
              />
              <button type="button" :disabled="Number(form[f.key]) >= (f.max ?? 99)" @click="form[f.key] = String(Math.min(f.max ?? 99, (Number(form[f.key]) || 1) + 1))">+</button>
            </span>
          </label>
          <label v-else class="field">
            <span class="field-label">{{ f.label }}</span>
            <el-input
              v-model="form[f.key]"
              :type="f.type === 'password' ? 'password' : 'text'"
              :placeholder="f.placeholder"
              :show-password="f.type === 'password'"
            />
          </label>
        </template>

        <!-- 表格预览 -->
        <div v-if="isTable && tablePreview" class="table-preview">
          <div class="preview-grid" :style="{ gridTemplateColumns: 'repeat(' + tablePreview.cols + ', 1fr)' }">
            <span v-for="(_, i) in tablePreview.rows * tablePreview.cols" :key="i" class="cell" :class="{ header: i < tablePreview.cols }"></span>
          </div>
          <p class="preview-text muted">将创建 {{ tablePreview.realRows }} × {{ tablePreview.realCols }} 表格</p>
        </div>
      </div>

      <!-- 确认 -->
      <p v-else-if="isConfirm" class="confirm-msg">{{ (current as any).message }}</p>
    </template>

    <template #footer>
      <el-button @click="onCancel">取消</el-button>
      <el-button
        :type="isConfirm && (current as any).danger ? 'danger' : 'primary'"
        @click="onConfirm"
      >{{ (current as any).confirmText || '确定' }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label {
  font-size: 13px;
  color: var(--muted);
}
.stepper {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.stepper-label {
  font-size: 14px;
  color: var(--fg);
}
.stepper-ctrl {
  display: flex;
  align-items: center;
  gap: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--card-bg);
}
.stepper-ctrl button {
  width: 32px;
  height: 32px;
  border: none;
  background: var(--card-bg);
  color: var(--fg);
  cursor: pointer;
  font-size: 16px;
}
.stepper-ctrl button:hover:not(:disabled) {
  background: var(--brand-weak);
  color: var(--brand);
}
.stepper-ctrl button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.stepper-input {
  width: 48px;
  height: 32px;
  border: none;
  border-left: 1px solid var(--line);
  border-right: 1px solid var(--line);
  text-align: center;
  background: var(--card-bg);
  color: var(--fg);
  font-size: 14px;
  outline: none;
  -moz-appearance: textfield;
}
.stepper-input::-webkit-inner-spin-button,
.stepper-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.table-preview {
  margin-top: 4px;
  padding: 14px;
  background: var(--bg);
  border-radius: var(--radius-sm);
}
.preview-grid {
  display: grid;
  gap: 3px;
  margin-bottom: 8px;
}
.cell {
  height: 22px;
  border-radius: 3px;
  background: var(--card-bg);
  border: 1px solid var(--line);
}
.cell.header {
  background: var(--brand-weak);
  border-color: var(--brand);
}
.preview-text {
  margin: 0;
  text-align: center;
  font-size: 12px;
}
.confirm-msg {
  margin: 0;
  line-height: 1.6;
  color: var(--fg);
}
.muted {
  color: var(--muted);
}
</style>
