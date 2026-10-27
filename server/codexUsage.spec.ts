import { appendFileSync, mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createCodexUsageReader, parseCodexUsage } from './codexUsage'

const now = Date.now()
const quota = (minutes = 10080, pct = 12, reset = now + 86400000) => ({ used_percent: pct, window_minutes: minutes, resets_at: reset / 1000 })
const event = (primary: unknown, secondary: unknown = null, at = now, limit_id: string | null = 'codex') => JSON.stringify({
  type: 'event_msg', timestamp: new Date(at).toISOString(),
  payload: { type: 'token_count', info: { secret: 'private-token-counts' }, rate_limits: { primary, secondary, limit_id, credits: { secret: 'private-credit-data' } } },
}) + '\n'
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ao-codex-usage-'))
  roots.push(root)
  const file = join(root, 'rollout-test.jsonl')
  return { root, file, read: createCodexUsageReader(root) }
}

describe('Codex quota metadata', () => {
  it('keeps a weekly-only primary as weekly instead of assuming a five-hour session', () => {
    expect(parseCodexUsage(event(quota()))).toEqual({ fetchedAt: now, windows: [{ minutes: 10080, pct: 12, resetsAt: now + 86400000 }] })
  })
  it('preserves actual durations and normalizes percentages and Unix seconds', () => {
    expect(parseCodexUsage(event(quota(10080, 120), quota(300, -5)))?.windows).toEqual([
      { minutes: 300, pct: 0, resetsAt: now + 86400000 },
      { minutes: 10080, pct: 100, resetsAt: now + 86400000 },
    ])
    expect(parseCodexUsage(event(quota(15)))?.windows[0].minutes).toBe(15)
  })
  it('only accepts actual quota events, ignores other buckets and token/credit data', () => {
    expect(parseCodexUsage(event(quota(), null, now, 'codex_other'))).toBeNull()
    expect(parseCodexUsage(event(quota()).replace('event_msg', 'response_item'))).toBeNull()
    expect(parseCodexUsage(event(quota(), null, now, null))?.windows).toHaveLength(1)
    expect(JSON.stringify(parseCodexUsage(event(quota())))).not.toMatch(/secret|credit|info|private/)
    expect(parseCodexUsage('{broken\n{"type":"token_count","info":{"tokens":9000}}')).toBeNull()
  })
  it('chooses by recorded timestamp, handles partial writes and missing windows', () => {
    expect(parseCodexUsage(event(quota(300, 20), null, now + 1000) + event(quota(300, 80), null, now))?.windows[0].pct).toBe(20)
    expect(parseCodexUsage(event(quota()) + '{"payload":')).not.toBeNull()
    expect(parseCodexUsage(event(null, null))?.windows).toEqual([])
    expect(parseCodexUsage(event({ used_percent: '12', window_minutes: 300 }))?.windows).toEqual([])
  })
})

describe('cached Codex usage reader', () => {
  it('retains a quota across append-only tool output, then consumes an updated event', () => {
    const { file, read } = fixture()
    writeFileSync(file, event(quota()))
    expect(read(now)?.windows[0].pct).toBe(12)
    appendFileSync(file, 'x'.repeat(3 * 1024 * 1024) + '\n')
    expect(read(now + 1)?.windows[0].pct).toBe(12)
    appendFileSync(file, event(quota(10080, 13), null, now + 2000))
    expect(read(now + 2000)?.windows[0].pct).toBe(13)
    expect(read(now + 2001)?.windows[0].pct).toBe(13)
  })
  it('handles partial events, truncation and file replacement', () => {
    const { file, read } = fixture()
    const data = event(quota())
    writeFileSync(file, data.slice(0, -8))
    expect(read(now)).toBeNull()
    appendFileSync(file, data.slice(-8))
    expect(read(now + 1)?.windows[0].pct).toBe(12)
    writeFileSync(file, '{}\n')
    expect(read(now + 2)).toBeNull()
    writeFileSync(file, event(quota(300, 15)))
    expect(read(now + 3)?.windows[0].pct).toBe(15)
    rmSync(file)
    writeFileSync(file, '{}\n')
    expect(read(now + 4)).toBeNull()
  })
  it('selects the newest event across files even after older history is touched; expires rather than guessing zero', () => {
    const { root, file, read } = fixture()
    mkdirSync(join(root, '2026'))
    writeFileSync(file, event(quota(10080, 9, now + 10000), null, now))
    const old = join(root, '2026', 'rollout-old.jsonl')
    writeFileSync(old, event(quota(10080, 80), null, now - 1000))
    utimesSync(old, new Date(now + 1000), new Date(now + 1000))
    expect(statSync(old).mtimeMs).toBeGreaterThanOrEqual(now)
    expect(read(now)?.windows[0].pct).toBe(9)
    expect(read(now + 10001)?.windows).toEqual([])
  })
})
