import { describe, it, expect } from 'vitest'
import {
  analyzeTail,
  IDLE_MS,
  MAIN_GONE_MS,
  RECENT_MS,
  STALL_MS,
  SUPERVISE_TOOL,
  withAgents,
  withProcess,
  ALIVE_GRACE_MS,
} from './analyze'

const NOW = Date.parse('2026-01-01T00:10:00.000Z')
const at = (secAgo: number) => new Date(NOW - secAgo * 1000).toISOString()

const assistant = (blocks: unknown[], stop: string | null, secAgo = 1) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: at(secAgo),
    message: { id: 'm1', stop_reason: stop, content: blocks },
  })
const user = (blocks: unknown[], secAgo = 1) =>
  JSON.stringify({ type: 'user', timestamp: at(secAgo), message: { content: blocks } })
const toolUse = (id: string, name: string) => ({ type: 'tool_use', id, name, input: {} })
const toolResult = (id: string) => ({ type: 'tool_result', tool_use_id: id, content: 'x' })

const run = (lines: string[], isMain: boolean) =>
  analyzeTail(lines.join('\n') + '\n', NOW, isMain, NOW)

describe('analyzeTail (AI 작업 사무실 상태 판정)', () => {
  const prompt = user([{ type: 'text', text: 'q' }], 10)

  it.each([true, false])(
    'thinking 줄만 있고 tool_use 줄이 아직 없으면 working (main=%s)',
    (isMain) => {
      for (const stop of [null, 'tool_use', 'end_turn']) {
        const s = run([prompt, assistant([{ type: 'thinking' }], stop)], isMain)
        expect(s.state).toBe('working')
      }
    },
  )

  it('text 줄의 stop_reason 이 tool_use 또는 null 이면 working', () => {
    for (const stop of ['tool_use', null]) {
      expect(run([prompt, assistant([{ type: 'text' }], stop)], false).state).toBe('working')
      expect(run([prompt, assistant([{ type: 'text' }], stop)], true).state).toBe('working')
    }
  })

  it('도구 호출 대기 중이면 working + 도구 이름', () => {
    const s = run([prompt, assistant([toolUse('t1', 'Bash')], null)], false)
    expect(s).toMatchObject({ state: 'working', tool: 'Bash' })
  })

  it('tool_result 직후(다음 응답 전)는 working', () => {
    const s = run(
      [prompt, assistant([toolUse('t1', 'Bash')], 'tool_use', 3), user([toolResult('t1')], 1)],
      false,
    )
    expect(s.state).toBe('working')
  })

  it.each(['end_turn', 'stop_sequence', 'max_tokens'])(
    'text + %s 이면 서브는 ended, 메인은 waiting',
    (stop) => {
      const lines = [prompt, assistant([{ type: 'text' }], stop)]
      expect(run(lines, false).state).toBe('ended')
      expect(run(lines, true).state).toBe('waiting')
    },
  )

  it('메인은 답변 후 MAIN_GONE_MS 가 지나면 ended', () => {
    const lines = [assistant([{ type: 'text' }], 'end_turn', MAIN_GONE_MS / 1000 + 5)]
    expect(run(lines, true).state).toBe('ended')
  })

  it('AskUserQuestion 이 미응답이면 waiting', () => {
    const s = run([prompt, assistant([toolUse('q1', 'AskUserQuestion')], 'tool_use')], true)
    expect(s).toMatchObject({ state: 'waiting', tool: 'AskUserQuestion' })
  })

  it('thinking 만 남고 세션이 멈추면 IDLE_MS 후 idle, 서브는 RECENT_MS 후 ended', () => {
    const idle = [assistant([{ type: 'thinking' }], 'end_turn', IDLE_MS / 1000 + 5)]
    expect(run(idle, false).state).toBe('idle')
    const gone = [assistant([{ type: 'thinking' }], 'end_turn', RECENT_MS / 1000 + 5)]
    expect(run(gone, false).state).toBe('ended')
    expect(run(gone, true).state).toBe('ended')
  })

  it('깨진 줄과 모르는 타입은 건너뛴다', () => {
    const s = run(
      ['{bad', JSON.stringify({ type: 'attachment' }), assistant([{ type: 'thinking' }], null)],
      false,
    )
    expect(s.state).toBe('working')
  })

  describe('서브에이전트 종료 도구(SubagentHandback)', () => {
    const handback = assistant([toolUse('h1', 'SubagentHandback')], 'tool_use', 3)
    const done = user([toolResult('h1')], 2)

    it('보고 도구 호출 중에는 working, 성공한 tool_result 가 오면 서브는 ended', () => {
      expect(run([prompt, handback], false)).toMatchObject({
        state: 'working',
        tool: 'SubagentHandback',
      })
      expect(run([prompt, handback, done], false)).toMatchObject({ state: 'ended', tool: null })
    })

    it('뒤에 text+end_turn 줄이 와도 ended 를 유지한다', () => {
      const tail = assistant([{ type: 'text' }], 'end_turn', 1)
      expect(run([prompt, handback, done, tail], false).state).toBe('ended')
    })

    it('메인에는 적용하지 않는다', () => {
      expect(run([prompt, handback, done], true).state).toBe('working')
    })

    it('보고 도구가 실패(is_error)하면 ended 로 보지 않는다', () => {
      const failed = user([{ ...toolResult('h1'), is_error: true }], 2)
      expect(run([prompt, handback, failed], false).state).toBe('working')
    })

    it('보고 뒤에 도구 호출이 이어지면 working 으로 돌아온다', () => {
      const resumed = assistant([toolUse('b1', 'Bash')], 'tool_use', 1)
      expect(run([prompt, handback, done, resumed], false)).toMatchObject({
        state: 'working',
        tool: 'Bash',
      })
    })

    it('보고 뒤에 새 사용자 입력이 오면 working 으로 돌아온다', () => {
      const again = user([{ type: 'text', text: 'again' }], 1)
      expect(run([prompt, handback, done, again], false).state).toBe('working')
    })
  })
})

describe('withAgents (서브에이전트가 일하는 동안의 메인)', () => {
  const st = (state: 'working' | 'waiting' | 'idle' | 'ended', tool: string | null, lastAt: number) => ({
    state,
    tool,
    lastAt,
  })

  it.each(['waiting', 'idle', 'ended'] as const)(
    '메인이 %s 여도 일하는 서브가 있으면 작업 중(Agent)이고, 시각은 더 최근 것을 쓴다',
    (state) => {
      expect(withAgents(st(state, null, 100), [st('working', 'Bash', 300), st('ended', null, 900)])).toEqual(
        st('working', SUPERVISE_TOOL, 300),
      )
    },
  )

  it('메인이 이미 작업 중이거나 AskUserQuestion 대기면 그대로 둔다', () => {
    const busy = [st('working', 'Bash', 300)]
    expect(withAgents(st('working', 'Read', 100), busy)).toEqual(st('working', 'Read', 100))
    expect(withAgents(st('waiting', 'AskUserQuestion', 100), busy)).toEqual(
      st('waiting', 'AskUserQuestion', 100),
    )
  })

  it('일하는 서브가 없으면 그대로 둔다', () => {
    expect(withAgents(st('waiting', null, 100), [st('idle', null, 300), st('ended', null, 300)])).toEqual(
      st('waiting', null, 100),
    )
  })
})

describe('응답 없음(서브가 도구 결과를 오래 못 받음)', () => {
  const prompt = user([{ type: 'text', text: 'q' }], 2000)
  const waitingOn = (name: string, secAgo: number) => assistant([toolUse('t1', name)], 'tool_use', secAgo)
  const over = STALL_MS / 1000 + 60
  const under = STALL_MS / 1000 - 60

  it('서브의 일반 도구가 STALL_MS 를 넘기면 idle(도구 이름은 남긴다), 그 전은 working', () => {
    expect(run([prompt, waitingOn('Bash', over)], false)).toMatchObject({ state: 'idle', tool: 'Bash' })
    expect(run([prompt, waitingOn('Bash', under)], false)).toMatchObject({ state: 'working', tool: 'Bash' })
  })

  it('메인이나 서브를 다시 띄우는 도구는 오래 걸려도 working', () => {
    expect(run([prompt, waitingOn('Bash', over)], true).state).toBe('working')
    for (const name of ['Agent', 'Task', 'Workflow']) {
      expect(run([prompt, waitingOn(name, over)], false).state).toBe('working')
    }
  })
})

describe('실행 중인 프로세스로 메인 상태 고치기(withProcess)', () => {
  const st = (state: 'working' | 'waiting' | 'idle' | 'ended') => ({ state, tool: null, lastAt: 100 })

  it('프로세스가 살아 있으면 오래 조용해 퇴장으로 나온 메인도 사용자 차례로 남긴다', () => {
    expect(withProcess(st('ended'), true, 60 * 60 * 1000)).toEqual(st('waiting'))
    expect(withProcess(st('working'), true, 0)).toEqual(st('working'))
  })

  it('프로세스가 없으면 바로 퇴장, 단 막 기록된 세션은 유예한다', () => {
    expect(withProcess(st('waiting'), false, ALIVE_GRACE_MS + 1)).toEqual(st('ended'))
    expect(withProcess(st('working'), false, ALIVE_GRACE_MS - 1)).toEqual(st('working'))
  })
})
