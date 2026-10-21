/**
 * AI 작업 사무실(vite 플러그인 agentOfficePlugin)의 상태 판정. node 전용 순수 함수라
 * src/ 밖(server/)에 둔다 — 화면 번들에 들어가지 않는다. 본문은 보관하지 않고 도구 이름만 뽑는다.
 */
export const RECENT_MS = 30 * 60 * 1000 // 이 시간 안에 수정된 세션만 대상
export const IDLE_MS = 120 * 1000 // 이벤트가 이만큼 없으면 대기(졸음)
export const MAIN_GONE_MS = 10 * 60 * 1000 // 이만큼 조용하면 메인도 퇴장
/**
 * 서브에이전트가 도구 결과를 이만큼 못 받으면 응답 없음(idle)으로 본다. Bash 최대 타임아웃이 10분이고
 * 실측한 서브 도구 대기도 최장 10.0분이라 여유를 둔다. 서브를 다시 띄우는 도구(NESTED_TOOLS)는 제외.
 */
export const STALL_MS = 12 * 60 * 1000
const NESTED_TOOLS = new Set(['Agent', 'Task', 'Workflow'])

export type State = 'working' | 'waiting' | 'idle' | 'ended'
export interface Status {
  state: State
  tool: string | null
  lastAt: number
}

/** 응답이 끝났음을 뜻하는 stop_reason. 그 외(tool_use·null)는 같은 응답의 다음 줄이 이어진다. */
const FINAL_STOP_REASONS = new Set(['end_turn', 'stop_sequence', 'max_tokens'])

/**
 * 서브에이전트가 작업을 마치며 호출하는 보고 도구. 최근 Claude Code 는 이 도구의 tool_result 로
 * 서브 세션을 끝내고 text+end_turn 줄을 남기지 않으므로, 이 결과가 곧 종료 신호다.
 */
const HANDBACK_TOOL = 'SubagentHandback'

/** 트랜스크립트 한 줄(JSON)에서 읽는 필드만 느슨하게 적은 모양. 값은 검사한 뒤에만 쓴다 */
interface TranscriptBlock {
  type?: unknown
  id?: unknown
  name?: unknown
  tool_use_id?: unknown
  is_error?: unknown
}
interface TranscriptEvent {
  type?: unknown
  timestamp?: unknown
  message?: { content?: unknown; stop_reason?: unknown }
}

/** jsonl 끝부분을 파싱한 결과. 파일이 그대로면 다시 파싱하지 않고 이 값으로 판정만 새로 한다 */
export interface Tail {
  /** 마지막 이벤트 시각(없으면 0) */
  evAt: number
  /** 결과를 기다리는 마지막 도구 */
  tool: string | null
  /** 보고 도구가 성공하고 그 뒤로 작업이 재개되지 않음 */
  handbackDone: boolean
  lastKind: 'assistant-text' | 'assistant-partial' | 'assistant-tool' | 'user' | null
}

/**
 * jsonl 끝부분(text)으로 현재 상태를 정한다.
 *
 * Claude Code 는 한 응답의 content 블록을 줄 단위로 나눠 기록한다(같은 message.id).
 * thinking 줄이 먼저 오고 1~3초 뒤 tool_use 줄이 오므로, 도구 호출이 없다는 이유만으로
 * 답변 종료로 보면 폴링 시점에 따라 ended/waiting 이 깜빡인다. 종료는 text 블록이 있고
 * stop_reason 이 끝 신호일 때뿐이다.
 */
export function analyzeTail(text: string, mtimeMs: number, isMain: boolean, now: number): Status {
  return decideTail(parseTail(text), mtimeMs, isMain, now)
}

/** 시각과 무관한 부분(줄 파싱)만 한다 */
export function parseTail(text: string): Tail {
  let evAt = 0
  let pending = new Map<string, string>()
  let handbackDone = false // 보고 도구가 성공하고 그 뒤로 작업이 재개되지 않음
  let lastKind: Tail['lastKind'] = null
  try {
    for (const line of text.split('\n')) {
      if (!line) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        continue
      }
      // 객체가 아닌 JSON 줄(숫자·null 등)은 모든 필드가 비어 있는 이벤트로 본다
      const ev: TranscriptEvent =
        typeof parsed === 'object' && parsed !== null ? (parsed as TranscriptEvent) : {}
      const ts = typeof ev.timestamp === 'string' ? Date.parse(ev.timestamp) : NaN
      if (!Number.isNaN(ts)) evAt = Math.max(evAt, ts)
      const content: unknown = ev.message?.content
      const stopReason = ev.message?.stop_reason
      if (ev.type === 'assistant' && Array.isArray(content)) {
        let hasTool = false
        let hasText = false
        for (const c of content as (TranscriptBlock | null | undefined)[]) {
          if (c?.type === 'tool_use' && typeof c.name === 'string' && typeof c.id === 'string') {
            pending.set(c.id, c.name)
            hasTool = true
            handbackDone = false
          } else if (c?.type === 'text') {
            hasText = true
          }
        }
        const final =
          hasText && typeof stopReason === 'string' && FINAL_STOP_REASONS.has(stopReason)
        lastKind = hasTool ? 'assistant-tool' : final ? 'assistant-text' : 'assistant-partial'
      } else if (ev.type === 'user') {
        let handbackResult = false
        if (Array.isArray(content)) {
          for (const c of content as (TranscriptBlock | null | undefined)[]) {
            if (c?.type === 'tool_result' && typeof c.tool_use_id === 'string') {
              if (pending.get(c.tool_use_id) === HANDBACK_TOOL && c.is_error !== true) {
                handbackResult = true
              }
              pending.delete(c.tool_use_id)
            }
          }
        }
        handbackDone = handbackResult // 보고 실패나 새 사용자 입력이면 다시 작업 중으로 본다
        lastKind = 'user'
      }
    }
  } catch {
    pending = new Map()
  }
  const tool = pending.size ? Array.from(pending.values()).pop()! : null
  return { evAt, tool, handbackDone, lastKind }
}

/** 파싱 결과와 현재 시각으로 상태를 정한다(졸음·퇴장·응답 없음은 시간이 지나면 바뀐다) */
export function decideTail(t: Tail, mtimeMs: number, isMain: boolean, now: number): Status {
  const { tool, handbackDone, lastKind } = t
  const lastAt = t.evAt || mtimeMs
  const age = now - lastAt
  if (!isMain && handbackDone) return { state: 'ended', tool: null, lastAt }
  if (tool === 'AskUserQuestion') return { state: 'waiting', tool, lastAt }
  // 서브가 도구 결과를 너무 오래 못 받으면 멈춘 것으로 본다(강제 종료 등). 도구 이름은 남겨 화면이 '응답 없음'으로 표시한다
  if (tool && !isMain && !NESTED_TOOLS.has(tool) && age > STALL_MS) {
    return { state: 'idle', tool, lastAt }
  }
  if (tool) return { state: 'working', tool, lastAt }
  if (lastKind === 'assistant-text') {
    // 답변을 마침: 서브에이전트는 끝, 메인은 사용자 차례
    if (!isMain) return { state: 'ended', tool: null, lastAt }
    return { state: age > MAIN_GONE_MS ? 'ended' : 'waiting', tool: null, lastAt }
  }
  if (age > (isMain ? MAIN_GONE_MS : RECENT_MS)) return { state: 'ended', tool: null, lastAt }
  return { state: age > IDLE_MS ? 'idle' : 'working', tool: null, lastAt }
}

/** 메인이 서브에이전트를 맡겨 두고 기다릴 때 말풍선 칩에 보일 도구 이름(전경 Agent 호출과 같게) */
export const SUPERVISE_TOOL = 'Agent'

/**
 * 서브에이전트가 일하는 동안의 메인 상태. 백그라운드로 띄운 에이전트는 Agent 도구 결과가 바로 돌아와
 * 메인 jsonl 만 보면 답변을 마친 사용자 차례(waiting)·졸음·퇴장으로 나온다. 그러면 메인이 쉬러 가거나
 * 사라져 정작 일이 돌고 있는데 덜 활발해 보이므로, 일하는 서브가 하나라도 있으면 메인도 작업 중으로 본다.
 * AskUserQuestion 대기는 사용자가 답해야 하므로 그대로 둔다.
 */
export function withAgents(main: Status, agents: readonly Status[]): Status {
  if (main.state === 'working' || main.tool === 'AskUserQuestion') return main
  const busy = agents.filter((a) => a.state === 'working')
  if (!busy.length) return main
  const lastAt = Math.max(main.lastAt, ...busy.map((a) => a.lastAt))
  return { state: 'working', tool: SUPERVISE_TOOL, lastAt }
}

/**
 * 막 생긴 세션은 Claude Code 가 sessions/<pid>.json 의 sessionId 를 갱신하기 전일 수 있다(/clear·새 세션).
 * 이만큼 안에 기록된 세션은 프로세스 목록에 없어도 끝난 것으로 보지 않는다.
 */
export const ALIVE_GRACE_MS = 30 * 1000

/**
 * 실행 중인 Claude Code 프로세스 정보로 메인 상태를 고친다.
 * - 프로세스가 살아 있으면 오래 조용해도 퇴장시키지 않는다(사용자 차례로 본다). 열어 둔 세션의 메인은 자리를 지킨다.
 * - 프로세스가 없으면 조용한 시간을 기다리지 않고 바로 퇴장시킨다. 단 막 기록된 세션은 ALIVE_GRACE_MS 동안 둔다.
 * sinceWrite 는 메인 jsonl 이 마지막으로 쓰인 뒤 지난 시간이다.
 */
export function withProcess(main: Status, alive: boolean, sinceWrite: number): Status {
  if (alive) return main.state === 'ended' ? { state: 'waiting', tool: null, lastAt: main.lastAt } : main
  if (sinceWrite < ALIVE_GRACE_MS) return main
  return { state: 'ended', tool: null, lastAt: main.lastAt }
}
