/**
 * 상태줄 브리지(선택 기능). Claude Code 는 상태줄을 그릴 때마다 상태줄 명령의 stdin 으로 세션 정보 JSON 을 넘기고,
 * 여기에는 사용량 한도(rate_limits: five_hour·seven_day 의 used_percentage·resets_at)가 들어 있다.
 * 이 스크립트는 그 사용률 숫자만 `<설정 폴더>/agent-office-usage.json` 에 남기고, 원래 상태줄 명령
 * (statusline:install 이 `agent-office-statusline.json` 에 저장해 둔 것)을 같은 stdin 으로 실행해 그 출력을 그대로 내보낸다.
 * 사용량 기록에 실패해도 원래 상태줄은 항상 나오게 한다. 외부 패키지 없이 node 만으로 돈다.
 */
import { spawn } from 'node:child_process'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')

/** rate_limits 에서 사용률(0~100)과 초기화 시각(ms)만 뽑는다. 둘 다 없으면 null */
export function usageFromStatusline(input, now = Date.now()) {
  const rl = input?.rate_limits
  if (!rl || typeof rl !== 'object') return null
  const win = (w) => {
    if (!w || typeof w.used_percentage !== 'number' || !Number.isFinite(w.used_percentage)) return null
    const reset = typeof w.resets_at === 'number' && w.resets_at > 0 ? w.resets_at * 1000 : null
    return { pct: Math.max(0, Math.min(100, w.used_percentage)), resetsAt: reset }
  }
  const session = win(rl.five_hour)
  const weekly = win(rl.seven_day)
  if (!session && !weekly) return null
  return { session, weekly, fetchedAt: now }
}

async function main() {
  const chunks = []
  for await (const c of process.stdin) chunks.push(c)
  const raw = Buffer.concat(chunks)

  try {
    const usage = usageFromStatusline(JSON.parse(raw.toString('utf-8')))
    if (usage) {
      const file = join(configDir, 'agent-office-usage.json')
      writeFileSync(`${file}.tmp`, JSON.stringify(usage))
      renameSync(`${file}.tmp`, file)
    }
  } catch {
    // 형식이 다르거나 쓰기에 실패해도 상태줄은 그대로 그린다
  }

  let wrapped = ''
  try {
    wrapped = JSON.parse(readFileSync(join(configDir, 'agent-office-statusline.json'), 'utf-8')).command ?? ''
  } catch {
    // 원래 상태줄 명령이 없으면 아무것도 출력하지 않는다
  }
  if (!wrapped) return
  const child = spawn('sh', ['-c', wrapped], { stdio: ['pipe', 'inherit', 'inherit'] })
  child.stdin.end(raw)
  child.on('exit', (code) => process.exit(code ?? 0))
}

if (import.meta.url === `file://${process.argv[1]}`) main()
