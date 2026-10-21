import { describe, expect, it } from 'vitest'
import { planZones, type SessionInfo } from '../scene'

/** busy: 메인이 일하는 세션, at: 마지막 활동 시각 */
const ses = (id: string, busy: boolean, at: number): SessionInfo => ({
  id,
  project: 'p',
  main: { state: busy ? 'working' : 'waiting', tool: null, lastAt: at },
  agents: [],
})
const none = new Set<string>()

describe('구역 배정(planZones)', () => {
  it('빈 구역은 일하는 세션 → 최근 활동순으로 채운다', () => {
    const live = [ses('a', false, 900), ses('b', true, 100), ses('c', true, 500)]
    expect(planZones([null, null], live, none)).toEqual({ zones: ['c', 'b'], evict: [] })
  })

  it('구역이 꽉 차면 숨은 일하는 세션을 위해 일하지 않는 세션 중 가장 오래 조용한 것을 비켜 세운다', () => {
    const live = [ses('w1', false, 300), ses('w2', false, 100), ses('b1', true, 50), ses('new', true, 999)]
    const r = planZones(['w1', 'w2', 'b1'], live, none)
    expect(r.zones).toEqual(['w1', 'w2', 'b1'])
    expect(r.evict).toEqual(['w2'])
  })

  it('일하는 세션끼리는 밀어내지 않고, 일하지 않는 세션 때문에 비켜 세우지도 않는다', () => {
    const busyFull = [ses('b1', true, 1), ses('b2', true, 2), ses('new', true, 999)]
    expect(planZones(['b1', 'b2'], busyFull, none).evict).toEqual([])
    const idleNew = [ses('w1', false, 1), ses('w2', false, 2), ses('new', false, 999)]
    expect(planZones(['w1', 'w2'], idleNew, none).evict).toEqual([])
  })

  it('이미 나가는 중이거나 끝난 세션의 구역은 곧 비므로 그만큼은 더 비켜 세우지 않는다', () => {
    const live = [ses('w1', false, 1), ses('w2', false, 2), ses('n1', true, 900), ses('n2', true, 800)]
    // gone 은 끝나서 live 에 없다 → n1 몫. n2 를 위해서만 하나 더 비켜 세운다
    expect(planZones(['w1', 'w2', 'gone'], live, none).evict).toEqual(['w1'])
    // w1 이 이미 비켜 주는 중이면 n1 몫은 gone, n2 몫은 w1 이라 새로 비켜 세우지 않는다
    expect(planZones(['w1', 'w2', 'gone'], live, new Set(['w1'])).evict).toEqual([])
  })

  it('서브에이전트만 일하는 세션도 일하는 세션으로 친다', () => {
    const sub: SessionInfo = {
      ...ses('s', false, 10),
      agents: [{ id: 'x', agentType: 't', description: '', state: 'working', tool: 'Bash', lastAt: 10 }],
    }
    const r = planZones(['w1'], [ses('w1', false, 500), sub], none)
    expect(r.evict).toEqual(['w1'])
  })
})
