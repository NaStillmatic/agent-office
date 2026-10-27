import { describe, expect, it } from 'vitest'
import { filterSessions, isProviderFilter, visibleProviders, type Provider } from '../providers'

describe('provider filter', () => {
  const sessions = [
    { id: 'same-project-a', provider: 'claude' as Provider, agents: ['review'] },
    { id: 'same-project-b', provider: 'codex' as Provider, agents: ['worker'] },
  ]
  it('keeps whole sessions and their subagents together using explicit source metadata', () => {
    expect(filterSessions(sessions, 'all')).toEqual(sessions)
    expect(filterSessions(sessions, 'claude')).toEqual([sessions[0]])
    expect(filterSessions(sessions, 'codex')).toEqual([sessions[1]])
    expect(filterSessions([sessions[0]], 'codex')).toEqual([])
    expect(filterSessions([{}], 'claude')).toEqual([])
    expect(filterSessions([{}], 'all')).toEqual([{}])
  })
  it('does not infer provider from project names or UUIDs', () => {
    expect(filterSessions([{ id: 'codex-project', provider: 'claude' as Provider }], 'codex')).toEqual([])
  })
  it('validates persisted choices and uses separate usage groups', () => {
    expect(isProviderFilter('all')).toBe(true)
    expect(isProviderFilter('unknown')).toBe(false)
    expect(isProviderFilter(null)).toBe(false)
    expect(visibleProviders('all')).toEqual(['claude', 'codex'])
    expect(visibleProviders('codex')).toEqual(['codex'])
  })
})
