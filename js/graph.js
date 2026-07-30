/* ============================================================
 * graph.js —— 笔记关联图谱（无依赖力导向布局）
 * ============================================================ */
(function (WB) {
  const U = WB.util, S = WB.store;
  const $ = U.$;
  const NS = 'http://www.w3.org/2000/svg';

  let nodes = [], edges = [], raf = null, ticks = 0;
  let drag = null, view = { x: 0, y: 0, k: 1 };
  let built = '';   // 上次构建的数据指纹，避免无谓重排

  function init() {
    $('#btnRelayout').addEventListener('click', () => { built = ''; render(true); });

    const svg = $('#graphSvg');
    svg.addEventListener('mousedown', onDown);
    svg.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    svg.addEventListener('touchstart', e => onDown(touchPt(e)), { passive: true });
    svg.addEventListener('touchmove', e => { if (drag) { e.preventDefault(); onMove(touchPt(e)); } }, { passive: false });
    window.addEventListener('touchend', onUp);
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      const k = Math.max(.4, Math.min(2.4, view.k * (e.deltaY > 0 ? .92 : 1.08)));
      view.k = k; draw();
    }, { passive: false });
  }

  function touchPt(e) {
    const t = e.touches[0] || e.changedTouches[0];
    return { clientX: t.clientX, clientY: t.clientY, target: e.target, preventDefault() { } };
  }

  function fingerprint(g) {
    return g.notes.map(n => n.id + ':' + (g.outMap[n.id] || []).map(x => x.id).join(',')).join('|');
  }

  function render(force) {
    const wrap = $('#graphWrap');
    if (!wrap || !wrap.offsetWidth) return;

    const g = WB.notes.buildGraph();
    const fp = fingerprint(g);
    if (!force && fp === built && nodes.length) { draw(); return; }
    built = fp;

    const W = wrap.clientWidth, H = wrap.clientHeight;
    const prev = {};
    nodes.forEach(n => prev[n.id] = n);

    nodes = g.notes.map((n, i) => {
      const old = prev[n.id];
      const ang = (i / Math.max(1, g.notes.length)) * Math.PI * 2;
      return {
        id: n.id, title: n.title,
        x: old ? old.x : W / 2 + Math.cos(ang) * Math.min(W, H) * 0.28,
        y: old ? old.y : H / 2 + Math.sin(ang) * Math.min(W, H) * 0.28,
        vx: 0, vy: 0,
        deg: (g.outMap[n.id] || []).length + (g.inMap[n.id] || []).length
      };
    });

    const idx = {};
    nodes.forEach((n, i) => idx[n.id] = i);
    edges = [];
    g.notes.forEach(src => {
      (g.outMap[src.id] || []).forEach(t => {
        edges.push({ s: idx[src.id], t: idx[t.id] });
      });
    });

    $('#graphEmpty').hidden = nodes.length > 0;
    if (!nodes.length) { $('#graphSvg').innerHTML = ''; return; }

    ticks = 0;
    startSim();
  }

  function startSim() {
    if (raf) cancelAnimationFrame(raf);
    const wrap = $('#graphWrap');
    const W = wrap.clientWidth, H = wrap.clientHeight;

    function step() {
      const K = 118;                       // 期望边长
      // 斥力
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) { d2 = 1; dx = Math.random() - .5; dy = Math.random() - .5; }
          const d = Math.sqrt(d2);
          const f = (K * K * 1.15) / d2;
          const fx = (dx / d) * f, fy = (dy / d) * f;
          a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
        }
      }
      // 引力
      edges.forEach(e => {
        const a = nodes[e.s], b = nodes[e.t];
        if (!a || !b) return;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const f = (d - K) * 0.035;
        const fx = (dx / d) * f * d * 0.06, fy = (dy / d) * f * d * 0.06;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      });
      // 向心 + 阻尼
      nodes.forEach(n => {
        n.vx += (W / 2 - n.x) * 0.006;
        n.vy += (H / 2 - n.y) * 0.006;
        if (drag && drag.node === n) { n.vx = n.vy = 0; return; }
        n.vx *= 0.82; n.vy *= 0.82;
        n.x += Math.max(-18, Math.min(18, n.vx));
        n.y += Math.max(-18, Math.min(18, n.vy));
        n.x = Math.max(46, Math.min(W - 46, n.x));
        n.y = Math.max(30, Math.min(H - 30, n.y));
      });

      draw();
      ticks++;
      if (ticks < 260) raf = requestAnimationFrame(step);
      else raf = null;
    }
    raf = requestAnimationFrame(step);
  }

  function draw() {
    const svg = $('#graphSvg');
    if (!svg) return;
    const parts = [];
    parts.push(`<g transform="translate(${view.x},${view.y}) scale(${view.k})">`);

    edges.forEach(e => {
      const a = nodes[e.s], b = nodes[e.t];
      if (!a || !b) return;
      parts.push(`<line class="gedge" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" marker-end="url(#arw)"/>`);
    });

    nodes.forEach((n, i) => {
      const r = 8 + Math.min(11, n.deg * 2.2);
      parts.push(
        `<g class="gnode" data-i="${i}" transform="translate(${n.x.toFixed(1)},${n.y.toFixed(1)})">` +
        `<circle r="${r}"></circle>` +
        `<text y="${r + 14}">${U.esc(U.truncate(n.title, 12))}</text>` +
        `</g>`
      );
    });
    parts.push('</g>');

    svg.innerHTML =
      `<defs><marker id="arw" viewBox="0 0 10 10" refX="20" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
         <path d="M 0 0 L 10 5 L 0 10 z" fill="#c4c9d2"/></marker></defs>` + parts.join('');
  }

  /* ---------------- 交互 ---------------- */
  function onDown(e) {
    const g = e.target.closest ? e.target.closest('.gnode') : null;
    const svg = $('#graphSvg');
    const rect = svg.getBoundingClientRect();
    const px = (e.clientX - rect.left - view.x) / view.k;
    const py = (e.clientY - rect.top - view.y) / view.k;

    if (g) {
      const n = nodes[+g.dataset.i];
      drag = { node: n, dx: px - n.x, dy: py - n.y, moved: false, startX: e.clientX, startY: e.clientY };
    } else {
      drag = { pan: true, startX: e.clientX - view.x, startY: e.clientY - view.y, moved: false };
    }
  }

  function onMove(e) {
    if (!drag) return;
    const svg = $('#graphSvg');
    const rect = svg.getBoundingClientRect();

    if (drag.pan) {
      view.x = e.clientX - drag.startX;
      view.y = e.clientY - drag.startY;
      drag.moved = true;
      draw();
      return;
    }
    const px = (e.clientX - rect.left - view.x) / view.k;
    const py = (e.clientY - rect.top - view.y) / view.k;
    drag.node.x = px - drag.dx;
    drag.node.y = py - drag.dy;
    drag.moved = Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) > 4;
    if (!raf) { ticks = 200; startSim(); }
  }

  function onUp(e) {
    if (drag && drag.node && !drag.moved) {
      WB.app.openNote(drag.node.id);
    }
    drag = null;
  }

  WB.graph = { init, render };
})(window.WB);
