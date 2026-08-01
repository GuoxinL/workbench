<script setup lang="ts">
import { compressImage } from '@/lib/image'

const emit = defineEmits<{ close: [] }>()

/** 在 ProseMirror 光标处插入/环绕文本 */
function view() { return (window as any).__milkdownView }

/** 直接用文本操作，不依赖 ProseMirror mark（跨 schema 安全） */
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
  const $pos = v.state.doc.resolve(from)
  const bol = $pos.start() // start of current block
  const beforeBlock = from === bol
  const prefix = beforeBlock ? text : '\n' + text
  insertText(prefix)
}

// ── 按钮动作 ──
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
function onCodeBlock() { insertText('\n`\`\n') }
function onHr() { insertText('\n---\n') }

function onLink() {
  const url = prompt('链接 URL：', 'https://')
  if (url) insertText(`[${url}](${url})`)
}

async function onImage() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const dataUri = await compressImage(file)
      insertText(`![](${dataUri})`)
    } catch { /* ignore */ }
  }
  input.click()
}

function onTable() {
  const rows = prompt('行数（默认 3）', '3')
  const cols = prompt('列数（默认 3）', '3')
  const r = parseInt(rows || '3', 10) || 3
  const c = parseInt(cols || '3', 10) || 3
  let table = ''
  for (let i = 0; i < r; i++) {
    table += '| ' + Array(c).fill('  ').join(' | ') + ' |\n'
    if (i === 0) table += '| ' + Array(c).fill('---').join(' | ') + ' |\n'
  }
  insertText(table)
}
</script>

<template>
  <div class="toolbar">
    <button title="粗体 (Ctrl+B)" @click="onBold">B</button>
    <button title="斜体 (Ctrl+I)" @click="onItalic">I</button>
    <button title="删除线" @click="onStrike">S</button>
    <button title="行内代码" @click="onCode">C</button>
    <span class="sep" />
    <button title="一级标题" @click="onH1">H1</button>
    <button title="二级标题" @click="onH2">H2</button>
    <button title="三级标题" @click="onH3">H3</button>
    <span class="sep" />
    <button title="无序列表" @click="onUl">≡</button>
    <button title="有序列表" @click="onOl">1.</button>
    <button title="引用" @click="onQuote">❝</button>
    <span class="sep" />
    <button title="代码块" @click="onCodeBlock">{ }</button>
    <button title="表格" @click="onTable">⊞</button>
    <span class="sep" />
    <button title="链接" @click="onLink">🔗</button>
    <button title="图片" @click="onImage">🖼</button>
    <button title="分割线" @click="onHr">—</button>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 4px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.toolbar button:first-child { font-weight: 700; }  /* B → 粗体 */
.toolbar button:nth-child(2) { font-style: italic; }  /* I → 斜体 */
.toolbar button:nth-child(3) { text-decoration: line-through; }  /* S → 删除线 */
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--fg);
  transition: background 0.1s;
}
.toolbar button:hover {
  background: var(--bg);
}