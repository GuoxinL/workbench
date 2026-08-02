<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Config } from '@/types'
import { useDataStore } from '@/stores/data'
import { runDiagnose, defaultPublicRepo, type DiagStep } from '@/services/github/diagnose'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
const store = useDataStore()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const cfg = ref<Config>(store.getConfig())
// 打开时：若 publicRepo 为空，默认填 <owner>/workbench-public
watch(visible, (v) => {
  if (v) {
    cfg.value = store.getConfig()
    if (!cfg.value.publicRepo) cfg.value.publicRepo = defaultPublicRepo(cfg.value)
  }
})

const steps = ref<DiagStep[]>([])
const diagRunning = ref(false)

const repoValid = computed(() => /^[^/\s]+\/[^/\s]+$/.test(cfg.value.repo))
const canSave = computed(() => cfg.value.enabled && repoValid.value && !!cfg.value.token)

/** 测试连接（融合私有库 + 公开库诊断）：跑完整诊断并显示单一步骤列表 */
async function test() {
  diagRunning.value = true
  steps.value = []
  try {
    steps.value = await runDiagnose(cfg.value)
    const ok = steps.value.length && steps.value.every((s) => s.ok)
    if (ok) ElMessage.success('诊断全部通过')
  } finally {
    diagRunning.value = false
  }
}

function save() {
  if (cfg.value.enabled && !canSave.value) {
    ElMessage.error('请填写正确的 owner/repo 与令牌')
    return
  }
  // 钳制轮询间隔 5–300s（S4）
  cfg.value.poll = Math.min(300, Math.max(5, Number(cfg.value.poll) || 20))
  // publicRepo 为空时存默认值
  if (!cfg.value.publicRepo) cfg.value.publicRepo = defaultPublicRepo(cfg.value)
  store.saveConfig({ ...cfg.value })
  ElMessage.success('已保存，正在同步…')
  visible.value = false
}

function exportBackup() {
  store.exportBackup()
}
</script>

<template>
  <el-drawer v-model="visible" title="设置 · GitHub 同步" size="440px">
    <div class="form">
      <label class="field">
        <span>启用同步</span>
        <el-switch v-model="cfg.enabled" />
      </label>

      <label class="field">
        <span>仓库 owner/repo</span>
        <el-input v-model="cfg.repo" placeholder="GuoxinL/workbench-data" :class="{ err: cfg.enabled && !repoValid }" />
      </label>
      <label class="field">
        <span>公开镜像仓库 owner/repo（只读分享用）</span>
        <el-input v-model="cfg.publicRepo" placeholder="GuoxinL/workbench-public（需先在 GitHub 建公开空仓库）" />
      </label>
      <label class="field">
        <span>分支</span>
        <el-input v-model="cfg.branch" placeholder="main" />
      </label>
      <label class="field">
        <span>Personal Access Token</span>
        <el-input v-model="cfg.token" type="password" show-password placeholder="ghp_…（仅存本地，不落库）" />
      </label>
      <label class="field">
        <span>同步间隔（秒，5–300）</span>
        <el-input-number v-model="cfg.poll" :min="5" :max="300" />
      </label>
      <label class="field">
        <span>API 代理基址</span>
        <el-input v-model="cfg.apiBase" placeholder="https://api.github.com" />
      </label>

      <p class="hint">令牌仅保存在本地 localStorage，绝不写入数据文件或日志。</p>

      <div class="actions">
        <el-button :loading="diagRunning" @click="test">测试连接</el-button>
        <el-button @click="exportBackup">导出备份</el-button>
      </div>

      <ul v-if="steps.length" class="diag">
        <li class="diag-title">诊断 · {{ cfg.repo }}{{ cfg.publicRepo ? ' + ' + cfg.publicRepo : '' }}</li>
        <li v-for="s in steps" :key="s.name" :class="{ ok: s.ok, fail: !s.ok }">
          <span class="mark">{{ s.ok ? '✓' : '✗' }}</span>
          <b>{{ s.name }}</b> —— {{ s.detail }}
        </li>
      </ul>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" :disabled="cfg.enabled && !canSave" @click="save">保存</el-button>
    </template>
  </el-drawer>
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
.field > span {
  font-size: 13px;
  color: var(--muted);
}
.hint {
  font-size: 12px;
  color: var(--muted);
  margin: 0;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.diag {
  list-style: none;
  padding: 10px 0 0;
  margin: 0;
}
.diag li {
  font-size: 13px;
  padding: 4px 0;
}
.diag .diag-title {
  font-weight: 700;
  color: var(--brand);
  font-size: 12px;
  padding-bottom: 2px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 4px;
}
.diag .ok {
  color: #15803d;
}
.diag .fail {
  color: #b91c1c;
}
.mark {
  font-weight: 700;
  margin-right: 4px;
}
:deep(.el-input.err .el-input__wrapper) {
  box-shadow: 0 0 0 1px #ef4444 inset;
}
</style>
