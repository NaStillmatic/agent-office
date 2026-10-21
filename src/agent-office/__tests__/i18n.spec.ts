import { afterAll, describe, expect, it } from 'vitest'
import { LOCALES, MESSAGES, detectLocale, setLocale } from '../../i18n'
import { agentLabel, mainTitle, type SessionInfo } from '../scene'

/** 사전의 키 모양(중첩 포함). 함수·문자열·배열 종류까지 비교한다 */
function shape(v: unknown): unknown {
  if (typeof v === 'function') return 'fn'
  if (Array.isArray(v)) return v.map(shape)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]))
  }
  return typeof v
}

describe('다국어 사전', () => {
  afterAll(() => setLocale('en'))

  it('모든 언어 사전이 한국어 사전과 같은 키를 가진다', () => {
    for (const l of LOCALES) expect(shape(MESSAGES[l])).toEqual(shape(MESSAGES.ko))
  })

  it('비어 있는 문구가 없다', () => {
    const strings = (v: unknown): string[] =>
      typeof v === 'string'
        ? [v]
        : Array.isArray(v) || (v && typeof v === 'object')
          ? Object.values(v as object).flatMap(strings)
          : []
    for (const l of LOCALES) for (const str of strings(MESSAGES[l])) expect(str.trim()).not.toBe('')
  })

  it('브라우저 언어 목록에서 지원하는 첫 언어를 고르고, 없으면 영어', () => {
    expect(detectLocale(['ja-JP', 'en-US'])).toBe('ja')
    expect(detectLocale(['zh-TW'])).toBe('zh')
    expect(detectLocale(['fr-FR', 'ko'])).toBe('ko')
    expect(detectLocale(['de-DE'])).toBe('en')
    expect(detectLocale([])).toBe('en')
  })

  it('시간 표시는 언어마다 단위를 바꾼다', () => {
    expect(MESSAGES.ko.ago(75)).toBe('1분 15초 전')
    expect(MESSAGES.en.ago(75)).toBe('1m 15s ago')
    expect(MESSAGES.ja.ago(3700)).toBe('1時間1分前')
    expect(MESSAGES.zh.ago(5)).toBe('5秒前')
  })

  it('3D 장면 문구(이름표·말풍선)도 지금 언어를 따른다', () => {
    const s: SessionInfo = {
      id: 's',
      project: 'p',
      main: { state: 'working', tool: 'Agent', lastAt: 0 },
      agents: [{ id: 'a', agentType: '', description: '', state: 'working', tool: 'Bash', lastAt: 0 }],
    }
    setLocale('en')
    expect(agentLabel('')).toBe('Subagent')
    expect(mainTitle(s)).toBe('Waiting for Subagent')
    setLocale('ja')
    expect(mainTitle(s)).toBe('サブエージェント を待機中')
    setLocale('zh')
    expect(mainTitle({ ...s, agents: [] })).toBe('主 Claude')
  })
})
