/**
 * 픽셀아트 배경과 실내 조명이 공유하는 시간대별 하늘색과 밤의 세기.
 * exterior.ts에서 낮과 밤의 파노라마를 이 값으로 전환한다.
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
