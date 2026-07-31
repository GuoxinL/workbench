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

/* 显式放行的站点来源（协议+域名+端口需完全匹配）。
   留空数组 [] 表示允许任何来源（方便但不够严格，仅建议个人自用）。 */
const ALLOW_ORIGINS = [
  'https://guoxinl.github.io'
  // 在此追加你自己的 GitHub Pages / 自定义域名，例如：
  // 'https://your-name.github.io',
  // 'https://wb.example.com',
];

/**
 * 来源是否允许调用本 Worker。
 * 除显式列表外，默认放行两类常见场景，避免「本地开发/预览」与「任意 GitHub Pages」
 * 被 CORS 拒绝后浏览器吞掉真实错误、只报「网络错误」：
 *  - http(s)://localhost 或 127.0.0.1（任意端口）：本地 `npm run dev` / `python3 -m http.server` 等
 *  - https://*.github.io：GitHub Pages 任意用户站点
 */
function originAllowed(origin) {
  if (!origin) return true;
  if (ALLOW_ORIGINS.includes(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  if (/^https:\/\/[\w-]+\.github\.io$/.test(origin)) return true;
  return false;
}

function corsHeaders(origin) {
  const allowed = originAllowed(origin);
  // 允许时回显请求来源（正确 CORS 写法）；拒绝时回退到首个显式来源，避免泄露其他来源
  return {
    'Access-Control-Allow-Origin': allowed ? (origin || '*') : (ALLOW_ORIGINS[0] || '*'),
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

    if (origin && !originAllowed(origin)) {
      // 回显来源，使浏览器能读取真实拒绝原因而非被 CORS 吞成「网络错误」
      const denyCors = { ...cors, 'Access-Control-Allow-Origin': origin };
      return new Response(JSON.stringify({ message: '来源未被允许：' + origin }), {
        status: 403,
        headers: { ...denyCors, 'Content-Type': 'application/json' }
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
