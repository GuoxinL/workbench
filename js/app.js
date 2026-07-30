/* ============================================================
 * app.js —— 应用入口：视图路由 / 同步状态 / 设置面板
 * ============================================================ */
(function (WB) {
  const U = WB.util, S = WB.store;
  const $ = U.$;

  let view = 'todos';

  /* ---------------- 启动 ---------------- */
  function boot() {
    S.loadLocal();

    WB.todos.init();
    WB.notes.init();
    WB.graph.init();
    initNav();
    initSync();
    initCfgSheet();

    // 首次使用塞入示例数据，直观展示双链效果
    if (!S.listTodos().length && !S.listNotes().length && !localStorage.getItem('wb.seeded')) {
      seed();
      localStorage.setItem('wb.seeded', '1');
    }

    S.on('change', () => {
      renderAll();
      if (WB.gh.cfgValid()) WB.gh.schedulePush();
    });
    S.on('sync', paintSync);

    renderAll();
    restoreView();

    if (WB.gh.cfgValid()) {
      WB.gh.sync({ silent: true });
      WB.gh.restartPoll();
    } else {
      paintSync({ state: 'off' });
    }

    // 回到前台立即同步；离开前把待保存内容落盘并推送
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && WB.gh.cfgValid()) WB.gh.sync({ silent: true });
    });
    window.addEventListener('online', () => { if (WB.gh.cfgValid()) WB.gh.sync({ silent: true }); });
    window.addEventListener('beforeunload', e => {
      WB.notes.flush();
      if (S.dirty && WB.gh.cfgValid()) {
        e.preventDefault();
        e.returnValue = '还有变更未同步到 GitHub，确定离开？';
        return e.returnValue;
      }
    });
  }

  /* ---------------- 视图 ---------------- */
  function initNav() {
    $('#tabs').addEventListener('click', e => {
      const b = e.target.closest('.tab'); if (b) go(b.dataset.view);
    });
    $('#mobileNav').addEventListener('click', e => {
      const b = e.target.closest('.mnav'); if (b) go(b.dataset.view);
    });
  }

  function go(v) {
    view = v;
    U.$$('.tab').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    U.$$('.mnav').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    U.$$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
    localStorage.setItem('wb.view', v);
    if (v === 'graph') setTimeout(() => WB.graph.render(true), 30);
    if (v === 'notes') WB.notes.renderList();
  }

  function restoreView() {
    go(localStorage.getItem('wb.view') || 'todos');
  }

  function openNote(id) {
    go('notes');
    WB.notes.open(id);
  }

  function renderAll() {
    WB.todos.render();
    WB.notes.render();
    if (view === 'graph') WB.graph.render();
  }

  /* ---------------- 同步状态 ---------------- */
  function initSync() {
    $('#syncChip').addEventListener('click', () => {
      if (!WB.gh.cfgValid()) { openCfg(); return; }
      WB.notes.flush();
      WB.gh.sync({}).then(ok => { if (ok !== false) U.toast('已同步到 GitHub', 'ok'); });
    });
  }

  function paintSync(info) {
    const dot = $('#syncDot'), txt = $('#syncText');
    if (!dot) return;
    dot.className = 'sync-dot';
    switch (info.state) {
      case 'syncing': dot.classList.add('busy'); txt.textContent = '同步中'; break;
      case 'ok':
        dot.classList.add('ok');
        txt.textContent = S.dirty ? '待同步' : '已同步 ' + U.fmtTime(Date.now());
        break;
      case 'error': dot.classList.add('err'); txt.textContent = '同步失败'; break;
      default: txt.textContent = '本地模式';
    }
    $('#syncChip').title = info.error
      ? '同步失败：' + info.error
      : (WB.gh.cfgValid() ? '点击立即同步' : '点击配置 GitHub 同步');
  }

  // 状态里的相对时间定时刷新
  setInterval(() => {
    const st = WB.gh.status();
    if (st.state === 'ok') paintSync(st);
  }, 30000);

  /* ---------------- 设置面板 ---------------- */
  function initCfgSheet() {
    $('#btnSettings').addEventListener('click', openCfg);
    $('#btnCloseCfg').addEventListener('click', closeCfg);
    $('#cfgMask').addEventListener('mousedown', e => {
      if (e.target === $('#cfgMask')) closeCfg();
    });

    $('#btnTestCfg').addEventListener('click', async () => {
      const c = readCfg();
      showCfgStatus('info', '正在测试连接…');
      const r = await WB.gh.test(c);
      showCfgStatus(r.ok ? 'ok' : 'err', r.msg);
    });

    $('#btnDiagCfg').addEventListener('click', async () => {
      const btn = $('#btnDiagCfg');
      if (btn.disabled) return;
      btn.disabled = true;
      const box = $('#cfgDiag');
      box.hidden = false;
      box.innerHTML = '';
      $('#cfgStatus').className = 'cfg-status';
      const done = [];
      addDiagRow(box, null, '正在检测…', '');
      try {
        await WB.gh.diagnose(readCfg(), (it) => {
          done.push(it);
          box.innerHTML = '';
          done.forEach(d => addDiagRow(box, d.ok, d.name, d.msg));
          if (it.ok) addDiagRow(box, null, '正在检测…', '');
        });
      } catch (e) {
        addDiagRow(box, false, '诊断异常', e.message || String(e));
      }
      box.querySelectorAll('.diag-row.run').forEach(n => n.remove());
      btn.disabled = false;
    });

    $('#btnSaveCfg').addEventListener('click', async () => {
      const c = readCfg();
      if (c.enabled) {
        if (!/^[^/\s]+\/[^/\s]+$/.test(c.repo)) { showCfgStatus('err', '仓库格式应为 owner/repo'); return; }
        if (!c.token) { showCfgStatus('err', '请填写访问令牌'); return; }
      }
      S.saveCfg(c);
      WB.gh.restartPoll();
      closeCfg();                          // 配置已保存立即关窗，同步结果用通知提示
      if (WB.gh.cfgValid()) {
        WB.util.toast('正在同步到 GitHub…', 'info', 1500);
        const ok = await WB.gh.sync({});
        if (ok !== false) WB.util.toast('同步完成，已写入 ' + c.repo, 'ok', 2600);
        // 失败提示由 sync 内部 toast 发出
      } else {
        paintSync({ state: 'off' });
        WB.util.toast('已切换为本地模式，数据仅保存在本机', 'info', 2200);
      }
    });

    $('#btnExport').addEventListener('click', () => {
      const blob = new Blob([S.serialize()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'workbench-' + U.todayStr() + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$('#cfgMask').hidden) closeCfg();
    });
  }

  function openCfg() {
    const c = S.cfg, D = S.DEFAULT_CFG;
    $('#cfgRepo').value = c.repo || D.repo;
    $('#cfgBranch').value = c.branch || D.branch;
    $('#cfgPath').value = c.path || D.path;
    $('#cfgToken').value = c.token || '';
    $('#cfgApiBase').value = c.apiBase || '';
    $('#cfgPoll').value = c.poll || 20;
    $('#cfgEnabled').checked = !!c.enabled;
    $('#cfgStatus').className = 'cfg-status';
    $('#cfgDiag').hidden = true;
    $('#cfgDiag').innerHTML = '';
    $('#cfgMask').hidden = false;
  }

  function closeCfg() { $('#cfgMask').hidden = true; }

  function readCfg() {
    return {
      repo: $('#cfgRepo').value.trim() || S.DEFAULT_CFG.repo,
      branch: $('#cfgBranch').value.trim() || S.DEFAULT_CFG.branch,
      path: ($('#cfgPath').value.trim() || S.DEFAULT_CFG.path).replace(/^\/+/, ''),
      token: $('#cfgToken').value.trim(),
      apiBase: $('#cfgApiBase').value.trim().replace(/\/+$/, ''),
      poll: Math.max(5, Math.min(300, Number($('#cfgPoll').value) || 20)),
      enabled: $('#cfgEnabled').checked
    };
  }

  /* 诊断结果一行：ok=true 通过 / false 失败 / null 进行中 */
  function addDiagRow(box, ok, name, msg) {
    const row = document.createElement('div');
    row.className = 'diag-row ' + (ok === null ? 'run' : ok ? 'ok' : 'err');
    const ico = document.createElement('span');
    ico.className = 'diag-ico';
    ico.textContent = ok === null ? '⋯' : ok ? '✓' : '✕';
    const body = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = name;
    body.appendChild(b);
    if (msg) {
      const p = document.createElement('p');
      p.textContent = msg;
      body.appendChild(p);
    }
    row.appendChild(ico);
    row.appendChild(body);
    box.appendChild(row);
  }

  function showCfgStatus(kind, msg) {
    const box = $('#cfgStatus');
    box.className = 'cfg-status show ' + kind;
    box.textContent = msg;
  }

  /* ---------------- 示例数据 ---------------- */
  function seed() {
    const n2 = S.addNote({
      title: '周会纪要',
      content: '## 结论\n\n- 下周进入联调阶段\n- 指标口径统一走 [[指标口径说明]]\n\n相关排期见 [[Q3 规划]]。'
    });
    const n3 = S.addNote({
      title: '指标口径说明',
      content: '日活按**自然日去重设备数**统计。\n\n- 统计时区：UTC+8\n- 排除内部测试账号\n\n> 变更需在 [[周会纪要]] 同步。'
    });
    const n1 = S.addNote({
      title: 'Q3 规划',
      content: '# Q3 规划\n\n三条主线：\n\n1. 数据看板重构\n2. 移动端体验优化\n3. 同步链路稳定性\n\n口径参考 [[指标口径说明]]，进展在 [[周会纪要]] 里跟踪。'
    });
    S.addTodo({ title: '整理 Q3 规划初稿', color: 'red', status: 'doing', desc: '拆到周维度，明确每条主线的负责人和验收标准。' });
    S.addTodo({ title: '和数据同学对齐指标口径', color: 'amber', status: 'todo' });
    S.addTodo({ title: '配置 GitHub 同步，验证多端一致', color: 'blue', status: 'todo', desc: '右上角齿轮 → 填仓库和 Token → 测试连接。' });
    S.addTodo({ title: '搭好工作台', color: 'green', status: 'done' });
  }

  WB.app = { boot, go, openNote, renderAll };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.WB);
