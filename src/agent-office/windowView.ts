/**
 * 큰 창 밖 풍경. 실제 시계(시각, 0~24)를 따라 하늘이 새벽 → 아침 → 낮 → 해질녘 → 밤으로 이어진다.
 * 하늘 색은 아래 시각별 색(SKY)을 이웃끼리 섞고, 해·달은 시각에 따라 창을 가로질러 움직이며,
 * 멀리 보이는 건물 실루엣은 어두워질수록 창에 불이 켜진다. three 에 의존하지 않는 캔버스 그리기라 단위 테스트가 가능하다.
 */

/** 시각별 하늘(위·지평선) 색. 24시는 0시와 같다 */
const SKY: { h: number; top: string; bottom: string }[] = [
  { h: 0, top: '#0b1026', bottom: '#1c2541' },
  { h: 5, top: '#1c2541', bottom: '#3a3f6b' },
  { h: 6.5, top: '#5b7bb5', bottom: '#f7b37a' }, // 동틀 녘
  { h: 9, top: '#6fb7ea', bottom: '#cbe8f7' }, // 아침
  { h: 12, top: '#4fa9e8', bottom: '#bfe3f7' }, // 한낮
  { h: 16, top: '#5fa6dc', bottom: '#e8d9b0' }, // 오후
  { h: 18, top: '#3b4b8a', bottom: '#f08a4b' }, // 해질녘
  { h: 19.5, top: '#1e2a5a', bottom: '#5a4a78' }, // 땅거미
  { h: 21, top: '#0b1026', bottom: '#1c2541' },
  { h: 24, top: '#0b1026', bottom: '#1c2541' },
]

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
function mix(a: string, b: string, t: number) {
  const [x, y] = [hex(a), hex(b)]
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`
}

/** 시각(0~24)의 하늘 위·아래 색 */
export function skyAt(hour: number) {
  const h = ((hour % 24) + 24) % 24
  const i = SKY.findIndex((k) => k.h > h)
  const [a, b] = [SKY[i - 1], SKY[i]]
  const t = (h - a.h) / (b.h - a.h)
  return { top: mix(a.top, b.top, t), bottom: mix(a.bottom, b.bottom, t) }
}

/** 밤 정도(0 낮 ~ 1 밤). 건물 불빛·별의 세기에 쓴다 */
export function nightness(hour: number) {
  const h = ((hour % 24) + 24) % 24
  if (h >= 7 && h <= 17) return 0
  if (h >= 20 || h <= 5) return 1
  return h < 12 ? (7 - h) / 2 : (h - 17) / 3
}

/** 고정 시드 난수: 새로 그려도 건물·창 배치가 그대로다 */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 창밖 풍경을 캔버스에 그린다 */
export function drawWindowView(cv: HTMLCanvasElement, hour: number) {
  const g = cv.getContext('2d')!
  const W = cv.width
  const H = cv.height
  const sky = skyAt(hour)
  const night = nightness(hour)
  const grad = g.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, sky.top)
  grad.addColorStop(1, sky.bottom)
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)

  const rnd = seeded(7)
  // 별(밤에만)
  for (let i = 0; i < 40; i++) {
    const x = rnd() * W
    const y = rnd() * H * 0.55
    const a = night * (0.4 + rnd() * 0.6)
    if (a <= 0.05) continue
    g.fillStyle = `rgba(255,255,255,${a})`
    g.fillRect(x, y, 2, 2)
  }

  // 해(6~18시)·달(18~30시): 창 왼쪽에서 오른쪽으로 포물선을 그리며 지나간다
  const h = ((hour % 24) + 24) % 24
  const day = h >= 6 && h < 18
  const p = day ? (h - 6) / 12 : (((h + 6) % 24) / 12)
  const cx = W * (0.08 + 0.84 * p)
  const cy = H * (0.75 - 0.6 * Math.sin(Math.PI * p))
  if (day) {
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, H * 0.35)
    glow.addColorStop(0, 'rgba(255,240,200,0.55)')
    glow.addColorStop(1, 'rgba(255,240,200,0)')
    g.fillStyle = glow
    g.fillRect(0, 0, W, H)
    g.fillStyle = h < 8 || h > 16.5 ? '#ffd08a' : '#fff6d8'
  } else {
    g.fillStyle = '#f2f0e6'
  }
  g.beginPath()
  g.arc(cx, cy, H * 0.08, 0, Math.PI * 2)
  g.fill()
  if (!day) {
    // 초승달: 하늘색 원으로 한쪽을 가린다
    g.fillStyle = skyAt(hour).top
    g.beginPath()
    g.arc(cx + H * 0.035, cy - H * 0.02, H * 0.075, 0, Math.PI * 2)
    g.fill()
  }

  // 건물 실루엣 두 줄(먼 줄은 옅게). 밤이 될수록 어두워지고 창에 불이 켜진다
  const layer = (base: number, color: string, winA: number, seed: number) => {
    const r = seeded(seed)
    let x = -10
    while (x < W) {
      const bw = 30 + r() * 50
      const bh = H * (base + r() * 0.25)
      g.fillStyle = color
      g.fillRect(x, H - bh, bw, bh)
      if (winA > 0.02) {
        for (let wy = H - bh + 8; wy < H - 6; wy += 10) {
          for (let wx = x + 5; wx < x + bw - 6; wx += 9) {
            if (r() < 0.45) {
              g.fillStyle = `rgba(255,214,120,${winA * (0.5 + r() * 0.5)})`
              g.fillRect(wx, wy, 4, 5)
            }
          }
        }
      }
      x += bw + 2 + r() * 8
    }
  }
  layer(0.25, mix('#9db3c8', '#1a2238', night), night * 0.6, 11)
  layer(0.12, mix('#7d93ab', '#121829', night), night, 23)
}
