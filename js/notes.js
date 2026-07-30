/* ============================================================
 * notes.js —— 笔记查阅 / 编辑 / 双向链接
 *   语法：[[笔记标题]] 或 [[笔记标题|显示名]]
 *   A 引用 B ⇒ A 的「引用了」出现 B，B 的「被引用」出现 A
 * ============================================================ */
(function (WB) {
  const U = WB.util, S = WB.store, MD = WB.md;
  const $ = U.$, el = U.el;

  let currentId = null;
  let mode = 'read';          // read | edit
  let keyword = '';
  let acItems = [];           // 自动补全候选
  let acIndex = 0;
  let acRange = null;         // {start, end} 待替换区间
  let suppressRender = false; // 编辑中避免外部重渲染打断输入

  const autoSave = U.debounce(() => { commitEditor(); }, 700);

  /* ---------------- 初始化 ---------------- */
  function init() {
    $('#btnAddNote').addEventListener('click', () => createNote());

    $('#noteSearch').addEventListener('input', U.debounce(e => {
      keyword = e.target.value.trim().toLowerCase();
      renderList();
    }, 150));

    $('#noteMode').addEventListener('click', e => {
      const b = e.target.closest('.seg-btn'); if (!b) return;
      setMode(b.dataset.mode);
    });

    $('#btnBackList').addEventListener('click', () => {
      autoSave.flushNow();
      $('#notesLayout').classList.remove('detail');
    });

    $('#btnDeleteNote').addEventListener('click', () => {
      if (!currentId) return;
      const n = S.getNote(currentId);
      if (!n) return;
      if (!confirm('删除笔记「' + n.title + '」？其它笔记中的引用将标记为未创建。')) return;
      S.removeNote(currentId);
      currentId = null;
      showEmpty();
      U.toast('已删除', 'ok');
    });

    const ta = $('#noteContent');
    ta.addEventListener('input', () => {
      suppressRender = true;
      autoSave();
      updateAutocomplete();
      livePreview();
    });
    ta.addEventListener('keydown', onEditorKeydown);
    ta.addEventListener('blur', () => {
      setTimeout(hideAC, 160);
      autoSave.flushNow();
      suppressRender = false;
    });
    ta.addEventListener('click', updateAutocomplete);

    $('#noteTitle').addEventListener('input', () => { suppressRender = true; autoSave(); });
    $('#noteTitle').addEventListener('blur', () => { autoSave.flushNow(); suppressRender = false; });

    // 预览区点击 wiki 链接
    $('#notePreview').addEventListener('click', e => {
      const a = e.target.closest('.wikilink');
      if (!a) return;
      e.preventDefault();
      gotoByTitle(a.dataset.wiki);
    });
  }

  /* ---------------- 链接图 ---------------- */
  /* 返回 { outMap: {noteId: [note...]}, inMap: {noteId: [{note, ctx}]}, missing: {noteId:[title]} } */
  function buildGraph() {
    const notes = S.listNotes();
    const byTitle = {};
    notes.forEach(n => byTitle[U.slug(n.title)] = n);

    const outMap = {}, inMap = {}, missing = {};
    notes.forEach(n => { outMap[n.id] = []; inMap[n.id] = []; missing[n.id] = []; });

    notes.forEach(src => {
      MD.extractLinks(src.content).forEach(lk => {
        const tgt = byTitle[U.slug(lk.target)];
        if (!tgt) { missing[src.id].push(lk.target); return; }
        if (tgt.id === src.id) return;                       // 忽略自引用
        if (outMap[src.id].indexOf(tgt) < 0) outMap[src.id].push(tgt);
        if (!inMap[tgt.id].some(x => x.note === src)) {
          inMap[tgt.id].push({ note: src, ctx: MD.linkContext(src.content, tgt.title) });
        }
      });
    });

    return { outMap, inMap, missing, byTitle, notes };
  }

  /* ---------------- 列表 ---------------- */
  function renderList() {
    const box = $('#noteList');
    if (!box) return;
    const g = buildGraph();

    let list = g.notes.slice();
    if (keyword) {
      list = list.filter(n => (n.title + ' ' + n.content).toLowerCase().indexOf(keyword) >= 0);
    }
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    box.innerHTML = '';
    if (!list.length) {
      box.appendChild(el('li', {
        class: 'note-item', style: 'color:var(--text-3);cursor:default',
        text: keyword ? '没有匹配的笔记' : '还没有笔记，点右上角新建'
      }));
      return;
    }

    list.forEach(n => {
      const outN = (g.outMap[n.id] || []).length;
      const inN = (g.inMap[n.id] || []).length;
      const sub = el('div', { class: 'ni-sub' }, [
        el('span', { text: U.fmtTime(n.updatedAt) })
      ]);
      if (outN) sub.appendChild(el('span', { class: 'ni-badge', text: '↗ ' + outN }));
      if (inN) sub.appendChild(el('span', { class: 'ni-badge', text: '↙ ' + inN }));
      if (n.fromTodo) sub.appendChild(el('span', { class: 'ni-badge', text: '来自待办' }));

      box.appendChild(el('li', {
        class: 'note-item' + (n.id === currentId ? ' on' : ''),
        onclick: () => open(n.id)
      }, [
        el('div', { class: 'ni-title', text: n.title || '未命名' }),
        sub
      ]));
    });
  }

  /* ---------------- 打开 / 渲染详情 ---------------- */
  function open(id) {
    autoSave.flushNow();
    const n = S.getNote(id);
    if (!n) { showEmpty(); return; }
    currentId = id;
    suppressRender = false;
    $('#notesLayout').classList.add('detail');
    renderDetail();
    renderList();
  }

  function showEmpty() {
    currentId = null;
    $('#noteEmpty').hidden = false;
    $('#noteEditor').hidden = true;
    $('#notesLayout').classList.remove('detail');
    renderList();
  }

  function renderDetail() {
    const n = currentId ? S.getNote(currentId) : null;
    if (!n) { showEmpty(); return; }

    $('#noteEmpty').hidden = true;
    $('#noteEditor').hidden = false;

    if (document.activeElement !== $('#noteTitle')) $('#noteTitle').value = n.title;
    if (document.activeElement !== $('#noteContent')) $('#noteContent').value = n.content;

    const meta = [];
    meta.push('创建于 ' + U.fmtDate(n.createdAt));
    meta.push('更新于 ' + U.fmtTime(n.updatedAt));
    meta.push(n.content.replace(/\s/g, '').length + ' 字');
    if (n.fromTodo) {
      const t = S.getTodo(n.fromTodo);
      if (t) meta.push('源自待办：' + U.truncate(t.title, 20));
    }
    $('#noteMeta').textContent = meta.join(' · ');

    livePreview();
    renderLinks();
    setMode(mode, true);
  }

  function livePreview() {
    const content = $('#noteContent').value;
    const exists = title => !!S.findNoteByTitle(title);
    $('#notePreview').className = 'preview md';
    $('#notePreview').innerHTML = MD.render(content, exists) ||
      '<p style="color:var(--text-3)">（空白笔记，切到「编辑」开始记录）</p>';
  }

  function renderLinks() {
    if (!currentId) return;
    const g = buildGraph();
    const outs = g.outMap[currentId] || [];
    const ins = g.inMap[currentId] || [];
    const miss = g.missing[currentId] || [];

    const outBox = $('#outLinks'), inBox = $('#inLinks');
    outBox.innerHTML = ''; inBox.innerHTML = '';
    $('#outCount').textContent = outs.length + (miss.length ? ' (+' + miss.length + ' 待建)' : '');
    $('#inCount').textContent = ins.length;

    if (!outs.length && !miss.length) {
      outBox.appendChild(el('li', { class: 'none', text: '正文中用 [[标题]] 引用其它笔记' }));
    }
    outs.forEach(t => {
      outBox.appendChild(el('li', {
        onclick: () => open(t.id)
      }, [
        el('span', { text: '📄 ' + t.title }),
        el('span', { class: 'ctx', text: MD.plain(t.content, 24) })
      ]));
    });
    miss.forEach(title => {
      outBox.appendChild(el('li', {
        style: 'color:var(--warn)',
        title: '该笔记尚未创建，点击立即创建',
        onclick: () => {
          const n = S.addNote({ title, content: '' });
          U.toast('已创建笔记：' + title, 'ok');
          open(n.id);
        }
      }, [el('span', { text: '＋ ' + title + '（未创建）' })]));
    });

    if (!ins.length) {
      inBox.appendChild(el('li', { class: 'none', text: '暂无其它笔记引用本篇' }));
    }
    ins.forEach(item => {
      inBox.appendChild(el('li', {
        onclick: () => open(item.note.id)
      }, [
        el('span', { text: '📄 ' + item.note.title }),
        el('span', { class: 'ctx', text: item.ctx })
      ]));
    });
  }

  /* ---------------- 模式切换 ---------------- */
  function setMode(m, silent) {
    mode = m;
    U.$$('#noteMode .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
    const wrap = $('#editorWrap');
    const body = $('.note-body');
    wrap.hidden = (m !== 'edit');
    body.classList.toggle('editing', m === 'edit');
    if (m === 'edit' && !silent) setTimeout(() => $('#noteContent').focus(), 50);
  }

  /* ---------------- 保存 ---------------- */
  function commitEditor() {
    if (!currentId) return;
    const n = S.getNote(currentId);
    if (!n) return;

    let title = $('#noteTitle').value.trim() || '未命名笔记';
    const content = $('#noteContent').value;

    // 标题变更 → 同步更新其它笔记里的 [[旧标题]]，保持双链不断裂
    if (U.slug(title) !== U.slug(n.title)) {
      const dup = S.findNoteByTitle(title);
      if (dup && dup.id !== n.id) {
        let i = 2, base = title;
        while (S.findNoteByTitle(base + ' (' + i + ')')) i++;
        title = base + ' (' + i + ')';
        $('#noteTitle').value = title;
        U.toast('标题重复，已自动改为「' + title + '」');
      }
      renameRefs(n.title, title, n.id);
    }

    if (n.title !== title || n.content !== content) {
      S.updateNote(currentId, { title, content });
      renderLinks();
      renderList();
      const meta = $('#noteMeta');
      if (meta) meta.textContent = meta.textContent.replace(/更新于[^·]*/, '更新于 刚刚 ');
    }
  }

  function renameRefs(oldTitle, newTitle, selfId) {
    const key = U.slug(oldTitle);
    let count = 0;
    S.batch(() => {
      S.listNotes().forEach(other => {
        if (other.id === selfId) return;
        if (other.content.indexOf('[[') < 0) return;
        let touched = false;
        const next = other.content.replace(/\[\[([^\[\]|]+?)(\|[^\[\]]+?)?\]\]/g, (raw, t, alias) => {
          if (U.slug(t.trim()) !== key) return raw;
          touched = true;
          return '[[' + newTitle + (alias || '') + ']]';
        });
        if (touched) { S.updateNote(other.id, { content: next }); count++; }
      });
    });
    if (count) U.toast('已同步更新 ' + count + ' 篇笔记中的引用');
    return count;
  }

  /* ---------------- 新建 / 跳转 ---------------- */
  function createNote(title, content) {
    let t = title || '未命名笔记';
    if (S.findNoteByTitle(t)) {
      let i = 2;
      while (S.findNoteByTitle(t + ' ' + i)) i++;
      t = t + ' ' + i;
    }
    const n = S.addNote({ title: t, content: content || '' });
    open(n.id);
    setMode('edit');
    setTimeout(() => { $('#noteTitle').select(); }, 60);
    return n;
  }

  function gotoByTitle(title) {
    const n = S.findNoteByTitle(title);
    if (n) { open(n.id); return; }
    if (confirm('笔记「' + title + '」还不存在，现在创建？')) {
      const created = S.addNote({ title: title, content: '' });
      open(created.id);
      setMode('edit');
    }
  }

  /* ---------------- [[ 自动补全 ---------------- */
  function onEditorKeydown(e) {
    const panel = $('#acPanel');
    if (!panel.hidden) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveAC(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveAC(-1); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applyAC(acIndex); return; }
      if (e.key === 'Escape') { e.preventDefault(); hideAC(); return; }
    }
    // 输入 [ 自动补全另一个 [，并成对补 ]]
    if (e.key === '[' ) {
      const ta = e.target;
      const before = ta.value.slice(0, ta.selectionStart);
      if (before.slice(-1) === '[') {
        e.preventDefault();
        const pos = ta.selectionStart;
        ta.value = ta.value.slice(0, pos) + '[]]' + ta.value.slice(ta.selectionEnd);
        ta.selectionStart = ta.selectionEnd = pos + 1;
        suppressRender = true;
        autoSave();
        updateAutocomplete();
        livePreview();
      }
    }
  }

  function updateAutocomplete() {
    const ta = $('#noteContent');
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    const m = before.match(/\[\[([^\[\]\n]*)$/);
    if (!m) { hideAC(); return; }

    const q = m[1].toLowerCase();
    acRange = { start: pos - m[1].length, end: pos };

    let cands = S.listNotes().filter(n => n.id !== currentId);
    if (q) cands = cands.filter(n => n.title.toLowerCase().indexOf(q) >= 0);
    cands.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    cands = cands.slice(0, 8);

    acItems = cands.map(n => ({ type: 'note', title: n.title }));
    if (q.trim() && !S.findNoteByTitle(q.trim())) {
      acItems.push({ type: 'new', title: m[1].trim() });
    }
    if (!acItems.length) { hideAC(); return; }

    acIndex = 0;
    drawAC();
  }

  function drawAC() {
    const panel = $('#acPanel');
    panel.innerHTML = '';
    acItems.forEach((it, i) => {
      panel.appendChild(el('div', {
        class: 'ac-item' + (i === acIndex ? ' on' : ''),
        onmousedown: e => { e.preventDefault(); applyAC(i); },
        html: it.type === 'new'
          ? '＋ 新建「' + U.esc(it.title) + '」<span class="ac-new">回车创建并引用</span>'
          : '📄 ' + U.esc(it.title)
      }));
    });
    panel.hidden = false;
    positionAC();
  }

  function positionAC() {
    const ta = $('#noteContent');
    const panel = $('#acPanel');
    const coord = caretXY(ta, ta.selectionStart);
    const wrapH = $('#editorWrap').clientHeight;
    let top = coord.top + 22;
    if (top + panel.offsetHeight > wrapH - 10) top = Math.max(6, coord.top - panel.offsetHeight - 6);
    panel.style.left = Math.min(coord.left, $('#editorWrap').clientWidth - panel.offsetWidth - 12) + 'px';
    panel.style.top = top + 'px';
  }

  /* 用镜像元素测算光标坐标 */
  let mirror = null;
  function caretXY(ta, pos) {
    if (!mirror) {
      mirror = document.createElement('div');
      mirror.style.cssText = 'position:absolute;visibility:hidden;white-space:pre-wrap;word-wrap:break-word;top:0;left:0;';
      document.body.appendChild(mirror);
    }
    const cs = getComputedStyle(ta);
    ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'borderWidth', 'boxSizing'].forEach(k => mirror.style[k] = cs[k]);
    mirror.style.width = ta.clientWidth + 'px';

    mirror.textContent = ta.value.slice(0, pos);
    const span = document.createElement('span');
    span.textContent = '\u200b';
    mirror.appendChild(span);

    const top = span.offsetTop - ta.scrollTop;
    const left = span.offsetLeft;
    return { top, left };
  }

  function moveAC(d) {
    acIndex = (acIndex + d + acItems.length) % acItems.length;
    drawAC();
  }

  function applyAC(i) {
    const it = acItems[i];
    if (!it || !acRange) { hideAC(); return; }
    const ta = $('#noteContent');
    const v = ta.value;

    // 若光标后紧跟 ]]，直接跳过；否则补上
    const after = v.slice(acRange.end);
    const closed = after.slice(0, 2) === ']]';
    const insert = it.title + (closed ? '' : ']]');

    ta.value = v.slice(0, acRange.start) + insert + v.slice(acRange.end);
    const caret = acRange.start + it.title.length + 2;
    ta.selectionStart = ta.selectionEnd = caret;
    ta.focus();

    if (it.type === 'new' && it.title) {
      if (!S.findNoteByTitle(it.title)) {
        S.addNote({ title: it.title, content: '' });
        U.toast('已创建笔记：' + it.title, 'ok');
      }
    }

    hideAC();
    commitEditor();
    livePreview();
  }

  function hideAC() {
    const p = $('#acPanel');
    if (p) p.hidden = true;
    acItems = []; acRange = null;
  }

  /* ---------------- 外部刷新 ---------------- */
  function render() {
    if (suppressRender) { renderList(); return; }
    renderList();
    if (currentId) {
      if (S.getNote(currentId)) renderDetail();
      else showEmpty();
    }
  }

  WB.notes = { init, render, renderList, open, createNote, buildGraph, flush: () => autoSave.flushNow() };
})(window.WB);
