import type { Article, Config, Manifest, SyncPhase } from '@/types'
import { mergeNotes } from '@/services/sync/merge'
import { emptyManifest } from '@/services/github/manifest'
import { isConfigComplete } from '@/services/github/diagnose'
import type { RemoteSnapshot } from '@/services/github/contents'

/** 本地数据适配器：引擎通过它与 Pinia store 解耦（便于单测）。 */
export interface SyncAdapter {
  getConfig(): Config
  isEnabled(): boolean
  getLocalArticles(): Article[]
  getLocalManifestSha(): string | undefined
  applyRemote(articles: Article[], manifest: Manifest): void
  setPhase(p: SyncPhase): void
  /** 推送成功后回填 manifest.json 的 sha（维护乐观锁，可选） */
  setManifestSha?(sha: string): void
}

export interface ContentsApi {
  fetchRemote(config: Config): Promise<RemoteSnapshot | null>
  pushRemote(
    input: { articles: Article[]; manifestSha: string | undefined },
    config: Config,
  ): Promise<{ manifest: Manifest; conflictSlug: string | null; manifestSha: string }>
}

export interface SyncOutcome {
  ok: boolean
  merged: boolean
  pushed: boolean
}

export interface SyncEngine {
  /** 防抖推送（S3，1.5s） */
  schedulePush(): void
  /** 同步（手动或非静默）；返回统一结构（S7 改进点） */
  sync(manual?: boolean): Promise<SyncOutcome>
  /** 定时拉取（S4） */
  startPolling(): void
  stopPolling(): void
}

const PUSH_DEBOUNCE = 1500
const MAX_RETRY = 3
const RETRY_BACKOFF = 350
const MIN_POLL = 5000
const MAX_POLL = 300000

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function hidden(): boolean {
  return typeof document !== 'undefined' && document.hidden
}

/**
 * 同步引擎编排（对应 S1–S22，§3.3.2）。
 * 必须保留的踩坑行为：并发排队（S11）、空同步返回真值（S11）、冲突重试最多 3 次（S10）。
 */
export function createSyncEngine(adapter: SyncAdapter, contents: ContentsApi): SyncEngine {
  let pushTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let inFlight: Promise<SyncOutcome> | null = null

  async function doSync(): Promise<SyncOutcome> {
    if (!adapter.isEnabled()) {
      adapter.setPhase('off')
      return { ok: true, merged: false, pushed: false }
    }
    // 已启用但配置不完整：不发请求，保持本地模式，避免空 repo 触发 404 / 误报「同步失败」
    if (!isConfigComplete(adapter.getConfig())) {
      adapter.setPhase('off')
      return { ok: true, merged: false, pushed: false }
    }
    adapter.setPhase('syncing')
    try {
      let attempt = 0
      // 冲突重试循环（S10）
      while (true) {
        const config = adapter.getConfig()
        const remote = await contents.fetchRemote(config)
        const local = adapter.getLocalArticles()
        const merged = mergeNotes(local, remote?.articles ?? [])
        // 合并结果写回本地（mergeInto 的 LWW 语义）
        adapter.applyRemote(merged.items, remote?.manifest ?? emptyManifest())
        const pushResult = await contents.pushRemote(
          { articles: merged.items, manifestSha: adapter.getLocalManifestSha() },
          config,
        )
        if (pushResult.conflictSlug) {
          attempt++
          if (attempt >= MAX_RETRY) {
            adapter.setPhase('error')
            return { ok: false, merged: merged.changed, pushed: false }
          }
          await sleep(RETRY_BACKOFF * attempt)
          continue
        }
        adapter.setPhase('ok')
        adapter.setManifestSha?.(pushResult.manifestSha)
        return { ok: true, merged: merged.changed, pushed: true }
      }
    } catch {
      adapter.setPhase('error')
      return { ok: false, merged: false, pushed: false }
    }
  }

  function sync(manual = false): Promise<SyncOutcome> {
    void manual
    // 并发排队：复用进行中的 Promise，而非"忙就返回 false"（commit 81429d7）
    if (inFlight) return inFlight
    inFlight = doSync().finally(() => {
      inFlight = null
    })
    return inFlight
  }

  function schedulePush() {
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(() => {
      sync(false)
    }, PUSH_DEBOUNCE)
  }

  function startPolling() {
    const ms = Math.min(MAX_POLL, Math.max(MIN_POLL, adapter.getConfig().poll))
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = setInterval(() => {
      if (hidden()) return // document.hidden 时跳过（S4）
      sync(false)
    }, ms)
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  return { schedulePush, sync, startPolling, stopPolling }
}
