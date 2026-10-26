import { beforeAll, describe, expect, it } from 'vitest'
import { setLocale } from '../../i18n'
import { agentLabel, mainTitle, spawningAgent, toolLabel, type AgentInfo, type SessionInfo } from '../scene'


// 이 파일은 한국어 문구로 검사한다(언어별 문구는 i18n.spec.ts)
beforeAll(() => setLocale('ko'))

const agent = (agentType: string, state: AgentInfo['state']): AgentInfo => ({
  id: agentType + state,
  agentType,
  description: '',
  state,
  tool: state === 'working' ? 'Bash' : null,
  lastAt: 0,
})
const session = (tool: string | null, agents: AgentInfo[]): SessionInfo => ({
  id: 's',
  project: 'p',
  main: { state: 'working', tool, lastAt: 0 },
  agents,
})

describe('메인 말풍선 설명(mainTitle)', () => {
  it('Agent·Task 를 기다리면 일하는 에이전트 이름을 적고, 같은 종류가 여럿이면 인원수를 붙인다', () => {
    const agents = [agent('bug-fixer', 'working'), agent('bug-fixer', 'working'), agent('', 'working')]
    expect(mainTitle(session('Agent', agents))).toBe('bug-fixer ×2 · 서브에이전트 기다리는 중')
    expect(mainTitle(session('Task', agents.slice(0, 1)))).toBe('bug-fixer 기다리는 중')
  })

  it('일하는 에이전트가 없거나 다른 도구면 이름표와 같은 문구(설명 줄 숨김)', () => {
    expect(mainTitle(session('Agent', [agent('bug-fixer', 'ended')]))).toBe('메인 에이전트')
    expect(mainTitle(session('Bash', [agent('bug-fixer', 'working')]))).toBe('메인 에이전트')
    expect(mainTitle(session(null, []))).toBe('메인 에이전트')
  })
})

describe('에이전트를 막 띄운 순간(spawningAgent)', () => {
  it('Agent·Task 를 기다리는데 일하는 에이전트가 아직 없으면 true', () => {
    expect(spawningAgent(session('Agent', []))).toBe(true)
    expect(spawningAgent(session('Task', [agent('bug-fixer', 'ended')]))).toBe(true)
  })

  it('에이전트가 잡혔거나 다른 도구면 false', () => {
    expect(spawningAgent(session('Agent', [agent('bug-fixer', 'working')]))).toBe(false)
    expect(spawningAgent(session('Bash', []))).toBe(false)
    expect(spawningAgent(session(null, []))).toBe(false)
  })
})

describe('도구 이름 줄이기(toolLabel)', () => {
  it('MCP 도구는 서버 · 도구 로 줄이고, 플러그인 서버 이름 중복을 없앤다', () => {
    expect(toolLabel('mcp__plugin_playwright_playwright__browser_take_screenshot')).toBe(
      'playwright · take screenshot',
    )
    expect(toolLabel('mcp__claude-in-chrome__computer')).toBe('claude-in-chrome · computer')
    expect(toolLabel('mcp__claude_ai_Claude_Docs__batch')).toBe('Claude Docs · batch')
    expect(toolLabel('mcp__plugin_figma_figma__get_design_context')).toBe('figma · get design context')
  })

  it('기본 도구 이름은 그대로', () => {
    for (const name of ['Bash', 'Read', 'Agent', 'AskUserQuestion']) expect(toolLabel(name)).toBe(name)
  })
})

describe('서브에이전트 이름(agentLabel)', () => {
  it('어떤 프로젝트의 agentType 이든 그대로 쓰고, 플러그인 에이전트는 에이전트 이름만', () => {
    expect(agentLabel('bug-fixer')).toBe('bug-fixer')
    expect(agentLabel('general-purpose')).toBe('general-purpose')
    expect(agentLabel('Explore')).toBe('Explore')
    expect(agentLabel('feature-dev:code-reviewer')).toBe('code-reviewer')
    expect(agentLabel('claude-security:scan-researcher')).toBe('scan-researcher')
  })

  it('agentType 을 모르면 서브에이전트', () => {
    expect(agentLabel('')).toBe('서브에이전트')
  })

  it('메인 말풍선의 기다리는 에이전트 이름도 같은 규칙', () => {
    const agents = [agent('feature-dev:code-reviewer', 'working'), agent('', 'working')]
    expect(mainTitle(session('Agent', agents))).toBe('code-reviewer · 서브에이전트 기다리는 중')
  })
})
