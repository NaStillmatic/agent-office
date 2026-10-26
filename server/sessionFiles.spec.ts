import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSessionFileIndex } from './sessionFiles'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'ao-index-'))
  roots.push(root)
  const now = Date.now()
  const put = (relative: string, at = now, text = '{}') => {
    const file = join(root, relative)
    writeFileSync(file, text)
    utimesSync(file, at / 1000, at / 1000)
    return file
  }
  return { root, now, put }
}

describe('session file discovery', () => {
  it('polls active files between discoveries and drops removed or expired files', () => {
    const { root, now, put } = setup()
    const a = put('a.jsonl')
    const b = put('b.jsonl')
    const files = createSessionFileIndex(root, 0, (name) => name.endsWith('.jsonl'), 2000)
    expect(files(now).size).toBe(2)
    put('a.jsonl', now + 1000, 'updated')
    rmSync(b)
    expect(files(now + 1000).get(a)?.size).toBe(7)
    expect(files(now + 1000).has(b)).toBe(false)
    expect(files(now + 3001).size).toBe(0)
  })

  it('discovers new files and resumed old files within five seconds', () => {
    const { root, now, put } = setup()
    const old = put('old.jsonl', now - 60_000)
    const files = createSessionFileIndex(root, 0, (name) => name.endsWith('.jsonl'), 30_000)
    expect(files(now).size).toBe(0)
    put('old.jsonl', now + 1000)
    const fresh = put('new.jsonl', now + 1000)
    expect(files(now + 1000).size).toBe(0)
    expect([...files(now + 5000).keys()].sort()).toEqual([fresh, old].sort())
  })

  it('handles a missing root, filters file types, and respects directory depth', () => {
    const { root, now, put } = setup()
    const nested = join(root, 'sessions')
    const files = createSessionFileIndex(nested, 1, (name) => name.endsWith('.jsonl'), 30_000)
    expect(files(now).size).toBe(0)
    mkdirSync(join(nested, 'project', 'subagents'), { recursive: true })
    const main = put('sessions/project/main.jsonl')
    put('sessions/project/metadata.json')
    put('sessions/project/subagents/agent.jsonl')
    expect([...files(now + 5000).keys()]).toEqual([main])
  })
})
