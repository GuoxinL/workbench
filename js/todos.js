/* ============================================================
 * todos.js —— 待办卡片模块
 * ============================================================ */
(function (WB) {
  const U = WB.util, S = WB.store;
  const $ = U.$, el = U.el;

  let composerColor = 'blue';
  let filterStatus = 'all';
  let filterColor = '';       // '' = 全部颜色
  let keyword = '';
  let editingId = null;

  /* ---------------- 初始化 ---------------- */
  function init() {
    buildSwatches($('#composerSwatches'), k => {
      composerColor = k;
      markSwatch($('#composerSwatches'), k);
    });
    markSwatch($('#composerSwatches'), composerColor);

    buildColorFilter();
    buildSwatches($('#editSwatches'), k => markSwatch($('#editSwatches'), k));

    $('#btnAddTodo').addEventListener('click', addFromComposer);
    $('#todoInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addFromComposer(); }
    });

    $('#statusFilter').addEventListener('click', e => {
      const b = e.target.closest('.seg-btn'); if (!b) return;
      filterStatus = b.dataset.status;
      U.$$('#statusFilter .seg-btn').forEach(x => x.classList.toggle('active', x === b));
      render();
    });

    $('#todoSearch').addEventListener('input', U.debounce(e => {
      keyword = e.target.value.trim().toLowerCase();
      render();
    }, 160));

    /* 编辑抽屉 */
    $('#btnCloseTodo').addEventListener('click', closeSheet);
    $('#todoMask').addEventListener('mousedown', e => {
      if (e.target === $('#todoMask')) closeSheet();
    });
    $('#editStatus').addEventListener('click', e => {
      const b = e.target.closest('.seg-btn'); if (!b) return;
      U.$$('#editStatus .seg-btn').forEach(x => x.classList.toggle('active', x === b));
    });
    $('#btnSaveTodo').addEventListener('click', saveSheet);
    $('#btnDeleteTodo').addEventListener('click', () => {
      if (!editingId) return;
      if (!confirm('确定删除这条待办？')) return;
      S.removeTodo(editingId);
      closeSheet();
      U.toast('已删除', 'ok');
    });
    $('#btnToNote').addEventListener('click', () => {
      if (!editingId) return;
      saveSheet(true);
      const n = S.todoToNote(editingId);
      closeSheet();
      if (n) {
        U.toast('已转为笔记：' + n.title, 'ok');
        WB.app.openNote(n.id);
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$('#todoMask').hidden) closeSheet();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !$('#todoMask').hidden) saveSheet();
    });
  }

  /* ---------------- 色板 ---------------- */
  function buildSwatches(box, onPick) {
    box.innerHTML = '';
    S.COLORS.forEach(c => {
      box.appendChild(el('button', {
        class: 'swatch', title: c.name, 'data-color': c.key,
        style: `background:${c.c}`,
        onclick: () => onPick(c.key)
      }));
    });
  }

  function markSwatch(box, key) {
    U.$$('.swatch', box).forEach(s => s.classList.toggle('on', s.dataset.color === key));
  }

  function currentSwatch(box) {
    const on = U.$('.swatch.on', box);
    return on ? on.dataset.color : 'blue';
  }

  function buildColorFilter() {
    const box = $('#colorFilter');
    box.innerHTML = '';
    box.appendChild(el('button', {
      class: 'swatch on', title: '全部颜色', 'data-color': '',
      style: 'background:linear-gradient(135deg,#2f6bff,#e5484d,#2f9e58,#d98324)',
      onclick: () => { filterColor = ''; markSwatch(box, ''); render(); }
    }));
    S.COLORS.forEach(c => {
      box.appendChild(el('button', {
        class: 'swatch', title: '仅看：' + c.name, 'data-color': c.key,
        style: `background:${c.c}`,
        onclick: () => {
          filterColor = (filterColor === c.key) ? '' : c.key;
          markSwatch(box, filterColor);
          render();
        }
      }));
    });
  }

  /* ---------------- 创建 ---------------- */
  function addFromComposer() {
    const inp = $('#todoInput');
    const title = inp.value.trim();
    if (!title) { inp.focus(); return; }
    S.addTodo({ title, color: composerColor, status: 'todo' });
    inp.value = '';
    inp.focus();
    U.toast('已添加');
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    const board = $('#board');
    if (!board) return;

    let list = S.listTodos();
    if (filterStatus !== 'all') list = list.filter(t => t.status === filterStatus);
    if (filterColor) list = list.filter(t => t.color === filterColor);
    if (keyword) {
      list = list.filter(t =>
        (t.title + ' ' + t.desc).toLowerCase().indexOf(keyword) >= 0);
    }

    // 未完成在前；同组内按更新时间倒序
    list.sort((a, b) => {
      const ad = a.status === 'done' ? 1 : 0, bd = b.status === 'done' ? 1 : 0;
      if (ad !== bd) return ad - bd;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    board.innerHTML = '';
    if (!list.length) {
      board.appendChild(el('div', {
        class: 'empty', html:
          '<div class="empty-art">🗂️</div><div>' +
          (keyword || filterColor || filterStatus !== 'all'
            ? '没有符合条件的待办'
            : '还没有待办，在上方输入框写下第一件事吧') + '</div>'
      }));
      return;
    }

    const frag = document.createDocumentFragment();
    list.forEach(t => frag.appendChild(cardOf(t)));
    board.appendChild(frag);
  }

  function cardOf(t) {
    const c = S.COLOR_MAP[t.color] || S.COLOR_MAP.blue;
    const card = el('div', {
      class: 'card' + (t.status === 'done' ? ' done' : ''),
      style: `--card-c:${c.c};--card-bg:${c.bg}`,
      onclick: e => {
        if (e.target.closest('.check') || e.target.closest('.mini-btn') || e.target.closest('.pill.note')) return;
        openSheet(t.id);
      }
    });

    /* 顶部：勾选 + 标题 + 操作 */
    const check = el('button', {
      class: 'check' + (t.status === 'done' ? ' on' : ''),
      title: t.status === 'done' ? '标记为未完成' : '标记为已完成',
      html: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
      onclick: () => {
        S.updateTodo(t.id, { status: t.status === 'done' ? 'todo' : 'done' });
      }
    });

    const actions = el('div', { class: 'card-actions' }, [
      el('button', {
        class: 'mini-btn', title: t.noteId ? '打开关联笔记' : '转为笔记',
        html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M14 4v6h6"/></svg>',
        onclick: () => {
          if (t.noteId && S.getNote(t.noteId)) { WB.app.openNote(t.noteId); return; }
          const n = S.todoToNote(t.id);
          if (n) { U.toast('已转为笔记', 'ok'); WB.app.openNote(n.id); }
        }
      }),
      el('button', {
        class: 'mini-btn', title: '删除',
        html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
        onclick: () => { if (confirm('删除待办「' + t.title + '」？')) S.removeTodo(t.id); }
      })
    ]);

    card.appendChild(el('div', { class: 'card-top' }, [
      check,
      el('div', { class: 'card-title', text: t.title || '(无标题)' }),
      actions
    ]));

    if (t.desc) card.appendChild(el('div', { class: 'card-desc', text: t.desc }));

    /* 底部标签 */
    const foot = el('div', { class: 'card-foot' });
    foot.appendChild(el('span', { class: 'pill', text: c.name.split(' · ')[1] || c.name }));
    if (t.status !== 'done') {
      foot.appendChild(el('span', { class: 'pill muted', text: S.STATUS_TEXT[t.status] }));
    }
    if (t.due) {
      const over = t.status !== 'done' && t.due < U.todayStr();
      foot.appendChild(el('span', {
        class: 'pill due' + (over ? ' over' : ''),
        text: (over ? '已逾期 ' : '截止 ') + t.due
      }));
    }
    if (t.noteId && S.getNote(t.noteId)) {
      foot.appendChild(el('span', {
        class: 'pill note', text: '📝 笔记',
        onclick: () => WB.app.openNote(t.noteId)
      }));
    }
    card.appendChild(foot);

    return card;
  }

  /* ---------------- 编辑抽屉 ---------------- */
  function openSheet(id) {
    const t = S.getTodo(id);
    if (!t) return;
    editingId = id;

    $('#todoSheetTitle').textContent = '编辑待办';
    $('#editTitle').value = t.title;
    $('#editDesc').value = t.desc;
    $('#editDue').value = t.due || '';
    markSwatch($('#editSwatches'), t.color);
    U.$$('#editStatus .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.status === t.status));

    const note = t.noteId ? S.getNote(t.noteId) : null;
    $('#linkedNoteField').hidden = !note;
    $('#btnToNote').textContent = note ? '打开笔记' : '转为笔记';
    if (note) {
      const box = $('#linkedNote');
      box.textContent = '📝 ' + note.title;
      box.onclick = () => { closeSheet(); WB.app.openNote(note.id); };
    }

    $('#todoMask').hidden = false;
    setTimeout(() => $('#editTitle').focus(), 60);
  }

  function closeSheet() {
    $('#todoMask').hidden = true;
    editingId = null;
  }

  function saveSheet(silent) {
    if (!editingId) return;
    const title = $('#editTitle').value.trim();
    if (!title) { U.toast('标题不能为空', 'err'); return; }
    const status = (U.$('#editStatus .seg-btn.active') || {}).dataset
      ? U.$('#editStatus .seg-btn.active').dataset.status : 'todo';

    S.updateTodo(editingId, {
      title,
      desc: $('#editDesc').value,
      color: currentSwatch($('#editSwatches')),
      status,
      due: $('#editDue').value || ''
    });

    if (silent !== true) { closeSheet(); U.toast('已保存', 'ok'); }
  }

  WB.todos = { init, render, openSheet };
})(window.WB);
