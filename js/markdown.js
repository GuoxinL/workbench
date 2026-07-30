/* ============================================================
 * markdown.js —— 轻量 Markdown 渲染 + [[双向链接]] 解析
 *   不依赖任何第三方库，输出前统一转义，避免 XSS
 * ============================================================ */
(function (WB) {
  const U = WB.util;

  const WIKI_RE = /\[\[([^\[\]|]+?)(?:\|([^\[\]]+?))?\]\]/g;

  /* 提取正文中的所有 [[引用]]，返回 [{target, alias, raw}] */
  function extractLinks(content) {
    const out = [];
    const seen = {};
    let m;
    WIKI_RE.lastIndex = 0;
    while ((m = WIKI_RE.exec(content || '')) !== null) {
      const target = m[1].trim();
      if (!target) continue;
      const key = U.slug(target);
      if (seen[key]) continue;
      seen[key] = 1;
      out.push({ target, alias: (m[2] || '').trim(), raw: m[0] });
    }
    return out;
  }

  /* 取引用点周围的上下文片段，用于反链列表展示 */
  function linkContext(content, targetTitle) {
    const key = U.slug(targetTitle);
    const lines = String(content || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      WIKI_RE.lastIndex = 0;
      let m;
      while ((m = WIKI_RE.exec(lines[i])) !== null) {
        if (U.slug(m[1].trim()) === key) {
          return U.truncate(lines[i].replace(WIKI_RE, (_, t, a) => (a || t)), 60);
        }
      }
    }
    return '';
  }

  /* 行内渲染 */
  function inline(text, resolver) {
    let s = U.esc(text);

    // 行内代码先占位，避免内部内容被其它规则处理
    const codes = [];
    s = s.replace(/`([^`]+?)`/g, (_, c) => {
      codes.push(c);
      return '\u0000CODE' + (codes.length - 1) + '\u0000';
    });

    // [[wiki 链接]]（此时已转义，方括号未被转义）
    s = s.replace(/\[\[([^\[\]|]+?)(?:\|([^\[\]]+?))?\]\]/g, (raw, t, a) => {
      const target = t.trim();
      const label = (a || t).trim();
      const exists = resolver ? resolver(target) : true;
      return `<a class="wikilink${exists ? '' : ' missing'}" data-wiki="${target.replace(/"/g, '&quot;')}" href="javascript:void(0)">${label}</a>`;
    });

    // 图片
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g,
      '<img src="$2" alt="$1" style="max-width:100%;border-radius:8px;">');
    // 普通链接
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // 裸链接
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g,
      '$1<a href="$2" target="_blank" rel="noopener">$2</a>');

    // 强调
    s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+?)\*/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+?)~~/g, '<del>$1</del>');
    s = s.replace(/==([^=]+?)==/g, '<mark>$1</mark>');

    // 还原行内代码
    s = s.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => '<code>' + codes[i] + '</code>');
    return s;
  }

  /* 块级渲染 */
  function render(content, resolver) {
    const src = String(content || '').replace(/\r\n/g, '\n');
    const lines = src.split('\n');
    const out = [];
    let i = 0;

    function flushList(type, items) {
      out.push('<' + type + '>' + items.join('') + '</' + type + '>');
    }

    while (i < lines.length) {
      const line = lines[i];

      // 代码块
      if (/^```/.test(line)) {
        const lang = line.slice(3).trim();
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out.push('<pre><code data-lang="' + U.esc(lang) + '">' + U.esc(buf.join('\n')) + '</code></pre>');
        continue;
      }

      // 分隔线
      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

      // 标题
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        const lv = Math.min(h[1].length, 3);
        out.push(`<h${lv}>${inline(h[2], resolver)}</h${lv}>`);
        i++; continue;
      }

      // 引用
      if (/^>\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
        out.push('<blockquote>' + render(buf.join('\n'), resolver) + '</blockquote>');
        continue;
      }

      // 表格
      if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
        const head = splitRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) {
          rows.push(splitRow(lines[i])); i++;
        }
        out.push('<table><thead><tr>' +
          head.map(c => '<th>' + inline(c, resolver) + '</th>').join('') +
          '</tr></thead><tbody>' +
          rows.map(r => '<tr>' + r.map(c => '<td>' + inline(c, resolver) + '</td>').join('') + '</tr>').join('') +
          '</tbody></table>');
        continue;
      }

      // 任务列表 / 无序列表
      if (/^\s*[-*+]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          let t = lines[i].replace(/^\s*[-*+]\s+/, '');
          const task = t.match(/^\[([ xX])\]\s*(.*)$/);
          if (task) {
            items.push('<li class="task"><input type="checkbox" disabled' +
              (task[1].toLowerCase() === 'x' ? ' checked' : '') + '>' +
              inline(task[2], resolver) + '</li>');
          } else {
            items.push('<li>' + inline(t, resolver) + '</li>');
          }
          i++;
        }
        flushList('ul', items);
        continue;
      }

      // 有序列表
      if (/^\s*\d+[.)]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          items.push('<li>' + inline(lines[i].replace(/^\s*\d+[.)]\s+/, ''), resolver) + '</li>');
          i++;
        }
        flushList('ol', items);
        continue;
      }

      // 空行
      if (!line.trim()) { i++; continue; }

      // 段落
      const buf = [];
      while (i < lines.length && lines[i].trim() &&
        !/^(#{1,6}\s|>|\s*[-*+]\s|\s*\d+[.)]\s|```)/.test(lines[i]) &&
        !/^\s*([-*_])\1{2,}\s*$/.test(lines[i])) {
        buf.push(lines[i]); i++;
      }
      if (buf.length) out.push('<p>' + inline(buf.join('\n'), resolver).replace(/\n/g, '<br>') + '</p>');
    }

    return out.join('\n');
  }

  function splitRow(line) {
    return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(s => s.trim());
  }

  /* 纯文本摘要 */
  function plain(content, n) {
    return U.truncate(String(content || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\[\[([^\[\]|]+?)(?:\|([^\[\]]+?))?\]\]/g, (_, t, a) => a || t)
      .replace(/[#>*`_~\-]+/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'), n || 60);
  }

  WB.md = { render, inline, extractLinks, linkContext, plain };
})(window.WB);
