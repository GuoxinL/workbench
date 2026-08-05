import type { Config } from '@/types'
import { githubRequest, GithubError } from './client'

/** 目录列表中的单个条目。 */
export interface DirEntry {
  name: string
  path: string
  sha: string
  type: string
}

/** 远端目录树索引：id → blob sha（不含正文）。替代旧中央 manifest.json。 */
export interface RemoteIndex {
  articles: Record<string, string>
  todos: Record<string, string>
}

/**
 * 列出目录内容（`GET contents/{dir}`）。目录不存在（空仓库 / 首次同步）按空列表处理；
 * 仅保留 `type === 'file'` 的真实文件，忽略子目录（如 `images/`）。
 */
export async function listDir(dir: string, config: Config): Promise<DirEntry[]> {
  try {
    const { data } = await githubRequest(dir, { method: 'GET' }, config)
    if (!Array.isArray(data)) return []
    return (data as any[])
      .filter((e) => e && e.type === 'file')
      .map((e) => ({ name: e.name, path: e.path, sha: e.sha, type: e.type }))
  } catch (e) {
    // 404 = 目录尚不存在（首次同步）→ 视为空
    if (e instanceof GithubError && e.code === 'notfound') return []
    throw e
  }
}

/** 从目录条目投影出 `id → sha`（文件名去掉扩展名即 id）。 */
function indexFrom(entries: DirEntry[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const e of entries) {
    const m = e.name.match(/^(.+)\.(md|json)$/)
    if (m) out[m[1]] = e.sha
  }
  return out
}

/**
 * 现拉现用目录树索引，作为轻量同步索引（替代中央 manifest.json）。
 * 只列 `kb/`、`todos/`，图片走内容寻址不进索引。
 */
export async function fetchIndex(config: Config): Promise<RemoteIndex> {
  const [kb, todos] = await Promise.all([listDir('kb', config), listDir('todos', config)])
  return { articles: indexFrom(kb), todos: indexFrom(todos) }
}
