import { closeSync, openSync, readSync, type Stats } from 'node:fs'
import { createSessionFileIndex } from './sessionFiles'

export interface CodexUsage {
  windows: { minutes: number; pct: number; resetsAt: number | null }[]
  fetchedAt: number
}

/** Allowlist only quota numbers. Token counts, credits, account and transcript data never leave here. */
export function parseCodexUsage(text: string): CodexUsage | null {
  let latest: CodexUsage | null = null
  for (const line of text.split('\n')) {
    if (!line.includes('"rate_limits"')) continue
    try {
      const event = JSON.parse(line)
      const payload = event?.payload
      if (event?.type !== 'event_msg' || payload?.type !== 'token_count') continue
      const limits = payload.rate_limits
      if (!limits || typeof limits !== 'object' || (limits.limit_id != null && limits.limit_id !== 'codex')) continue
      const fetchedAt = typeof event.timestamp === 'string' ? Date.parse(event.timestamp) : NaN
      if (!Number.isFinite(fetchedAt)) continue
      const windows = new Map<number, CodexUsage['windows'][number]>()
      for (const window of [limits.primary, limits.secondary]) {
        if (!window || typeof window.used_percent !== 'number' || !Number.isFinite(window.used_percent)
          || !Number.isInteger(window.window_minutes) || window.window_minutes <= 0) continue
        const resetsAt = typeof window.resets_at === 'number' && Number.isFinite(window.resets_at) && window.resets_at > 0
          ? window.resets_at * 1000 : null
        windows.set(window.window_minutes, { minutes: window.window_minutes, pct: Math.max(0, Math.min(100, window.used_percent)), resetsAt })
      }
      const value = { windows: [...windows.values()].sort((a, b) => a.minutes - b.minutes), fetchedAt }
      if (!latest || fetchedAt >= latest.fetchedAt) latest = value
    } catch { /* Partial writes and unrelated lines are ignored. */ }
  }
  return latest
}

const MAX_READ = 2 * 1024 * 1024
const HISTORY_MS = 8 * 24 * 60 * 60 * 1000

/** Cached local-only reader: unchanged files do no I/O; append reads overlap a partial tail. */
export function createCodexUsageReader(root: string) {
  const files = createSessionFileIndex(root, 3, name => name.startsWith('rollout-') && name.endsWith('.jsonl'), HISTORY_MS)
  const cache = new Map<string, { stat: Stats; usage: CodexUsage | null }>()
  return (now: number): CodexUsage | null => {
    const current = files(now)
    let latest: CodexUsage | null = null
    for (const [file, stat] of current) {
      const previous = cache.get(file)
      const sameFile = previous && previous.stat.ino === stat.ino && previous.stat.birthtimeMs === stat.birthtimeMs
      let usage = sameFile ? previous.usage : null
      if (!sameFile || previous.stat.mtimeMs !== stat.mtimeMs || previous.stat.size !== stat.size) {
        const appended = sameFile && stat.size > previous.stat.size
        const start = Math.max(0, stat.size - MAX_READ, appended ? previous.stat.size - 256 * 1024 : 0)
        let fd: number | undefined
        try {
          fd = openSync(file, 'r')
          const bytes = Buffer.alloc(stat.size - start)
          const read = readSync(fd, bytes, 0, bytes.length, start)
          let text = bytes.toString('utf8', 0, read)
          if (start > 0) text = text.includes('\n') ? text.slice(text.indexOf('\n') + 1) : ''
          const parsed = parseCodexUsage(text)
          usage = parsed && (!appended || !usage || parsed.fetchedAt >= usage.fetchedAt) ? parsed : appended ? usage : null
          cache.set(file, { stat, usage })
        } catch {
          // Do not cache failed reads: retry next tick and avoid stale file identities.
          if (!appended) usage = null
        } finally {
          if (fd !== undefined) closeSync(fd)
        }
      }
      if (usage && (!latest || usage.fetchedAt > latest.fetchedAt)) latest = usage
    }
    for (const file of cache.keys()) if (!current.has(file)) cache.delete(file)
    // A reset passing does not prove the new usage is zero. Wait for a new recorded quota.
    return latest ? { ...latest, windows: latest.windows.filter(w => w.resetsAt === null || w.resetsAt > now) } : null
  }
}
