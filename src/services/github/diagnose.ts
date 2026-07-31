import type { Config } from '@/types'

export interface DiagStep {
  name: string
  ok: boolean
  detail: string
}

export interface ConnResult {
  ok: boolean
  code?: string
  message: string
  canPush?: boolean
}

function repoApi(config: Config): string {
  return `${config.apiBase}/repos/${config.repo}`
}

async function repoFetch(config: Config, sub: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 12000)
  try {
    return await fetch(`${repoApi(config)}/${sub}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github+json',
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(t)
  }
}

/** S17：测试连接并校验 push 权限。 */
export async function testConnection(config: Config): Promise<ConnResult> {
  let res: Response
  try {
    res = await repoFetch(config, '')
  } catch (e) {
    const err = e as Error
    return { ok: false, code: 'network', message: err.name === 'AbortError' ? '请求超时' : '网络错误' }
  }
  const data = res.status !== 204 ? await res.json().catch(() => null) : null
  if (!res.ok) {
    const code = res.status === 401 ? 'token' : res.status === 403 || res.status === 429 ? 'ratelimit' : res.status === 404 ? 'notfound' : 'http'
    return { ok: false, code, message: data?.message ?? `HTTP ${res.status}` }
  }
  return { ok: true, message: '连接成功', canPush: !!data?.permissions?.push }
}

/** S18：五步诊断——逐步返回步骤状态，失败即中断。 */
export async function runDiagnose(config: Config): Promise<DiagStep[]> {
  const steps: DiagStep[] = []

  const cfgOk = !!config.repo && config.repo.includes('/') && !!config.token && !!config.branch && !!config.apiBase
  steps.push({ name: '配置检查', ok: cfgOk, detail: cfgOk ? '仓库 / 令牌 / 分支 已填写' : '请填写 owner/repo、分支与令牌' })
  if (!cfgOk) return steps

  const conn = await testConnection(config)
  steps.push({ name: '网络连通', ok: conn.ok || conn.code === 'token', detail: conn.ok ? '可达 GitHub API' : conn.message })
  if (!conn.ok && conn.code !== 'token') return steps

  steps.push({
    name: '令牌有效性',
    ok: conn.ok || conn.code !== 'token',
    detail: conn.ok ? '令牌有效' : conn.code === 'token' ? '令牌失效或无效' : conn.message,
  })
  if (!conn.ok) return steps

  steps.push({
    name: '仓库访问与写权限',
    ok: !!conn.canPush,
    detail: conn.canPush ? '具备 push 权限' : '令牌缺少仓库写权限（需 repo 权限）',
  })
  if (!conn.canPush) return steps

  try {
    const res = await repoFetch(config, `contents/manifest.json?ref=${encodeURIComponent(config.branch)}`)
    if (res.status === 200) steps.push({ name: '数据文件', ok: true, detail: '已存在 manifest.json' })
    else if (res.status === 404) steps.push({ name: '数据文件', ok: true, detail: '尚未创建，首次同步将写入' })
    else steps.push({ name: '数据文件', ok: false, detail: `检查失败 HTTP ${res.status}` })
  } catch {
    steps.push({ name: '数据文件', ok: false, detail: '网络错误' })
  }
  return steps
}
