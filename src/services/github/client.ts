import type { Config } from '@/types'

export type GithubErrorCode = 'token' | 'ratelimit' | 'notfound' | 'http' | 'network'

/** 统一 GitHub API 错误，含中文化 code 与网络标记（对应 S13/S14）。 */
export class GithubError extends Error {
  status: number
  code: GithubErrorCode
  net: boolean
  constructor(message: string, status: number, code: GithubErrorCode, net = false) {
    super(message)
    this.name = 'GithubError'
    this.status = status
    this.code = code
    this.net = net
  }
}

/** 统一请求超时（对应 S12）。 */
export const REQUEST_TIMEOUT = 12000

function mapStatus(status: number): GithubErrorCode {
  if (status === 401) return 'token'
  if (status === 403 || status === 429) return 'ratelimit'
  if (status === 404) return 'notfound'
  return 'http'
}

export interface RequestInput {
  method?: string
  body?: unknown
}

export interface RequestResult {
  status: number
  data: any
  sha?: string
}

/**
 * 通用 GitHub Contents API 请求封装（经 Cloudflare Worker 代理）。
 * - 12s AbortController 超时（S12）
 * - 401/403/404 错误码中文化（S13）
 * - 网络错误用 `e.name === 'TypeError'`（跨 realm 安全）标记（S14）
 */
export async function githubRequest(
  path: string,
  opts: RequestInput,
  config: Config,
): Promise<RequestResult> {
  const base = (config.apiBase && config.apiBase.trim()) || 'https://api.github.com'
  const url = `${base}/repos/${config.repo}/contents/${path}?ref=${encodeURIComponent(config.branch)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github+json',
  }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
      // 关键：禁用 HTTP 缓存。同步用 blob sha 做乐观锁，若 GET（如冲突重试时的
      // 重新拉取、pushRemote 的 422 恢复 GET）命中缓存返回陈旧 sha，
      // 后续 PUT 会 409「sha 不匹配」→ 同步失败且无法自愈（孤儿文件越积越多）。
      cache: 'no-store',
    })
    let data: any = null
    if (res.status !== 204) {
      try {
        data = await res.json()
      } catch {
        /* 无响应体 */
      }
    }
    // 乐观锁 sha 必须取响应体里的裸 blob sha（data.sha）；etag 头带引号包裹（如 "abc…"）
    // 直接当作 sha 发给 PUT 会与 GitHub 侧不匹配 → 409 冲突，故不使用 etag。
    const sha = data?.sha ?? res.headers.get('x-github-sha') ?? undefined
    if (!res.ok) {
      const code = mapStatus(res.status)
      const msg = data?.message ?? `GitHub API ${res.status}`
      throw new GithubError(msg, res.status, code)
    }
    return { status: res.status, data, sha }
  } catch (e) {
    if (e instanceof GithubError) throw e
    const err = e as Error
    // fetch 可能来自其它 realm，instanceof 不可靠 → 用 name 判定（S14）
    if (err.name === 'TypeError') {
      throw new GithubError('网络错误（fetch 失败）', 0, 'network', true)
    }
    if (err.name === 'AbortError') {
      throw new GithubError('请求超时', 0, 'network', true)
    }
    throw new GithubError(err.message || '未知错误', 0, 'network', true)
  } finally {
    clearTimeout(timer)
  }
}
