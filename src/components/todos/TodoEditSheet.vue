<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Todo, TodoStatus, ColorKey } from '@/types'
import { useDataStore } from '@/stores/data'
import ColorSelect from './ColorSelect.vue'

const props = defineProps<{ modelValue: boolean; todo: Todo | null }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
const store = useDataStore()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const form = ref<{ title: string; desc: string; color: ColorKey; status: TodoStatus; due: string }>({
  title: '',
  desc: '',
  color: 'blue',
  status: 'todo',
  due: '',
})

const statusOptions = [
  { label: '待办', value: 'todo' },
  { label: '进行中', value: 'doing' },
  { label: '已完成', value: 'done' },
]

const related = computed(() =>
  props.todo?.articleId ? store.articleById(props.todo.articleId) : undefined,
)

// 打开时把当前待办填入表单
watch(
  () => props.todo,
  (t) => {
    if (t) {
      form.value = {
        title: t.title,
        desc: t.desc,
        color: t.color,
        status: t.status,
        due: t.due,
      }
    }
  },
  { immediate: true },
)

function save() {
  if (!props.todo) return
  // T15：标题为空时 toast 报错且不保存
  if (!form.value.title.trim()) {
    ElMessage.error('标题不能为空')
    return
  }
  store.updateTodo(props.todo.id, {
    title: form.value.title.trim(),
    desc: form.value.desc,
    color: form.value.color,
    status: form.value.status,
    due: form.value.due,
  })
  visible.value = false
}

// T10：Cmd/Ctrl + Enter 保存
function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    save()
  }
}
</script>

<template>
  <el-drawer v-model="visible" title="编辑待办" size="420px" :close-on-press-escape="true">
    <div class="form" @keydown="onKeydown">
      <label class="field">
        <span>标题</span>
        <el-input v-model="form.title" placeholder="待办标题" />
      </label>
      <label class="field">
        <span>描述</span>
        <el-input v-model="form.desc" type="textarea" :rows="4" placeholder="补充说明（可选）" />
      </label>
      <div class="field">
        <span>颜色</span>
        <ColorSelect v-model="form.color" />
      </div>
      <div class="field">
        <span>状态</span>
        <el-segmented v-model="form.status" :options="statusOptions" />
      </div>
      <label class="field">
        <span>截止日期</span>
        <el-date-picker
          v-model="form.due"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="无截止"
          clearable
          style="width: 100%"
        />
      </label>
      <div v-if="related" class="field">
        <span>关联文章</span>
        <router-link :to="{ name: 'articles', params: { id: related.id } }" @click="visible = false">
          📝 {{ related.title }}
        </router-link>
      </div>
      <p class="hint">提示：<kbd>Esc</kbd> 关闭，<kbd>⌘/Ctrl + Enter</kbd> 保存</p>
    </div>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="save">保存</el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
</style>
