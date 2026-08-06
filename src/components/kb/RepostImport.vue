<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useDataStore } from '@/stores/data'
import { convertWebpage } from '@/services/import/webRepost'

const emit = defineEmits<{ imported: [string] }>()
const store = useDataStore()

const visible = ref(false)
const url = ref('')
const html = ref('')
const loading = ref(false)

async function onConvert() {
  const u = url.value.trim()
  const h = html.value.trim()
  if (!u && !h) {
    ElMessage.warning('请填写网页 URL（原链接）或粘贴网页内容')
    return
  }
  loading.value = true
  try {
    const r = convertWebpage({ url: u || undefined, html: h || undefined })
    const a = store.addArticle(r.title)
    // 预填正文与来源字段；sourceAuthorized 留空，由用户在编辑器中手动勾选授权闸门
    store.updateArticle(a.id, {
      content: r.content,
      sourceAuthor: r.sourceAuthor,
      sourceUrl: r.sourceUrl,
      sourceSite: r.sourceSite,
      sourcePublishedAt: r.sourcePublishedAt,
    })
    ElMessage.success('已导入，请在编辑器中确认授权后保存')
    emit('imported', a.id)
    visible.value = false
    url.value = ''
    html.value = ''
  } catch (e) {
    ElMessage.error('转换失败：' + (e instanceof Error ? e.message : String(e)))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <span class="repost-import">
    <el-button size="small" @click="visible = true">转载导入</el-button>
    <el-dialog v-model="visible" title="转载导入" width="580px" append-to-body>
      <p class="muted tip">
        粘贴想转载的网页内容（或填 URL 作为原链接占位），工作台会转换为文章格式并自动记录原作者/原链接等来源信息。
      </p>
      <label class="lbl">网页 URL（原链接，可选填）</label>
      <el-input v-model="url" placeholder="https://example.com/article" />
      <label class="lbl">网页内容（粘贴 HTML 或正文）</label>
      <el-input v-model="html" type="textarea" :rows="9" placeholder="在此粘贴网页内容…" />
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="loading" @click="onConvert">转换并导入</el-button>
      </template>
    </el-dialog>
  </span>
</template>

<style scoped>
.repost-import {
  display: inline-flex;
}
.tip {
  font-size: 13px;
  margin: 0 0 12px;
  line-height: 1.6;
}
.lbl {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin: 12px 0 6px;
  color: var(--fg);
}
.muted {
  color: var(--muted);
}
</style>
