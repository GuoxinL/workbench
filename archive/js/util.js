/* ============================================================
 * util.js —— 基础工具
 * ============================================================ */
window.WB = window.WB || {};

WB.util = (function () {

  /* ---------- ID / 时间 ---------- */
  function uid(prefix) {
    return (prefix || 'id') + '_' +
      Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
  }

  function now() { return Date.now(); }

  function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const diff = Date.now() - ts;
    if (diff < 60e3) return '刚刚';
    if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分钟前';
    if (diff < 86400e3) return Math.floor(diff / 3600e3) + ' 小时前';
    if (diff < 7 * 86400e3) return Math.floor(diff / 86400e3) + ' 天前';
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  }

  function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }

  function p2(n) { return n < 10 ? '0' + n : '' + n; }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  }

  /* ---------- DOM ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') n.className = attrs[k];
        else if (k === 'text') n.textContent = attrs[k];
        else if (k === 'html') n.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) n.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach(c => { if (c) n.appendChild(c); });
    return n;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- 函数工具 ---------- */
  function debounce(fn, wait) {
    let t = null;
    const wrapped = function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => { t = null; fn.apply(ctx, args); }, wait);
    };
    wrapped.cancel = () => { clearTimeout(t); t = null; };
    // 无条件立即执行：调用方（如编辑器提交）内部自带「无变化则不写」保护，
    // 这样切换笔记 / 关闭页面时一定不会丢内容
    wrapped.flushNow = function () {
      clearTimeout(t); t = null;
      fn.apply(this, arguments);
    };
    wrapped.pending = () => t !== null;
    return wrapped;
  }

  /* ---------- Base64（UTF-8 安全，分块避免栈溢出） ---------- */
  function b64Encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(bin);
  }

  function b64Decode(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* ---------- Toast ---------- */
  let toastWrap = null;
  function toast(msg, type, ms) {
    if (!toastWrap) toastWrap = $('#toastWrap');
    if (!toastWrap) return;
    const t = el('div', { class: 'toast' + (type ? ' ' + type : ''), text: msg });
    toastWrap.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity .25s, transform .25s';
      t.style.opacity = '0';
      t.style.transform = 'translateY(6px)';
      setTimeout(() => t.remove(), 260);
    }, ms || 2200);
  }

  /* ---------- 文本 ---------- */
  function slug(s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function truncate(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  return {
    uid, now, fmtTime, fmtDate, todayStr, p2,
    $, $$, el, esc,
    debounce, b64Encode, b64Decode, toast, slug, truncate
  };
})();
