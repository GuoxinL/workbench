/* ============================================================
 * GitHub API 中转 —— Cloudflare Worker 版
 *
 * 用途：当你的网络访问不了 api.github.com 时，用它做中转。
 *      令牌只经过你自己的 Worker，不流向任何第三方。
 *
 * 部署（约 3 分钟）：
 *   1. 登录 dash.cloudflare.com → Workers & Pages → Create → Worker
 *   2. 把本文件全部内容粘贴进编辑器，Deploy
 *   3. 拿到形如 https://xxx.your-name.workers.dev 的地址
 *   4. 填进工作台「设置 → API 代理地址」，点「诊断」验证
 *
 * 注意：workers.dev 默认域名在部分网络同样受限。若不通，
 *      在 Worker 的 Settings → Domains & Routes 绑定你自己的域名。
 * ============================================================ */

const UPSTREAM = 'https://api.github.com';

/* 只放行工作台会用到的接口，避免 Worker 被当成公共代理滥用 */
const ALLOW = [
  /^\/rate_limit$/,
  /^\/repos\/[^/]+\/[^/]+$/,
  /^\/repos\/[^/]+\/[^/]+\/contents\//,
  /^\/$/
];

/* 建议改成你自己的站点，限制谁能调用这个 Worker。
   留空数组表示允许任何来源（方便但不够严格）。 */
const ALLOW_ORIGINS = [
  'https://guoxinl.github.io'
];

function corsHeaders(origin) {
  const allowed = ALLOW_ORIGINS.length === 0 || ALLOW_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? (origin || '*') : ALLOW_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Accept,X-GitHub-Api-Version',
    'Access-Control-Expose-Headers': 'x-oauth-scopes,x-ratelimit-remaining,etag',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    // 预检：带 Authorization 头的跨域请求一定会先发 OPTIONS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (ALLOW_ORIGINS.length && origin && !ALLOW_ORIGINS.includes(origin)) {
      return new Response(JSON.stringify({ message: '来源未被允许：' + origin }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(request.url);
    if (!ALLOW.some(re => re.test(url.pathname))) {
      return new Response(JSON.stringify({ message: '该接口未在代理白名单内：' + url.pathname }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const target = UPSTREAM + url.pathname + url.search;

    // 原样透传认证信息，Worker 自身不存储、不记录令牌
    const headers = new Headers();
    ['Authorization', 'Accept', 'Content-Type', 'X-GitHub-Api-Version'].forEach(k => {
      const v = request.headers.get(k);
      if (v) headers.set(k, v);
    });
    headers.set('User-Agent', 'workbench-proxy');

    let upstream;
    try {
      upstream = await fetch(target, {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text(),
        redirect: 'follow'
      });
    } catch (e) {
      return new Response(JSON.stringify({ message: '中转到 GitHub 失败：' + e.message }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const out = new Headers(upstream.headers);
    Object.entries(cors).forEach(([k, v]) => out.set(k, v));
    out.delete('content-encoding');
    out.delete('content-length');

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: out
    });
  }
};
