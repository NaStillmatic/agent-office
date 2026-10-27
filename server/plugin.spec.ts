import { EventEmitter } from 'node:events'
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  agentOfficePlugin,
  bornAt,
  configFile,
  newerUsage,
  parseBridgeUsage,
  parseUsage,
  projectNameOf,
  projectsRoot,
  readAliveSessions,
  slugOf,
  startCwd,
} from './plugin'

describe('프로젝트 이름 — 세션 시작 cwd', () => {
  const dir = '-Users-me-dev-my-app'
  const line = (o: object) => JSON.stringify(o)

  it('Claude Code 디렉터리 슬러그 규칙: 영숫자·하이픈 외는 모두 -', () => {
    expect(slugOf('/Users/me/dev/my-app')).toBe(dir)
    expect(slugOf('/Users/me/dev/my-app 2')).toBe('-Users-me-dev-my-app-2')
    expect(slugOf('/Users/me/dev/.my-app-wt/X')).toBe('-Users-me-dev--my-app-wt-X')
  })

  it('cwd 가 없는 앞줄·깨진 줄은 건너뛰고 첫 cwd 만 쓴다(이후 cd 로 바뀐 cwd 는 무시)', () => {
    const head = [
      line({ type: 'file-history-snapshot' }),
      '{"broken',
      line({ type: 'user', cwd: '/Users/me/dev/my-app' }),
      line({ type: 'user', cwd: '/Users/me/dev/my-app/my-app-frontend' }),
    ].join('\n')
    expect(startCwd(head, dir)).toBe('/Users/me/dev/my-app')
  })

  it('Windows 경로도 같은 슬러그 규칙이고, 프로젝트 이름은 마지막 조각', () => {
    expect(slugOf('C:\\Users\\me\\my-app')).toBe('C--Users-me-my-app')
    expect(startCwd(line({ cwd: 'C:\\Users\\me\\my-app' }), 'C--Users-me-my-app')).toBe('C:\\Users\\me\\my-app')
    expect(projectNameOf('C:\\Users\\me\\my-app')).toBe('my-app')
    expect(projectNameOf('/Users/me/dev/my-app/')).toBe('my-app')
  })

  it('첫 cwd 의 슬러그가 디렉터리 이름과 다르면 믿지 않는다', () => {
    expect(startCwd(line({ cwd: '/tmp/other' }), dir)).toBeNull()
    expect(startCwd(line({ type: 'user' }), dir)).toBeNull()
  })
})

describe('서브 jsonl 이 생긴 시각(bornAt)', () => {
  it('생성 시각이 있으면 그것, 없으면(일부 Linux) 처음 본 시각을 기억해 쓴다', () => {
    const seen = new Map<string, number>()
    expect(bornAt('a', 500, 9000, seen)).toBe(500)
    expect(bornAt('b', 0, 1000, seen)).toBe(1000)
    expect(bornAt('b', 0, 7000, seen)).toBe(1000) // mtime 처럼 계속 밀리지 않는다
  })
})

describe('실행 중인 Claude Code 세션(readAliveSessions)', () => {
  it('살아 있는 pid 의 세션만 고르고, 다른 OS pid 는 확인할 수 없어 살아 있는 것으로 둔다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ao-sessions-'))
    const put = (name: string, body: string) => writeFileSync(join(dir, name), body)
    put('1.json', JSON.stringify({ pid: 1, sessionId: 'live', pidDomain: 'darwin' }))
    put('2.json', JSON.stringify({ pid: 2, sessionId: 'dead', pidDomain: 'darwin' }))
    put('3.json', JSON.stringify({ pid: 3, sessionId: 'wsl', pidDomain: 'linux' }))
    put('4.json', '{"pid": 4, "sessio')
    put('5.key', 'secret')
    const alive = readAliveSessions(dir, 'darwin', (pid) => pid === 1)
    expect([...alive!].sort()).toEqual(['live', 'wsl'])
  })

  it('폴더가 없으면(옛 버전) null — 조용한 시간 규칙으로 돌아간다', () => {
    expect(readAliveSessions(join(tmpdir(), 'ao-no-such-dir-xyz'))).toBeNull()
  })
})

describe('사용량(parseUsage)', () => {
  const cfg = (o: object) => JSON.stringify({ oauthAccount: { emailAddress: 'secret' }, ...o })

  it('세션·주간 사용률과 초기화 시각만 뽑는다(계정 정보는 꺼내지 않는다)', () => {
    const u = parseUsage(
      cfg({
        cachedUsageUtilization: {
          fetchedAtMs: 1000,
          utilization: {
            five_hour: { utilization: 5, resets_at: '2026-10-20T12:59:59Z' },
            seven_day: { utilization: 142, resets_at: null },
          },
        },
      }),
    )
    expect(u).toEqual({
      session: { pct: 5, resetsAt: Date.parse('2026-10-20T12:59:59Z') },
      weekly: { pct: 100, resetsAt: null },
      fetchedAt: 1000,
    })
    expect(JSON.stringify(u)).not.toContain('secret')
  })

  it('값이 없거나 형식이 다르면 null', () => {
    expect(parseUsage(cfg({}))).toBeNull()
    expect(parseUsage(cfg({ cachedUsageUtilization: { utilization: { five_hour: { utilization: 'x' } } } }))).toBeNull()
    expect(parseUsage('{broken')).toBeNull()
  })

  it('상태줄 브리지 파일을 읽고, 두 출처 중 더 최근 값을 고른다', () => {
    const bridge = parseBridgeUsage(JSON.stringify({ session: { pct: 30, resetsAt: 9 }, weekly: null, fetchedAt: 2000 }))
    expect(bridge).toEqual({ session: { pct: 30, resetsAt: 9 }, weekly: null, fetchedAt: 2000 })
    const old = { session: { pct: 5, resetsAt: null }, weekly: null, fetchedAt: 1000 }
    expect(newerUsage(old, bridge)).toBe(bridge)
    expect(newerUsage(old, null)).toBe(old)
    expect(parseBridgeUsage('{}')).toBeNull()
  })

  it('설정 파일 위치: 기본은 ~/.claude.json, CLAUDE_CONFIG_DIR 가 있으면 그 안', () => {
    expect(configFile({})).toBe(join(homedir(), '.claude.json'))
    expect(configFile({ CLAUDE_CONFIG_DIR: '/tmp/cc' })).toBe(join('/tmp/cc', '.claude.json'))
  })
})

describe('상태줄 브리지(usageFromStatusline)', () => {
  it('rate_limits 의 사용률과 초기화 시각(초 → ms)만 뽑고, 없으면 null', async () => {
    // @ts-expect-error 순수 JS 스크립트(scripts/)라 타입 선언이 없다
    const { usageFromStatusline } = await import('../scripts/statusline-bridge.mjs')
    const u = usageFromStatusline(
      { model: { id: 'x' }, rate_limits: { five_hour: { used_percentage: 12.5, resets_at: 100 }, seven_day: { used_percentage: 40 } } },
      7,
    )
    expect(u).toEqual({ session: { pct: 12.5, resetsAt: 100_000 }, weekly: { pct: 40, resetsAt: null }, fetchedAt: 7 })
    expect(usageFromStatusline({ model: {} })).toBeNull()
  })
})

describe('세션 기록 폴더', () => {
  it('기본은 ~/.claude/projects, CLAUDE_CONFIG_DIR 가 있으면 그 아래 projects', () => {
    expect(projectsRoot({})).toBe(join(homedir(), '.claude', 'projects'))
    expect(projectsRoot({ CLAUDE_CONFIG_DIR: '/tmp/cc' })).toBe(join('/tmp/cc', 'projects'))
  })
})

describe('SSE — 모든 연결이 타이머 하나를 나눠 쓴다', () => {
  // 설정 폴더 구조(<base>/projects, <base>/sessions)를 임시 폴더에 흉내 낸다
  function setup() {
    const base = mkdtempSync(join(tmpdir(), 'ao-'))
    const root = join(base, 'projects')
    mkdirSync(root)
    const dir = join(root, slugOf('/x/proj'))
    mkdirSync(dir)
    writeFileSync(join(dir, 's1.jsonl'), JSON.stringify({ type: 'user', cwd: '/x/proj' }) + '\n')
    let handler: any
    // 사용량 설정 파일도 임시 폴더 것을 쓴다(실제 ~/.claude.json 을 읽지 않게)
    const plugin = agentOfficePlugin(
      root,
      join(base, 'sessions'),
      join(base, '.claude.json'),
      join(base, 'agent-office-usage.json'),
      join(base, 'codex-sessions'),
    ) as any
    plugin.configureServer({ middlewares: { use: (_p: string, h: any) => (handler = h) } })
    const connect = (host = 'localhost:5180') => {
      const req: any = new EventEmitter()
      req.socket = { remoteAddress: '127.0.0.1' }
      req.headers = { host }
      const res = {
        writes: [] as string[],
        statusCode: 200,
        writeHead() {},
        write(s: string) {
          this.writes.push(s)
        },
        end() {},
      }
      handler(req, res)
      return { req, res }
    }
    return { connect, root, codexRoot: join(base, 'codex-sessions'), dir, file: join(dir, 's1.jsonl'), subDir: join(dir, 's1', 'subagents'), sessions: join(base, 'sessions') }
  }

  it('Codex headers recover from partial writes and replacement, even without a Claude directory', () => {
    vi.useFakeTimers()
    const { connect, root, codexRoot } = setup()
    rmSync(root, { recursive: true })
    const dir = join(codexRoot, '2026', '10', '26')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'rollout-test.jsonl')
    const meta = (id: string) => JSON.stringify({ type: 'session_meta', payload: { id, cwd: '/x/codex-project' } })
    writeFileSync(file, meta('first').slice(0, -1))
    const client = connect()
    const last = () => JSON.parse(client.res.writes.filter((w) => w.startsWith('data: ')).pop()!.slice(6))
    const event = (payload: object) => JSON.stringify({ timestamp: new Date().toISOString(), type: 'event_msg', payload }) + '\n'
    try {
      expect(last().sessions).toEqual([])
      appendFileSync(file, '}\n' + event({ type: 'task_started' }))
      vi.advanceTimersByTime(1000)
      expect(last().sessions[0]).toMatchObject({ id: 'first', provider: 'codex', project: 'codex-project', main: { state: 'working' } })
      appendFileSync(file, event({ type: 'token_count', rate_limits: { limit_id: 'codex', primary: { used_percent: 12, window_minutes: 10080, resets_at: Date.now() / 1000 + 86400 }, secondary: null } }))
      vi.advanceTimersByTime(1000)
      expect(last().codexUsage.windows).toEqual([{ minutes: 10080, pct: 12, resetsAt: expect.any(Number) }])
      appendFileSync(file, event({ type: 'task_complete' }))
      vi.advanceTimersByTime(1000)
      expect(last().sessions[0].main.state).toBe('waiting')
      // Truncation must discard identity metadata from the previous rollout.
      writeFileSync(file, meta('other') + '\n' + event({ type: 'task_started' }))
      utimesSync(file, Date.now() / 1000, Date.now() / 1000)
      vi.advanceTimersByTime(1000)
      expect(last().sessions[0]).toMatchObject({ id: 'other', main: { state: 'working' } })
      // Same-size rewrites must also refresh the header.
      writeFileSync(file, meta('third') + '\n' + event({ type: 'task_started' }))
      utimesSync(file, Date.now() / 1000, Date.now() / 1000)
      vi.advanceTimersByTime(1000)
      expect(last().sessions[0].id).toBe('third')
    } finally {
      client.req.emit('close')
      vi.useRealTimers()
      rmSync(codexRoot, { recursive: true, force: true })
    }
  })

  it('두 번째 연결은 타이머를 늘리지 않고 마지막 스냅샷을 바로 받는다. 0개가 되면 멈춘다', () => {
    vi.useFakeTimers()
    try {
      const { connect } = setup()
      const a = connect()
      const b = connect()
      expect(vi.getTimerCount()).toBe(1)
      expect(a.res.writes[0]).toMatch(/^data: /)
      expect(b.res.writes[0]).toMatch(/"project":"proj"/)
      expect(b.res.writes[0]).toMatch(/"provider":"claude"/)
      vi.advanceTimersByTime(1000)
      expect(a.res.writes.length).toBe(2)
      expect(b.res.writes.length).toBe(2)
      a.req.emit('close')
      expect(vi.getTimerCount()).toBe(1)
      b.req.emit('close')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('파일이 그대로여도 시간이 지나면 판정이 바뀌고(캐시), 파일이 바뀌면 다시 읽는다', () => {
    vi.useFakeTimers()
    try {
      const t0 = Date.parse('2026-01-01T00:00:00.000Z')
      vi.setSystemTime(t0)
      const { connect, file } = setup()
      const ev = (o: object) => JSON.stringify({ timestamp: new Date(t0).toISOString(), ...o }) + '\n'
      writeFileSync(file, ev({ type: 'user', cwd: '/x/proj', message: { content: [] } }))
      const a = connect()
      const last = () => JSON.parse(a.res.writes.filter((w) => w.startsWith('data: ')).pop()!.slice(6))
      expect(last().sessions[0].main.state).toBe('working')
      vi.advanceTimersByTime(130 * 1000) // IDLE_MS(120초) 지남. 파일은 그대로
      expect(last().sessions[0].main.state).toBe('idle')
      appendFileSync(
        file,
        ev({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'b1', name: 'Bash' }] } }),
      )
      vi.setSystemTime(t0 + 1000)
      vi.advanceTimersByTime(1000)
      expect(last().sessions[0].main).toMatchObject({ state: 'working', tool: 'Bash' })
      a.req.emit('close')
    } finally {
      vi.useRealTimers()
    }
  })

  it('서브 jsonl 이 meta.json 보다 먼저 생기면 agentType 을 알 때까지 내려보내지 않는다', () => {
    const { connect, subDir } = setup()
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(subDir, 'agent-x1.jsonl'), JSON.stringify({ type: 'user' }) + '\n')
    const agentsOf = (c: ReturnType<typeof connect>) =>
      JSON.parse(c.res.writes.filter((w) => w.startsWith('data: ')).pop()!.slice(6)).sessions[0].agents
    const a = connect()
    expect(agentsOf(a)).toEqual([]) // 방금 생겨 META_WAIT_MS 안이다
    a.req.emit('close')
    writeFileSync(
      join(subDir, 'agent-x1.meta.json'),
      JSON.stringify({ agentType: 'feature-dev:code-reviewer', description: '리뷰' }),
    )
    const b = connect()
    expect(agentsOf(b)).toMatchObject([{ id: 'x1', agentType: 'feature-dev:code-reviewer', description: '리뷰' }])
    b.req.emit('close')
  })

  it('열려 있는 세션(프로세스 살아 있음)은 오래 조용해도 남고, 닫힌 세션은 서브에이전트와 함께 바로 빠진다', () => {
    const { connect, dir, file, sessions } = setup()
    // s1: 11분 전에 답변을 마침(예전 규칙이면 10분 넘어 퇴장). s2: 닫힌 세션, 서브에이전트가 일하던 중
    const old = new Date(Date.now() - 11 * 60 * 1000)
    const done = JSON.stringify({
      type: 'assistant',
      timestamp: old.toISOString(),
      message: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'x' }] },
    })
    writeFileSync(file, JSON.stringify({ type: 'user', cwd: '/x/proj' }) + '\n' + done + '\n')
    utimesSync(file, old, old)
    writeFileSync(join(dir, 's2.jsonl'), done + '\n')
    utimesSync(join(dir, 's2.jsonl'), old, old)
    const sub = join(dir, 's2', 'subagents')
    mkdirSync(sub, { recursive: true })
    writeFileSync(
      join(sub, 'agent-z.jsonl'),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name: 'Bash' }] } }) + '\n',
    )
    writeFileSync(join(sub, 'agent-z.meta.json'), JSON.stringify({ agentType: 'bug-fixer' }))
    mkdirSync(sessions)
    writeFileSync(
      join(sessions, `${process.pid}.json`),
      JSON.stringify({ pid: process.pid, sessionId: 's1', pidDomain: process.platform }),
    )
    const a = connect()
    const snap = JSON.parse(a.res.writes.filter((w) => w.startsWith('data: ')).pop()!.slice(6))
    const byId = Object.fromEntries(snap.sessions.map((x: any) => [x.id, x]))
    expect(byId.s1.main.state).toBe('waiting')
    expect(byId.s2.main.state).toBe('ended')
    expect(byId.s2.agents).toEqual([])
    a.req.emit('close')
  })

  it('Host 가 loopback 이 아니면 403', () => {
    const { connect } = setup()
    expect(connect('evil.example:5180').res.statusCode).toBe(403)
  })
})
