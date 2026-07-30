/* ============================================================
 * github.js —— GitHub 实时同步引擎
 *   拉取：GET  /repos/{owner}/{repo}/contents/{path}?ref={branch}
 *   推送：PUT  同上（带 sha 做乐观锁）
 *   冲突：409/422 时重新拉取 → 逐条 LWW 合并 → 重试（最多 3 次）
 *   实时：本地变更防抖 1.5s 推送 + 定时轮询拉取 + 回到前台立即同步
 * ============================================================ */
(function (WB) {
  const U = WB.util;
  const S = WB.store;
  const DEFAULT_API = 'https://api.github.com';

  /* API 根地址：默认官方，可在设置里换成自建/第三方代理（用于官方域名不可达的网络） */
  function API_BASE(c) {
    c = c || S.cfg;
    const b = (c && c.apiBase || '').trim().replace(/\/+$/, '');
    return b || DEFAULT_API;
  }

  let state = 'idle';        // idle | syncing | ok | error | off
  let lastSha = null;
  let lastSyncAt = 0;
  let lastError = '';
  let pollTimer = null;
  let running = false;       // 互斥，避免并发推送

  function setState(s, err) {
    state = s;
    lastError = err || '';
    S.emit('sync', { state: s, error: lastError, at: lastSyncAt });
  }

  function cfgValid(c) {
    c = c || S.cfg;
    return !!(c.enabled && c.repo && /^[^/\s]+\/[^/\s]+$/.test(c.repo.trim()) && c.token && c.path);
  }

  function apiUrl(c, extra) {
    const [owner, repo] = c.repo.trim().split('/');
    const path = c.path.trim().replace(/^\/+/, '');
    return `${API_BASE(c)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}${extra || ''}`;
  }

  function headers(c) {
    return {
      'Authorization': 'Bearer ' + c.token.trim(),
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  function host(u) {
    try { return new URL(u).host; } catch (e) { return 'GitHub API'; }
  }

  /* 带超时的 fetch：网络不可达时避免请求无限挂起 */
  async function req(url, init, ms) {
    ms = ms || 12000;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, Object.assign({ signal: ctrl.signal }, init));
    } catch (e) {
      if (e && e.name === 'AbortError') {
        const err = new Error('连接超时（' + (ms / 1000) + ' 秒未响应）：当前网络到 ' + host(url) + ' 不通，建议在设置里填写 API 代理地址');
        err.net = true;
        throw err;
      }
      // fetch 在网络不可达 / DNS 失败 / 被 CORS 拒绝时抛 TypeError，原文是英文的 "Failed to fetch"
      // 用 name 而非 instanceof：fetch 若来自其它 realm（polyfill、扩展注入），instanceof 会失效
      const raw = (e && e.message) || '';
      if ((e && e.name === 'TypeError') || /failed to fetch|networkerror|load failed|network request failed/i.test(raw)) {
        const err = new Error('无法连接 ' + host(url) + '：网络被阻断、域名解析失败或跨域被拒。若你所在网络访问不了 GitHub，请在设置里填写 API 代理地址');
        err.net = true;
        throw err;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async function readErr(res) {
    let msg = res.status + ' ' + res.statusText;
    try {
      const j = await res.json();
      if (j && j.message) msg = j.message;
      if (res.status === 401) msg = 'Token 无效或已过期';
      if (res.status === 403 && /rate limit/i.test(j.message || '')) msg = 'API 调用频率超限，请稍后再试';
      if (res.status === 404) msg = '仓库或分支不存在，或 Token 无该仓库权限';
    } catch (e) { }
    return msg;
  }

  /* ---------- 拉取远端 ---------- */
  async function fetchRemote(c) {
    c = c || S.cfg;
    const url = apiUrl(c, '?ref=' + encodeURIComponent(c.branch || 'main') + '&t=' + Date.now());
    const res = await req(url, { headers: headers(c), cache: 'no-store' });

    if (res.status === 404) return { exists: false, data: null, sha: null };
    if (!res.ok) throw new Error(await readErr(res));

    const j = await res.json();
    let parsed = null;
    try {
      parsed = JSON.parse(U.b64Decode(j.content || ''));
    } catch (e) {
      throw new Error('远端数据文件不是合法 JSON，请检查 ' + c.path);
    }
    return { exists: true, data: parsed, sha: j.sha };
  }

  /* ---------- 推送 ---------- */
  async function pushRemote(c, contentStr, sha, message) {
    const body = {
      message: message || ('workbench: sync ' + new Date().toLocaleString('zh-CN')),
      content: U.b64Encode(contentStr),
      branch: (c.branch || 'main').trim()
    };
    if (sha) body.sha = sha;

    const res = await req(apiUrl(c), {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers(c)),
      body: JSON.stringify(body)
    });

    if (res.status === 409 || res.status === 422) {
      const e = new Error('conflict');
      e.conflict = true;
      throw e;
    }
    if (!res.ok) throw new Error(await readErr(res));

    const j = await res.json();
    return j.content && j.content.sha;
  }

  /* ---------- 核心：一次完整同步 ---------- */
  async function sync(opts) {
    opts = opts || {};
    const c = S.cfg;

    if (!cfgValid(c)) { setState('off'); return false; }
    if (running) return false;

    running = true;
    setState('syncing');

    try {
      let attempt = 0;
      while (attempt < 3) {
        attempt++;

        const remote = await fetchRemote(c);

        // 1) 远端内容并入本地
        let merged = false;
        if (remote.exists && remote.data) {
          merged = S.mergeInto(remote.data);
        }

        // 2) 是否需要把本地推上去
        const needPush = !remote.exists ||
          S.dirty ||
          S.diffFromRemote(remote.data || { todos: [], notes: [] });

        if (!needPush) {
          lastSha = remote.sha;
          lastSyncAt = Date.now();
          S.setDirty(false);
          setState('ok');
          running = false;
          return merged;
        }

        try {
          const newSha = await pushRemote(c, S.serialize(), remote.sha, opts.message);
          lastSha = newSha || remote.sha;
          lastSyncAt = Date.now();
          S.setDirty(false);
          setState('ok');
          running = false;
          return true;
        } catch (e) {
          if (e.conflict && attempt < 3) {
            // 远端在我们读取后又被别的端改了 —— 重新拉取合并再试
            await new Promise(r => setTimeout(r, 350 * attempt));
            continue;
          }
          throw e;
        }
      }
      throw new Error('多次提交冲突，已放弃本次同步');
    } catch (e) {
      running = false;
      lastError = e.message || String(e);
      setState('error', lastError);
      if (!opts.silent) U.toast('同步失败：' + lastError, 'err', 3200);
      return false;
    }
  }

  /* ---------- 防抖推送 ---------- */
  const schedulePush = U.debounce(() => { sync({ silent: true }); }, 1500);

  /* ---------- 轮询 ---------- */
  function restartPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    const c = S.cfg;
    if (!cfgValid(c)) { setState('off'); return; }
    const sec = Math.max(5, Math.min(300, Number(c.poll) || 20));
    pollTimer = setInterval(() => {
      if (document.hidden) return;
      sync({ silent: true });
    }, sec * 1000);
  }

  /* ---------- 连接测试 ---------- */
  async function test(c) {
    if (!/^[^/\s]+\/[^/\s]+$/.test((c.repo || '').trim())) {
      return { ok: false, msg: '仓库格式应为 owner/repo' };
    }
    if (!c.token) return { ok: false, msg: '请填写访问令牌' };

    try {
      const [owner, repo] = c.repo.trim().split('/');
      const r = await req(`${API_BASE(c)}/repos/${owner}/${repo}`, { headers: headers(c) });
      if (!r.ok) return { ok: false, msg: await readErr(r) };
      const info = await r.json();

      if (info.permissions && info.permissions.push === false) {
        return { ok: false, msg: 'Token 对该仓库没有写入权限' };
      }

      const remote = await fetchRemote(c);
      const cnt = remote.exists && remote.data
        ? `远端已有 ${(remote.data.todos || []).length} 条待办、${(remote.data.notes || []).length} 篇笔记`
        : '远端数据文件尚未创建，首次同步时会自动生成';

      return {
        ok: true,
        msg: `连接成功 · ${info.full_name}（${info.private ? '私有' : '公开'}仓库）\n${cnt}`
      };
    } catch (e) {
      return { ok: false, msg: e.message || String(e) };
    }
  }

  /* ---------- 逐项诊断：把「同步失败」拆成可定位的步骤 ---------- */
  async function diagnose(c, onStep) {
    c = c || S.cfg;
    const out = [];
    const step = (name, ok, msg) => {
      const it = { name, ok, msg };
      out.push(it);
      if (onStep) onStep(it, out);
      return it;
    };
    const base = API_BASE(c);
    const usingProxy = base !== DEFAULT_API;

    // 1) 配置完整性
    if (!/^[^/\s]+\/[^/\s]+$/.test((c.repo || '').trim())) {
      step('配置检查', false, '仓库格式应为 owner/repo，当前为「' + (c.repo || '空') + '」');
      return out;
    }
    if (!c.token) { step('配置检查', false, '未填写访问令牌'); return out; }
    if (!c.path) { step('配置检查', false, '未填写数据文件路径'); return out; }
    step('配置检查', true, `${c.repo} · ${c.branch || 'main'} 分支 · ${c.path}`);

    // 2) 网络可达性（不带 token，纯测通不通）
    try {
      const r = await req(base + '/', { cache: 'no-store' }, 10000);
      if (r.status >= 500) {
        step('网络连通', false, `${host(base)} 返回 ${r.status}，代理服务本身异常`);
        return out;
      }
      step('网络连通', true, `${host(base)} 可访问${usingProxy ? '（经代理）' : ''}`);
    } catch (e) {
      step('网络连通', false, e.message + (usingProxy ? '' : '\n→ 这是你同步失败的根因。需要在下方「API 代理地址」填一个能访问的中转地址。'));
      return out;
    }

    // 3) 令牌有效性
    let scopeHint = '';
    try {
      const r = await req(base + '/rate_limit', { headers: headers(c), cache: 'no-store' }, 10000);
      if (r.status === 401) { step('令牌有效性', false, 'Token 无效或已过期，需重新生成'); return out; }
      if (!r.ok) { step('令牌有效性', false, await readErr(r)); return out; }
      const sc = r.headers.get('x-oauth-scopes');
      if (sc) scopeHint = '，权限范围：' + (sc || '（细粒度令牌）');
      step('令牌有效性', true, 'Token 被 GitHub 接受' + scopeHint);
    } catch (e) {
      step('令牌有效性', false, e.message);
      return out;
    }

    // 4) 仓库访问与写权限
    const [owner, repo] = c.repo.trim().split('/');
    try {
      const r = await req(`${base}/repos/${owner}/${repo}`, { headers: headers(c) }, 10000);
      if (r.status === 404) {
        step('仓库访问', false, '找不到仓库 ' + c.repo + '。可能仓库名写错，或令牌未授权访问这个仓库（细粒度令牌需在 Repository access 里勾选它）');
        return out;
      }
      if (!r.ok) { step('仓库访问', false, await readErr(r)); return out; }
      const info = await r.json();
      if (info.permissions && info.permissions.push === false) {
        step('仓库访问', false, `能读取 ${info.full_name}，但令牌没有写入权限（需 Contents: Read and write）`);
        return out;
      }
      step('仓库访问', true, `${info.full_name}（${info.private ? '私有' : '公开'}）· 可写`);
    } catch (e) {
      step('仓库访问', false, e.message);
      return out;
    }

    // 5) 数据文件
    try {
      const remote = await fetchRemote(c);
      if (!remote.exists) {
        step('数据文件', true, `${c.path} 尚未创建，首次同步会自动生成`);
      } else {
        const t = (remote.data && remote.data.todos || []).length;
        const n = (remote.data && remote.data.notes || []).length;
        step('数据文件', true, `已存在，含 ${t} 条待办、${n} 篇笔记`);
      }
    } catch (e) {
      step('数据文件', false, e.message);
      return out;
    }

    return out;
  }

  function status() {
    return { state, lastSyncAt, lastError, valid: cfgValid() };
  }

  WB.gh = { sync, schedulePush, restartPoll, test, status, cfgValid, fetchRemote, diagnose, DEFAULT_API };
})(window.WB);
