import { afterEach, describe, expect, it, vi } from 'vitest'
import { entryOf, getManifest, planDiff } from '../manifest'
import type { Article, Config, Manifest, ManifestEntry } from '@/types'

function b64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

const articles: Article[] = [
  { id: '1', title: 'A', content: '', fromTodo: '', tags: [], createdAt: 1, updatedAt: 100, deleted: false },
  { id: '2', title: 'B', content: '', fromTodo: '', tags: [], createdAt: 2, updatedAt: 200, deleted: false },
]

function entry(id: string, updatedAt: number): ManifestEntry {
  return { id, title: id, updatedAt, deleted: false, sha: '' }
}

describe('manifest 纯函数', () => {
  it('entryOf 由实体建索引条目，sha 待 PUT 后回填', () => {
    const e = entryOf(articles[0])
    expect(e).toEqual({ id: '1', title: 'A', updatedAt: 100, deleted: false, sha: '' })
    expect(entryOf(articles[0], 'blob').sha).toBe('blob')
  })

  it('planDiff 识别 pull / push（per-file LWW 调度）', () => {
    const local = [
      { id: '1', updatedAt: 100 },
      { id: '3', updatedAt: 300 }, // 远端缺失 → push
    ]
    const remoteIndex = {
      '1': entry('1', 150), // 远端更新 → pull
      '2': entry('2', 200), // 本地缺失 → pull
    }
    const d = planDiff(local, remoteIndex)
    expect(d.pull.sort()).toEqual(['1', '2'])
    expect(d.push).toEqual(['3'])
  })

  it('planDiff：updatedAt 相等既不拉也不推（无差异即零请求）', () => {
    const d = planDiff([{ id: '1', updatedAt: 100 }], { '1': entry('1', 100) })
    expect(d).toEqual({ pull: [], push: [] })
  })

  it('planDiff：远端索引缺失（旧 manifest 无 todos 字段）时全部视为待推', () => {
    const d = planDiff([{ id: 't1', updatedAt: 1 }], undefined)
    expect(d).toEqual({ pull: [], push: ['t1'] })
  })
})

describe('getManifest', () => {
  afterEach(() => vi.unstubAllGlobals())
  const cfg: Config = { enabled: true, repo: 'u/r', branch: 'main', path: '', token: 't', poll: 20000, apiBase: 'https://x' }

  it('读取并解析 manifest.json', async () => {
    const m: Manifest = {
      version: 1,
      updatedAt: 1,
      articles: { '1': { id: '1', title: 'A', updatedAt: 1, deleted: false, sha: 's' } },
      todos: {},
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ content: b64(JSON.stringify(m)), sha: 'ms' }), { status: 200, headers: { etag: 'ms' } })))
    const r = await getManifest(cfg)
    expect(r?.sha).toBe('ms')
    expect(r?.manifest.articles['1'].id).toBe('1')
  })

  it('不存在 → null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    expect(await getManifest(cfg)).toBeNull()
  })
})
