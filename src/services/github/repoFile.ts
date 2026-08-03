import type { Config } from '@/types'
import { githubRequest, GithubError } from './client'

export interface FileContent {
  content: string
  sha: string
}

/** sha 乐观锁冲突（409/422），需重新拉取合并后重试（对应 S10）。 */
export class ConflictError extends Error {
  sha?: string
  constructor(sha?: string) {
    super('冲突（409/422）')
    this.name = 'ConflictError'
    this.sha = sha
  }
}

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/** 读取单文件；不存在返回 null（404 视为空，不抛错）。 */
export async function getFile(path: string, config: Config): Promise<FileContent | null> {
  try {
    const { data, sha } = await githubRequest(path, { method: 'GET' }, config)
    if (!data || typeof data.content !== 'string') return null
    return { content: fromBase64(data.content), sha: sha ?? data.sha ?? '' }
  } catch (e) {
    if (e instanceof GithubError && e.code === 'notfound') return null
    throw e
  }
}

/** 写入单文件（文本）；带 sha 即乐观锁，冲突抛 ConflictError（S10）。 */
export async function putFile(
  path: string,
  content: string,
  sha: string | undefined,
  config: Config,
  message: string,
): Promise<string> {
  return putFileBase64(path, toBase64(content), sha, config, message)
}

/**
 * 写入单文件（已是 base64 的字节内容，如图片二进制）；不再二次编码。
 * 用于 Contents API 承载非文本资源（P2 ⑥ git 图片直传）。
 */
export async function putFileBase64(
  path: string,
  base64: string,
  sha: string | undefined,
  config: Config,
  message: string,
): Promise<string> {
  const body: Record<string, unknown> = { message, content: base64 }
  if (sha) body.sha = sha
  try {
    const { data, sha: newSha } = await githubRequest(path, { method: 'PUT', body }, config)
    return newSha ?? data?.sha ?? sha ?? ''
  } catch (e) {
    if (e instanceof GithubError && (e.status === 409 || e.status === 422)) {
      throw new ConflictError(e.status === 409 ? sha : undefined)
    }
    throw e
  }
}

/** 删除单文件；需带当前 blob sha。不存在（404）视为已删除，不抛错。 */
export async function deleteFile(
  path: string,
  sha: string | undefined,
  config: Config,
  message: string,
): Promise<void> {
  const body: Record<string, unknown> = { message, sha }
  try {
    await githubRequest(path, { method: 'DELETE', body }, config)
  } catch (e) {
    if (e instanceof GithubError && e.code === 'notfound') return
    throw e
  }
}
