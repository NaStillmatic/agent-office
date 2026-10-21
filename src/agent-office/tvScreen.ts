/**
 * 북쪽 벽 TV 화면: 현재 세션(5시간)·주간 사용량을 큰 글씨와 게이지로 그린다. 오른쪽 위에는 지금 시각.
 * 사용량이 없으면(서버가 못 읽음) 게이지 대신 '—' 를 그린다. three 에 의존하지 않는 캔버스 그리기다.
 */
import type { Messages } from '../i18n'

export interface UsageWindow {
  pct: number
  resetsAt: number | null
}
/** 서버 스냅샷의 사용량(server/plugin.ts Usage 와 같은 모양) */
export interface UsageInfo {
  session: UsageWindow | null
  weekly: UsageWindow | null
  fetchedAt: number | null
}

/** 사용률 단계별 색(오른쪽 아래 게이지와 같다) */
export const levelColor = (pct: number) => (pct >= 80 ? '#ff8f8f' : pct >= 50 ? '#f0c56a' : '#7fe0a0')

export function drawTvScreen(cv: HTMLCanvasElement, usage: UsageInfo | null, now: number, m: Messages) {
  const g = cv.getContext('2d')!
  const W = cv.width
  const H = cv.height
  const bg = g.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#16203a')
  bg.addColorStop(1, '#0b1020')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  const pad = W * 0.06
  const font = (px: number, weight = 700) =>
    `${weight} ${Math.round(px)}px -apple-system, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", "Hiragino Sans", "PingFang SC", sans-serif`

  // 머리줄: 제목과 지금 시각
  g.textBaseline = 'middle'
  g.fillStyle = '#c9ccdf'
  g.font = font(H * 0.08)
  g.textAlign = 'left'
  g.fillText(m.usageTitle.toUpperCase(), pad, H * 0.12)
  const d = new Date(now)
  g.textAlign = 'right'
  g.fillText(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, W - pad, H * 0.12)
  g.fillStyle = 'rgba(255,255,255,0.12)'
  g.fillRect(pad, H * 0.2, W - 2 * pad, 2)

  const rows: [string, UsageWindow | null][] = [
    [m.usageSession, usage?.session ?? null],
    [m.usageWeekly, usage?.weekly ?? null],
  ]
  rows.forEach(([name, w], i) => {
    const top = H * (0.27 + i * 0.37)
    g.textAlign = 'left'
    g.fillStyle = '#e6e8f5'
    g.font = font(H * 0.075, 600)
    g.fillText(name, pad, top + H * 0.04)
    g.textAlign = 'right'
    g.font = font(H * 0.13, 800)
    g.fillStyle = w ? levelColor(w.pct) : '#9aa0c0'
    g.fillText(w ? `${Math.round(w.pct)}%` : '—', W - pad, top + H * 0.05)
    // 게이지
    const by = top + H * 0.13
    const bh = H * 0.06
    g.fillStyle = 'rgba(255,255,255,0.1)'
    g.fillRect(pad, by, W - 2 * pad, bh)
    if (w) {
      g.fillStyle = levelColor(w.pct)
      g.fillRect(pad, by, ((W - 2 * pad) * Math.min(100, w.pct)) / 100, bh)
    }
    // 초기화까지 남은 시간
    const left = w?.resetsAt ? Math.ceil((w.resetsAt - now) / 60_000) : null
    if (left !== null && left > 0) {
      g.textAlign = 'left'
      g.fillStyle = '#9aa0c0'
      g.font = font(H * 0.06, 500)
      g.fillText(m.resetsIn(left), pad, by + bh + H * 0.06)
    }
  })
}
