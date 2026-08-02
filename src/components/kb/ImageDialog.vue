<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Editor } from '@milkdown/kit/core'
import { compressImage } from '@/lib/image'
import { insertImage } from './editorCommands'

const props = defineProps<{ editor: Editor | null }>()
const emit = defineEmits<{ close: [] }>()

const url = ref('')
const busy = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

/** 通用：压缩 src 后插入 image 节点 */
async function insertCompressed(blob: Blob, fallbackSrc?: string) {
  if (!props.editor) return
  try {
    const dataUri = await compressImage(blob)
    insertImage(props.editor, dataUri, '')
  } catch {
    if (fallbackSrc) {
      insertImage(props.editor, fallbackSrc, '')
    }
  }
  emit('close')
}

/** URL 确认：fetch → blob → 压缩 → 插入；CORS 失败降级用原 URL */
async function onConfirmUrl() {
  const u = url.value.trim()
  if (!u || !props.editor) return
  busy.value = true
  try {
    const res = await fetch(u)
    if (!res.ok) throw new Error('fetch failed')
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) throw new Error('not image')
    await insertCompressed(blob, u)
    ElMessage.success('图片已下载并压缩')
  } catch {
    // CORS 或下载失败：降级用原 URL
    insertImage(props.editor, u, '')
    ElMessage.warning('无法下载压缩，已用原址插入')
    emit('close')
  } finally {
    busy.value = false
  }
}

/** 文件选择 → 压缩 → 插入 */
async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !props.editor) return
  busy.value = true
  try {
    const dataUri = await compressImage(file)
    insertImage(props.editor, dataUri, '')
    ElMessage.success('图片已压缩插入')
  } catch {
    ElMessage.error('图片压缩失败')
  } finally {
    busy.value = false
    emit('close')
  }
}

// 打开时聚焦
const urlRef = ref<any>(null)
watch(urlRef, (el) => el?.focus?.())
</script>

<template>
  <el-dialog :model-value="true" title="插入图片" width="460px" align-center :close-on-click-modal="false" @close="emit('close')">
    <div class="img-dialog">
      <el-input
        ref="urlRef"
        v-model="url"
        placeholder="粘贴图片 URL（将下载并压缩为 webp）"
        :disabled="busy"
        @keydown.enter="onConfirmUrl"
      >
        <template #prepend>URL</template>
      </el-input>

      <div class="divider">
        <span class="divider-line" />
        <span class="divider-text">或</span>
        <span class="divider-line" />
      </div>

      <button class="file-btn" :disabled="busy" @click="fileInput?.click()">
        <span class="file-icon">···</span>
        <span>{{ busy ? '处理中…' : '从本地选择（PC 文件夹 / 手机相册）' }}</span>
      </button>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        class="file-hidden"
        @change="onFileChange"
      />
    </div>

    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" :disabled="!url.trim() || busy" :loading="busy" @click="onConfirmUrl">插入</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.img-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.divider {
  display: flex;
  align-items: center;
  gap: 10px;
}
.divider-line {
  flex: 1;
  height: 1px;
  background: var(--line);
}
.divider-text {
  font-size: 12px;
  color: var(--muted);
}
.file-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 16px;
  border: 1px dashed var(--line);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--fg);
  cursor: pointer;
  font-size: 14px;
  transition: border-color 0.15s, background 0.15s;
}
.file-btn:hover:not(:disabled) {
  border-color: var(--brand);
  background: var(--brand-weak);
}
.file-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.file-icon {
  font-weight: 700;
  font-size: 18px;
  color: var(--brand);
}
.file-hidden {
  display: none;
}
</style>
