/* ============================================================
 * store.js —— 统一数据仓库
 *   - 单一数据源：{ version, todos[], notes[], updatedAt }
 *   - 每条记录带 updatedAt + deleted 墓碑，用于多端 LWW 合并
 *   - 变更即写 localStorage，并广播事件驱动同步与渲染
 * ============================================================ */
(function (WB) {
  const U = WB.util;

  const LS_DATA = 'wb.data.v1';
  const LS_CFG = 'wb.cfg.v1';
  const LS_DEVICE = 'wb.device.v1';

  /* ---------- 颜色定义 ---------- */
  const COLORS = [
    { key: 'blue',   name: '蓝 · 常规',   c: '#2f6bff', bg: '#eaf0ff' },
    { key: 'red',    name: '红 · 紧急',   c: '#e5484d', bg: '#fdecec' },
    { key: 'amber',  name: '橙 · 重要',   c: '#d98324', bg: '#fdf3e5' },
    { key: 'green',  name: '绿 · 推进中', c: '#2f9e58', bg: '#e8f6ed' },
    { key: 'purple', name: '紫 · 思考',   c: '#8256d0', bg: '#f2edfc' },
    { key: 'teal',   name: '青 · 协作',   c: '#0f9b9b', bg: '#e5f6f6' },
    { key: 'pink',   name: '粉 · 个人',   c: '#d6407f', bg: '#fdecf4' },
    { key: 'slate',  name: '灰 · 待定',   c: '#64748b', bg: '#f1f5f9' }
  ];
  const COLOR_MAP = {};
  COLORS.forEach(c => COLOR_MAP[c.key] = c);

  const STATUS_TEXT = { todo: '待办', doing: '进行中', done: '已完成' };

  /* ---------- 默认配置 ---------- */
  const DEFAULT_CFG = {
    enabled: false,
    repo: '',
    branch: 'main',
    path: 'data/workbench.json',
    token: '',
    poll: 20
  };

  /* ---------- 状态 ---------- */
  let data = emptyData();
  let cfg = Object.assign({}, DEFAULT_CFG);
  let deviceId = '';
  let dirty = false;               // 有未推送的本地变更
  const listeners = {};            // event -> [fn]

  function emptyData() {
    return { version: 1, todos: [], notes: [], updatedAt: 0 };
  }

  /* ---------- 事件 ---------- */
  function on(evt, fn) {
    (listeners[evt] = listeners[evt] || []).push(fn);
  }
  function emit(evt, payload) {
    (listeners[evt] || []).forEach(fn => {
      try { fn(payload); } catch (e) { console.error('[store] listener error', evt, e); }
    });
  }

  /* ---------- 本地持久化 ---------- */
  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_DATA);
      if (raw) data = normalize(JSON.parse(raw));
    } catch (e) { console.warn('[store] 本地数据解析失败', e); }

    try {
      const raw = localStorage.getItem(LS_CFG);
      if (raw) cfg = Object.assign({}, DEFAULT_CFG, JSON.parse(raw));
    } catch (e) { console.warn('[store] 本地配置解析失败', e); }

    deviceId = localStorage.getItem(LS_DEVICE) || '';
    if (!deviceId) {
      deviceId = U.uid('dev');
      localStorage.setItem(LS_DEVICE, deviceId);
    }
    dirty = localStorage.getItem('wb.dirty') === '1';
  }

  function saveLocal() {
    try {
      localStorage.setItem(LS_DATA, JSON.stringify(data));
      localStorage.setItem('wb.dirty', dirty ? '1' : '0');
    } catch (e) {
      U.toast('本地存储写入失败：' + e.message, 'err');
    }
  }

  function saveCfg(next) {
    cfg = Object.assign({}, cfg, next || {});
    try { localStorage.setItem(LS_CFG, JSON.stringify(cfg)); } catch (e) { }
    emit('cfg', cfg);
    return cfg;
  }

  function normalize(d) {
    d = d || {};
    return {
      version: d.version || 1,
      todos: Array.isArray(d.todos) ? d.todos.map(normTodo) : [],
      notes: Array.isArray(d.notes) ? d.notes.map(normNote) : [],
      updatedAt: d.updatedAt || 0
    };
  }

  function normTodo(t) {
    return {
      id: t.id || U.uid('t'),
      title: t.title || '',
      desc: t.desc || '',
      color: COLOR_MAP[t.color] ? t.color : 'blue',
      status: ['todo', 'doing', 'done'].indexOf(t.status) >= 0 ? t.status : 'todo',
      due: t.due || '',
      noteId: t.noteId || '',
      createdAt: t.createdAt || Date.now(),
      updatedAt: t.updatedAt || t.createdAt || Date.now(),
      deleted: !!t.deleted
    };
  }

  function normNote(n) {
    return {
      id: n.id || U.uid('n'),
      title: n.title || '未命名笔记',
      content: n.content || '',
      fromTodo: n.fromTodo || '',
      createdAt: n.createdAt || Date.now(),
      updatedAt: n.updatedAt || n.createdAt || Date.now(),
      deleted: !!n.deleted
    };
  }

  /* ---------- 变更提交 ---------- */
  let batching = false, batchPending = false;

  function commit(reason) {
    data.updatedAt = U.now();
    dirty = true;
    if (batching) { batchPending = true; return; }
    saveLocal();
    emit('change', reason || '');
    emit('dirty', true);
  }

  /* 批量修改：期间只在结束时触发一次渲染与同步 */
  function batch(fn) {
    if (batching) { fn(); return; }
    batching = true;
    try { fn(); }
    finally {
      batching = false;
      if (batchPending) { batchPending = false; commit('batch'); }
    }
  }

  /* ============================================================
   * 待办 CRUD
   * ============================================================ */
  function listTodos() { return data.todos.filter(t => !t.deleted); }
  function getTodo(id) { return data.todos.find(t => t.id === id && !t.deleted) || null; }

  function addTodo(fields) {
    const t = normTodo(Object.assign({
      createdAt: U.now(), updatedAt: U.now()
    }, fields));
    data.todos.unshift(t);
    commit('todo:add');
    return t;
  }

  function updateTodo(id, patch) {
    const t = data.todos.find(x => x.id === id);
    if (!t) return null;
    Object.assign(t, patch, { updatedAt: U.now() });
    commit('todo:update');
    return t;
  }

  function removeTodo(id) {
    const t = data.todos.find(x => x.id === id);
    if (!t) return;
    t.deleted = true;
    t.updatedAt = U.now();
    commit('todo:remove');
  }

  /* ============================================================
   * 笔记 CRUD
   * ============================================================ */
  function listNotes() { return data.notes.filter(n => !n.deleted); }
  function getNote(id) { return data.notes.find(n => n.id === id && !n.deleted) || null; }

  function findNoteByTitle(title) {
    const key = U.slug(title);
    return data.notes.find(n => !n.deleted && U.slug(n.title) === key) || null;
  }

  function addNote(fields) {
    const n = normNote(Object.assign({
      createdAt: U.now(), updatedAt: U.now()
    }, fields));
    data.notes.unshift(n);
    commit('note:add');
    return n;
  }

  function updateNote(id, patch) {
    const n = data.notes.find(x => x.id === id);
    if (!n) return null;
    Object.assign(n, patch, { updatedAt: U.now() });
    commit('note:update');
    return n;
  }

  function removeNote(id) {
    const n = data.notes.find(x => x.id === id);
    if (!n) return;
    n.deleted = true;
    n.updatedAt = U.now();
    // 解除待办关联
    data.todos.forEach(t => {
      if (t.noteId === id) { t.noteId = ''; t.updatedAt = U.now(); }
    });
    commit('note:remove');
  }

  /* 待办 → 笔记 */
  function todoToNote(todoId) {
    const t = getTodo(todoId);
    if (!t) return null;
    if (t.noteId && getNote(t.noteId)) return getNote(t.noteId);

    const color = COLOR_MAP[t.color] || COLOR_MAP.blue;
    const lines = [
      '> 由待办转换 · ' + color.name + ' · ' + (STATUS_TEXT[t.status] || '') +
      (t.due ? ' · 截止 ' + t.due : ''),
      ''
    ];
    if (t.desc) { lines.push(t.desc, ''); }
    lines.push('## 记录', '', '- ', '', '## 关联', '', '');

    let title = t.title || '未命名待办';
    // 标题去重，保证 [[标题]] 引用唯一
    if (findNoteByTitle(title)) {
      let i = 2;
      while (findNoteByTitle(title + ' (' + i + ')')) i++;
      title = title + ' (' + i + ')';
    }

    const n = addNote({ title, content: lines.join('\n'), fromTodo: t.id });
    updateTodo(t.id, { noteId: n.id });
    return n;
  }

  /* ============================================================
   * 合并（远端 ← → 本地），逐条 last-write-wins
   * ============================================================ */
  function mergeInto(remote) {
    remote = normalize(remote);
    let changed = false;

    ['todos', 'notes'].forEach(coll => {
      const localMap = {};
      data[coll].forEach(it => localMap[it.id] = it);

      remote[coll].forEach(rit => {
        const lit = localMap[rit.id];
        if (!lit) {
          data[coll].push(rit);
          changed = true;
        } else if ((rit.updatedAt || 0) > (lit.updatedAt || 0)) {
          Object.assign(lit, rit);
          changed = true;
        }
      });

      // 保持新→旧排序
      data[coll].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    });

    if (changed) {
      data.updatedAt = U.now();
      saveLocal();
      emit('change', 'merge');
    }
    return changed;
  }

  /* 判断本地是否比远端多出内容（决定是否需要推送） */
  function diffFromRemote(remote) {
    remote = normalize(remote);
    let need = false;
    ['todos', 'notes'].forEach(coll => {
      const rMap = {};
      remote[coll].forEach(it => rMap[it.id] = it);
      data[coll].forEach(lit => {
        const rit = rMap[lit.id];
        if (!rit || (lit.updatedAt || 0) > (rit.updatedAt || 0)) need = true;
      });
    });
    return need;
  }

  /* 序列化（清理 30 天前的墓碑，控制文件体积） */
  function serialize() {
    const cutoff = U.now() - 30 * 86400e3;
    const out = {
      version: 1,
      updatedAt: data.updatedAt,
      todos: data.todos.filter(t => !(t.deleted && t.updatedAt < cutoff)),
      notes: data.notes.filter(n => !(n.deleted && n.updatedAt < cutoff))
    };
    return JSON.stringify(out, null, 2);
  }

  function replaceAll(next) {
    data = normalize(next);
    saveLocal();
    emit('change', 'replace');
  }

  function setDirty(v) {
    dirty = !!v;
    localStorage.setItem('wb.dirty', dirty ? '1' : '0');
    emit('dirty', dirty);
  }

  /* ---------- 统计 ---------- */
  function stats() {
    const ts = listTodos();
    return {
      total: ts.length,
      todo: ts.filter(t => t.status === 'todo').length,
      doing: ts.filter(t => t.status === 'doing').length,
      done: ts.filter(t => t.status === 'done').length,
      notes: listNotes().length
    };
  }

  WB.store = {
    COLORS, COLOR_MAP, STATUS_TEXT, DEFAULT_CFG,
    on, emit, batch,
    loadLocal, saveLocal, saveCfg,
    get cfg() { return cfg; },
    get data() { return data; },
    get deviceId() { return deviceId; },
    get dirty() { return dirty; },
    setDirty,
    listTodos, getTodo, addTodo, updateTodo, removeTodo,
    listNotes, getNote, findNoteByTitle, addNote, updateNote, removeNote,
    todoToNote,
    mergeInto, diffFromRemote, serialize, replaceAll, stats
  };
})(window.WB);
