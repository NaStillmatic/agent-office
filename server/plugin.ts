/**
 * Claude Code 및 Codex 세션 기록을 공통 상태로 변환해 화면에 SSE 로 내려준다.
 *
 * - `apply: 'serve'` — dev 서버에서만 동작한다.
 * - jsonl 에는 대화 원문·도구 입출력이 있어 개인정보가 섞일 수 있다. 내려보내는 것은
 *   세션ID·프로젝트 이름·에이전트ID·agentType·description·도구 이름·시각·상태뿐이다(본문·입력·결과 금지).
 * - 요청 원격 주소와 Host 가 loopback 이 아니면 403.
 * - jsonl 형식은 공개 규약이 아니므로 모르는 필드는 무시하고 파싱 실패 줄은 건너뛴다.
 */
import { closeSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { Plugin } from 'vite'
import { RECENT_MS, decideTail, parseCodexTail, parseTail, withAgents, withProcess } from './analyze'
import type { Status, Tail } from './analyze'
import { createSessionFileIndex } from './sessionFiles'

const ENDPOINT = '/__agent-office/events'
const ENDED_SHOW_MS = 60 * 1000 // 끝난 에이전트는 퇴장 연출을 위해 잠깐만 내려보낸다
/**
 * 서브 jsonl 이 meta.json 보다 먼저 생기는 틈. 이 동안은 agentType 을 몰라 이름표가 '에이전트' 로 굳으므로
 * meta 를 기다렸다가 내려보낸다. 끝내 meta 가 없는 기록(드물게 있다)은 이 시간이 지나면 그냥 보낸다.
 */
const META_WAIT_MS = 5 * 1000
const TAIL_BYTES = 256 * 1024
const HEAD_BYTES = 64 * 1024 // cwd 는 첫 몇 줄(실측 5KB 이내)에 있다
const POLL_MS = 1000
/**
 * 메인 jsonl 이 이보다 오래 조용하면 subagents/ 를 아예 열지 않는다. 서브가 도는 동안 메인은
 * 쓰이지 않아(실측 최대 19분) RECENT_MS(30분)로 자르면 긴 서브를 놓칠 수 있어 여유를 둔다.
 * ponytail: 메인이 3시간 넘게 조용한 채 서브만 도는 세션은 안 보인다 — 생기면 늘린다.
 */
const STALE_MS = 3 * 60 * 60 * 1000

/** Claude Code 가 프로젝트 디렉터리 이름을 만드는 규칙(영숫자·하이픈 외는 모두 '-'). 손실 변환이다 */
export const slugOf = (path: string) => path.replace(/[^A-Za-z0-9-]/g, '-')

const isLoopback = (addr: string | undefined) =>
  addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
const isLoopbackHost = (host: string | undefined) =>
  /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host ?? '')

function readRange(file: string, start: number, len: number): string {
  const fd = openSync(file, 'r')
  try {
    const buf = Buffer.alloc(len)
    const n = readSync(fd, buf, 0, len, start)
    return buf.toString('utf-8', 0, n)
  } finally {
    closeSync(fd)
  }
}

function readTail(file: string, size: number): string {
  const len = Math.min(size, TAIL_BYTES)
  const start = size - len
  const text = readRange(file, start, len)
  // 중간에서 잘린 첫 줄은 버린다
  return start > 0 ? text.slice(text.indexOf('\n') + 1) : text
}


/**
 * 세션 시작 cwd. 이후 줄의 cwd 는 셸 `cd` 를 따라 하위 폴더로 바뀌므로 첫 cwd 만 쓴다.
 * 그 cwd 의 슬러그가 디렉터리 이름과 같을 때만 믿는다.
 */
export function startCwd(head: string, dirName: string): string | null {
  for (const line of head.split('\n')) {
    let j: unknown
    try {
      j = JSON.parse(line)
    } catch {
      continue
    }
    const cwd = (j as { cwd?: unknown } | null)?.cwd
    if (typeof cwd === 'string') return slugOf(cwd) === dirName ? cwd : null
  }
  return null
}

/** Minimal Codex rollout metadata needed to identify a thread and its workspace. */
export function codexMeta(head: string): { id: string; cwd: string; parentId: string | null } | null {
  for (const line of head.split('\n')) {
    try {
      const j = JSON.parse(line)
      if (j?.type !== 'session_meta' || typeof j.payload?.cwd !== 'string') continue
      const id = typeof j.payload.id === 'string' ? j.payload.id : ''
      const parentId = typeof j.payload.parent_thread_id === 'string' ? j.payload.parent_thread_id : null
      return { id, cwd: j.payload.cwd, parentId }
    } catch {
      // Ignore incomplete records.
    }
  }
  return null
}

/** 세션을 시작한 폴더 경로의 마지막 조각. Windows 경로(`C:\Users\me\my-app`)의 역슬래시도 구분자로 본다 */
export const projectNameOf = (cwd: string) => cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd

/** Claude Code 세션 기록 폴더. CLAUDE_CONFIG_DIR 로 설정 폴더를 옮긴 환경도 따른다 */
export function projectsRoot(env: Record<string, string | undefined> = process.env) {
  return join(env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects')
}

/** Codex CLI and desktop rollout directory (`$CODEX_HOME/sessions` or `~/.codex/sessions`). */
export function codexSessionsRoot(env: Record<string, string | undefined> = process.env) {
  return join(env.CODEX_HOME || join(homedir(), '.codex'), 'sessions')
}

/** Claude Code 전역 설정 파일. CLAUDE_CONFIG_DIR 를 쓰면 그 안의 .claude.json, 아니면 ~/.claude.json */
export function configFile(env: Record<string, string | undefined> = process.env) {
  return env.CLAUDE_CONFIG_DIR ? join(env.CLAUDE_CONFIG_DIR, '.claude.json') : join(homedir(), '.claude.json')
}

/** 사용량 한 칸: 사용률(0~100)과 초기화 시각(ms) */
export interface UsageWindow {
  pct: number
  resetsAt: number | null
}
/** 화면에 내려보내는 사용량. 세션(5시간)·주간(7일) 한도와 Claude Code 가 이 값을 받아 온 시각 */
export interface Usage {
  session: UsageWindow | null
  weekly: UsageWindow | null
  fetchedAt: number | null
}

/**
 * 설정 파일에서 사용량만 뽑는다. Claude Code 는 사용량 한도를 받아 오면 `cachedUsageUtilization`
 * ({ fetchedAtMs, utilization: { five_hour, seven_day: { utilization, resets_at } } })에 저장해 둔다.
 * 이 형식도 공개 규약이 아니다. 설정 파일에는 계정 정보가 함께 있으므로 이 숫자들 말고는 아무것도 꺼내지 않는다.
 * 값이 없거나 형식이 다르면 null(화면에서 게이지를 숨긴다).
 */
export function parseUsage(text: string): Usage | null {
  let cached: unknown
  try {
    cached = (JSON.parse(text) as { cachedUsageUtilization?: unknown })?.cachedUsageUtilization
  } catch {
    return null
  }
  if (!cached || typeof cached !== 'object') return null
  const c = cached as { fetchedAtMs?: unknown; utilization?: Record<string, unknown> }
  const win = (v: unknown): UsageWindow | null => {
    const w = v as { utilization?: unknown; resets_at?: unknown } | null
    if (!w || typeof w.utilization !== 'number' || !Number.isFinite(w.utilization)) return null
    const reset = typeof w.resets_at === 'string' ? Date.parse(w.resets_at) : NaN
    return { pct: Math.max(0, Math.min(100, w.utilization)), resetsAt: Number.isNaN(reset) ? null : reset }
  }
  const session = win(c.utilization?.five_hour)
  const weekly = win(c.utilization?.seven_day)
  if (!session && !weekly) return null
  return { session, weekly, fetchedAt: typeof c.fetchedAtMs === 'number' ? c.fetchedAtMs : null }
}

/**
 * 서브 jsonl 이 생긴 시각(meta 대기 시간을 재는 기준). 생성 시각(birthtime)을 주지 않는 파일시스템(일부 Linux)에서는
 * 처음 본 시각(firstSeen)으로 대신한다. mtime 으로 재면 일하는 동안 계속 갱신돼 meta 가 끝내 없는 기록이 영영 안 보인다.
 */
export function bornAt(file: string, birthtimeMs: number, now: number, firstSeen: Map<string, number>) {
  if (birthtimeMs > 0) return birthtimeMs
  let at = firstSeen.get(file)
  if (at === undefined) firstSeen.set(file, (at = now))
  return at
}

/** pid 가 살아 있는 프로세스인가. 권한이 없어 신호를 못 보내도(EPERM) 프로세스는 있는 것이다 */
function pidAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * 실행 중인 Claude Code 프로세스가 지금 쓰는 세션 ID. Claude Code 는 프로세스마다
 * `<설정 폴더>/sessions/<pid>.json`(pid·sessionId·pidDomain …)을 남긴다. 이 폴더가 없으면(옛 버전 등) null 이고,
 * 그때는 조용한 시간으로만 퇴장을 판정한다. 다른 OS 의 pid(WSL 안의 Claude 를 Windows 에서 보는 경우 등)는
 * 확인할 수 없으므로 살아 있는 것으로 둔다. 이 파일 형식도 공개 규약이 아니라 모르는 필드는 무시한다.
 */
export function readAliveSessions(
  dir: string,
  platform: string = process.platform,
  isAlive: (pid: number) => boolean = pidAlive,
): Set<string> | null {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return null
  }
  const alive = new Set<string>()
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    try {
      const j = JSON.parse(readFileSync(join(dir, name), 'utf-8'))
      if (typeof j?.sessionId !== 'string' || typeof j?.pid !== 'number') continue
      const foreign = typeof j.pidDomain === 'string' && j.pidDomain !== platform
      if (foreign || isAlive(j.pid)) alive.add(j.sessionId)
    } catch {
      // 쓰는 도중이거나 깨진 파일은 건너뛴다
    }
  }
  return alive
}

/**
 * 상태줄 브리지(scripts/statusline-bridge.mjs)가 남기는 사용량 파일. 형식은 Usage 그대로다.
 * 상태줄이 그려질 때마다 갱신되므로 설정 파일 값보다 대개 새롭다. 형식이 다르면 null
 */
export function parseBridgeUsage(text: string): Usage | null {
  try {
    const u = JSON.parse(text) as Partial<Usage> | null
    const win = (w: unknown): UsageWindow | null => {
      const v = w as UsageWindow | null
      if (!v || typeof v.pct !== 'number' || !Number.isFinite(v.pct)) return null
      return { pct: Math.max(0, Math.min(100, v.pct)), resetsAt: typeof v.resetsAt === 'number' ? v.resetsAt : null }
    }
    const session = win(u?.session)
    const weekly = win(u?.weekly)
    if (!session && !weekly) return null
    return { session, weekly, fetchedAt: typeof u?.fetchedAt === 'number' ? u.fetchedAt : null }
  } catch {
    return null
  }
}

/** 두 출처 중 더 최근에 받아 온 사용량 */
export function newerUsage(a: Usage | null, b: Usage | null): Usage | null {
  if (!a || !b) return a ?? b
  return (b.fetchedAt ?? 0) > (a.fetchedAt ?? 0) ? b : a
}

export function agentOfficePlugin(
  root = projectsRoot(),
  sessionsDir = join(dirname(root), 'sessions'),
  usageFile = configFile(),
  bridgeUsageFile = join(dirname(root), 'agent-office-usage.json'),
  codexRoot = codexSessionsRoot(),
): Plugin {
  const claudeFiles = createSessionFileIndex(root, 1, (name) => name.endsWith('.jsonl'), STALE_MS)
  const codexFiles = createSessionFileIndex(codexRoot, 3, (name) => name.startsWith('rollout-') && name.endsWith('.jsonl'), RECENT_MS)
  const codexMetaCache = new Map<string, { birthtimeMs: number; ino: number; size: number; mtimeMs: number; meta: NonNullable<ReturnType<typeof codexMeta>> }>()
  const homeSlug = slugOf(homedir()) + '-'
  const nameCache = new Map<string, string>() // 디렉터리 이름 → 프로젝트 이름(cwd 로 확정된 것만)

  function projectName(dirName: string, mainFile: string): string {
    const hit = nameCache.get(dirName)
    if (hit) return hit
    try {
      const cwd = startCwd(readRange(mainFile, 0, HEAD_BYTES), dirName)
      if (cwd) {
        const name = projectNameOf(cwd)
        nameCache.set(dirName, name)
        return name
      }
    } catch {
      // 못 읽으면 슬러그로 대신한다 — 캐시하지 않고 다음 틱에 다시 본다
    }
    // cwd 줄이 아직 안 써진 새 세션뿐이다. 슬러그는 '/'·'.'·공백·한글이 모두 '-' 라 경계를 못 되살린다
    return dirName.startsWith(homeSlug) ? dirName.slice(homeSlug.length) : dirName
  }

  /**
   * 파일별 파싱 결과. 최근 파일이 수십 개라 매초 끝부분(최대 256KB)을 모두 읽고 파싱하면 초당 수 MB 다.
   * 대부분은 그 사이 바뀌지 않으므로 mtime·size 가 같으면 파싱을 건너뛰고 판정(시각 의존)만 새로 한다.
   */
  const tailCache = new Map<string, { mtimeMs: number; size: number; tail: Tail }>()
  let seen = new Set<string>()
  const firstSeen = new Map<string, number>()

  /** jsonl 끝부분만 읽어 현재 상태를 정한다(판정은 analyze.ts) */
  function analyze(file: string, mtimeMs: number, size: number, isMain: boolean, now: number): Status {
    seen.add(file)
    const hit = tailCache.get(file)
    if (hit && hit.mtimeMs === mtimeMs && hit.size === size) return decideTail(hit.tail, mtimeMs, isMain, now)
    let text = ''
    let ok = true
    try {
      text = readTail(file, size)
    } catch {
      ok = false // 읽기 실패는 빈 꼬리로 취급 — mtime 기준 판정. 캐시하지 않고 다음 틱에 다시 읽는다
    }
    const tail = parseTail(text)
    if (ok) tailCache.set(file, { mtimeMs, size, tail })
    return decideTail(tail, mtimeMs, isMain, now)
  }

  function analyzeCodex(file: string, mtimeMs: number, size: number, isMain: boolean, now: number): Status {
    seen.add(file)
    const hit = tailCache.get(file)
    if (hit && hit.mtimeMs === mtimeMs && hit.size === size) return decideTail(hit.tail, mtimeMs, isMain, now)
    let text = ''
    let ok = true
    try {
      text = readTail(file, size)
    } catch {
      ok = false
    }
    const tail = parseCodexTail(text)
    if (ok) tailCache.set(file, { mtimeMs, size, tail })
    return decideTail(tail, mtimeMs, isMain, now)
  }

  const metaCache = new Map<string, { agentType: string; description: string }>()
  function readMeta(file: string) {
    const hit = metaCache.get(file)
    if (hit) return hit
    let meta = { agentType: '', description: '' }
    try {
      const j = JSON.parse(readFileSync(file, 'utf-8'))
      meta = {
        agentType: typeof j?.agentType === 'string' ? j.agentType : '',
        description: typeof j?.description === 'string' ? j.description : '',
      }
      metaCache.set(file, meta)
    } catch {
      // meta 가 아직 안 써졌을 수 있다 — 캐시하지 않고 다음 틱에 재시도
    }
    return meta
  }

  // 사용량 파일은 mtime 이 바뀔 때만 다시 읽는다(설정 파일은 수백 KB 다)
  const usageCaches = new Map<string, { mtimeMs: number; usage: Usage | null }>()
  function readCached(file: string, parse: (text: string) => Usage | null): Usage | null {
    try {
      const { mtimeMs } = statSync(file)
      let hit = usageCaches.get(file)
      if (hit?.mtimeMs !== mtimeMs) usageCaches.set(file, (hit = { mtimeMs, usage: parse(readFileSync(file, 'utf-8')) }))
      return hit.usage
    } catch {
      return null
    }
  }
  /** Claude Code 설정 파일 값과 상태줄 브리지 값 중 더 최근 것 */
  function readUsage(): Usage | null {
    return newerUsage(readCached(usageFile, parseUsage), readCached(bridgeUsageFile, parseBridgeUsage))
  }

  function snapshot() {
    const now = Date.now()
    const usage = readUsage()
    seen = new Set()
    const alive = readAliveSessions(sessionsDir)
    const sessions: any[] = []
    for (const [file, st] of claudeFiles(now)) {
      const dir = dirname(file)
      const dirName = basename(dir)
      const id = basename(file, '.jsonl')
      try {
        const agents: any[] = []
        const subDir = join(dir, id, 'subagents')
        let subNames: string[] = []
        try {
          subNames = readdirSync(subDir)
        } catch {
          // 서브에이전트가 없는 세션
        }
        let anyRecent = false
        for (const sn of subNames) {
          const m = /^agent-(.+)\.jsonl$/.exec(sn)
          if (!m) continue
          const sst = statSync(join(subDir, sn))
          if (now - sst.mtimeMs > RECENT_MS) continue
          anyRecent = true
          const subFile = join(subDir, sn)
          const status = analyze(subFile, sst.mtimeMs, sst.size, false, now)
          if (status.state === 'ended' && now - status.lastAt > ENDED_SHOW_MS) continue
          const meta = readMeta(join(subDir, `agent-${m[1]}.meta.json`))
          const born = bornAt(subFile, sst.birthtimeMs, now, firstSeen)
          if (!meta.agentType && now - born < META_WAIT_MS) continue
          agents.push({
            id: m[1],
            agentType: meta.agentType,
            description: meta.description,
            ...status,
          })
        }
        // 열려 있는 세션(프로세스가 살아 있음)은 오래 조용해도(STALE_MS 안) 내려보낸다 — 메인이 자리를 지킨다
        if (now - st.mtimeMs > RECENT_MS && !anyRecent && !alive?.has(id)) continue
        let main = withAgents(analyze(file, st.mtimeMs, st.size, true, now), agents)
        if (alive) {
          main = withProcess(main, alive.has(id), now - st.mtimeMs)
          // 프로세스가 끝난 세션의 서브에이전트도 함께 멈췄으므로 내려보내지 않는다
          if (main.state === 'ended') agents.length = 0
        }
        sessions.push({ id, project: projectName(dirName, file), main, agents })
      } catch {
        // 읽는 도중 파일이 사라지는 경우 등 — 그 세션만 건너뛴다
      }
    }
    // Codex stores rollouts under sessions/YYYY/MM/DD. Read only recent rollout tails and
    // expose the same status shape used by the Claude adapter above.
    const codexThreads = new Map<string, any>()
    const codexSeen = new Set<string>()
    for (const [file, st] of codexFiles(now)) {
      try {
        codexSeen.add(file)
        const hit = codexMetaCache.get(file)
        let meta = hit && hit.birthtimeMs === st.birthtimeMs && hit.ino === st.ino
          && (st.size > hit.size || (st.size === hit.size && st.mtimeMs === hit.mtimeMs)) ? hit.meta : null
        if (!meta) {
          meta = codexMeta(readRange(file, 0, Math.min(st.size, HEAD_BYTES)))
          // Failed/incomplete headers are retried next tick. Only identity metadata is cached.
        }
        if (!meta) {
          codexMetaCache.delete(file)
          continue
        }
        codexMetaCache.set(file, { birthtimeMs: st.birthtimeMs, ino: st.ino, size: st.size, mtimeMs: st.mtimeMs, meta })
        const status = analyzeCodex(file, st.mtimeMs, st.size, !meta.parentId, now)
        if (status.state === 'ended' && (!meta.parentId || now - status.lastAt > ENDED_SHOW_MS)) continue
        const id = meta.id || basename(file).slice('rollout-'.length, -'.jsonl'.length)
        const candidate = {
          id,
          project: projectNameOf(meta.cwd),
          main: status,
          agents: [],
          parentId: meta.parentId,
          mtimeMs: st.mtimeMs,
        }
        const existing = codexThreads.get(id)
        if (!existing || candidate.mtimeMs > existing.mtimeMs) codexThreads.set(id, candidate)
      } catch {
        // A rollout can disappear while it is being scanned.
      }
    }
    for (const file of codexMetaCache.keys()) if (!codexSeen.has(file)) codexMetaCache.delete(file)
    for (const thread of codexThreads.values()) {
      const parent = thread.parentId ? codexThreads.get(thread.parentId) : null
      if (parent) parent.agents.push({ id: thread.id, agentType: '', description: '', ...thread.main })
    }
    for (const thread of codexThreads.values()) {
      const parent = thread.parentId ? codexThreads.get(thread.parentId) : null
      if (!parent) {
        thread.main = withAgents(thread.main, thread.agents)
        sessions.push(thread)
      }
      delete thread.parentId
      delete thread.mtimeMs
    }
    // 이번 틱에 보지 않은 파일(오래됐거나 지워진 것)은 캐시·처음 본 시각에서 뺀다
    for (const file of tailCache.keys()) if (!seen.has(file)) tailCache.delete(file)
    for (const file of firstSeen.keys()) if (!seen.has(file)) firstSeen.delete(file)
    sessions.sort((a, b) => b.main.lastAt - a.main.lastAt)
    return { now, sessions, usage }
  }

  // 모든 연결이 한 타이머·한 스냅샷을 나눠 쓴다. 탭을 여러 개 열어도 I/O 는 그대로다
  const clients = new Set<ServerResponse>()
  let timer: ReturnType<typeof setInterval> | null = null
  let lastKey = ''
  let lastData = ''

  function tick() {
    let msg: string
    try {
      const data = JSON.stringify(snapshot())
      // now 는 매번 달라지므로 비교에서 뺀다 — 변화가 없으면 주석 하트비트만 보낸다
      const key = data.replace(/^\{"now":\d+,/, '{')
      if (key !== lastKey) {
        lastKey = key
        lastData = data
        msg = `data: ${data}\n\n`
      } else {
        msg = ': hb\n\n'
      }
    } catch {
      msg = ': err\n\n'
    }
    for (const res of clients) res.write(msg)
  }

  return {
    name: 'agent-office',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(ENDPOINT, (req, res) => {
        if (!isLoopback(req.socket.remoteAddress) || !isLoopbackHost(req.headers.host)) {
          res.statusCode = 403
          res.end('forbidden')
          return
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        })
        clients.add(res)
        if (timer) {
          // 이미 돌고 있으면 마지막 스냅샷을 바로 준다. now 만 지금으로 바꾼다(상태는 그 뒤 변화 없음)
          if (lastData) res.write(`data: ${lastData.replace(/^\{"now":\d+/, `{"now":${Date.now()}`)}\n\n`)
        } else {
          lastKey = ''
          tick()
          timer = setInterval(tick, POLL_MS)
        }
        req.on('close', () => {
          clients.delete(res)
          if (!clients.size && timer) {
            clearInterval(timer)
            timer = null
          }
        })
      })
    },
  }
}
