<script setup lang="ts">
import { compressImage } from '@/lib/image'

function view() { return (window as any).__milkdownView }

function insertText(text: string) {
  const v = view()
  if (!v) return
  const tr = v.state.tr.insertText(text)
  v.dispatch(tr)
  v.focus()
}

function wrapText(before: string, after: string) {
  const v = view()
  if (!v) return
  const { from, to, empty } = v.state.selection
  if (!empty) {
    const text = v.state.doc.textBetween(from, to)
    const tr = v.state.tr.replaceWith(from, to, v.state.schema.text(before + text + after))
    v.dispatch(tr)
  } else {
    insertText(before + after)
  }
  v.focus()
}

function insertLine(text: string) {
  const v = view()
  if (!v) return
  const { from } = v.state.selection
  const bol = v.state.doc.resolve(from).start()
  insertText(from === bol ? text : '\n' + text)
}

// 按钮动作
function onBold() { wrapText('**', '**') }
function onItalic() { wrapText('*', '*') }
function onStrike() { wrapText('~~', '~~') }
function onCode() { wrapText('`', '`') }
function onH1() { insertLine('# ') }
function onH2() { insertLine('## ') }
function onH3() { insertLine('### ') }
function onUl() { insertLine('- ') }
function onOl() { insertLine('1. ') }
function onQuote() { insertLine('> ') }
function onCodeBlock() { insertText('\n```\n```\n') }
function onHr() { insertText('\n---\n') }
function onLink() { const u = prompt('链接 URL', 'https://'); if (u) insertText('[' + u + '](' + u + ')') }

async function onImage() {
  const i = document.createElement('input')
  i.type = 'file'; i.accept = 'image/*'
  i.onchange = async () => { const f = i.files?.[0]; if (f) { try { const d = await compressImage(f); insertText('![](' + d + ')') } catch (_) {} } }
  i.click()
}

function onTable() {
  const r = parseInt(prompt('行数', '3') || '3', 10) || 3
  const c = parseInt(prompt('列数', '3') || '3', 10) || 3
  let t = ''
  for (let i = 0; i < r; i++) {
    t += '| ' + Array(c).fill('  ').join(' | ') + ' |\n'
    if (i === 0) t += '| ' + Array(c).fill('---').join(' | ') + ' |\n'
  }
  insertText(t)
}

const btns = [
  { t: 'B', tip: '粗体', fn: onBold },
  { t: 'I', tip: '斜体', fn: onItalic },
  { t: 'S', tip: '删除线', fn: onStrike },
  { t: '`', tip: '行内代码', fn: onCode },
  { t: 'sep' },
  { t: 'H1', tip: '一级标题', fn: onH1 },
  { t: 'H2', tip: '二级标题', fn: onH2 },
  { t: 'H3', tip: '三级标题', fn: onH3 },
  { t: 'sep' },
  { t: '≡', tip: '无序列表', fn: onUl },
  { t: '1.', tip: '有序列表', fn: onOl },
  { t: '❝', tip: '引用', fn: onQuote },
  { t: 'sep' },
  { t: '{}', tip: '代码块', fn: onCodeBlock },
  { t: '⊞', tip: '表格', fn: onTable },
  { t: 'sep' },
  { t: '🔗', tip: '链接', fn: onLink },
  { t: '🖼', tip: '图片', fn: onImage },
  { t: '—', tip: '分割线', fn: onHr },
]
</script>

<template>
  <div class="toolbar">
    <template v-for="b in btns" :key="b.t">
      <span v-if="b.t === 'sep'" class="sep" />
      <button v-else :title="b.tip" @click="b.fn">{{ b.t }}</button>
    </template>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex; align-items: center; gap: 2px; padding: 6px 4px;
  border: 1px solid var(--line); border-radius: 8px; background: var(--bg);
  margin-bottom: 8px; flex-wrap: wrap;
}
.toolbar button {
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; border-radius: 4px; cursor: pointer;
  font-size: 13px; color: var(--fg); transition: background 0.1s;
}
.toolbar button:hover { background: #fff; }
.sep { width: 1px; height: 20px; background: var(--line); margin: 0 4px; }
</style>
