import { describe, expect, it } from 'vitest'
import { CHARACTER_NAMES } from '../assets'
import { AGENT_LOOKS } from '../office.config'
import { CLOTHES_COLORS, charIndexOf, charOf, pickClothesColor, variantStep } from '../scene'

/** #rrggbb → CIE Lab(D65). 옷 색 사이의 지각 거리를 재는 데 쓴다 */
function lab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92
  })
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

describe('캐릭터 모델·옷 색', () => {
  const entries = Object.entries(AGENT_LOOKS)

  it('고정 표의 모든 모델 이름이 CHARACTER_NAMES 에 있고, 없는 이름은 던진다', () => {
    for (const [type, look] of entries) {
      expect(CHARACTER_NAMES, type).toContain(`character-${look.model}`)
    }
    expect(() => charOf('male-z')).toThrow(/male-z/)
  })

  it('옷 색 후보와 고정 색은 모두 다르고 서로 충분히 떨어져 있다', () => {
    const colors = [...entries.map(([, l]) => l.color), ...CLOTHES_COLORS]
    expect(new Set(colors).size).toBe(colors.length)
    let min = Infinity
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        const a = lab(colors[i])
        const b = lab(colors[j])
        min = Math.min(min, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))
      }
    }
    expect(min).toBeGreaterThanOrEqual(20)
  })

  it('같은 종류는 늘 같은 첫 후보 색을 고른다', () => {
    const c = pickClothesColor('code-reviewer', new Set())
    expect(CLOTHES_COLORS).toContain(c)
    expect(pickClothesColor('code-reviewer', new Set())).toBe(c)
  })

  it('후보가 남는 한 한 화면의 종류끼리는 옷 색이 겹치지 않는다', () => {
    const taken = new Set<string>()
    for (let i = 0; i < CLOTHES_COLORS.length; i++) {
      const c = pickClothesColor(`agent-${i}`, taken)
      expect(taken.has(c), `agent-${i}`).toBe(false)
      taken.add(c)
    }
    // 후보를 다 쓰면 겹치더라도 색은 고른다
    expect(CLOTHES_COLORS).toContain(pickClothesColor('one-more', taken))
  })

  it('같은 type 이 여럿이면 모델이 한 바퀴 돌 때까지 겹치지 않고 옷 색은 그대로다', () => {
    const n = CHARACTER_NAMES.length
    for (const [type, isMain] of [
      ['code-reviewer', false],
      ['main', true],
      ['Explore', false],
    ] as const) {
      const seen = new Set(Array.from({ length: n }, (_, v) => charIndexOf(type, isMain, v)))
      expect(seen.size, type).toBe(n)
    }
    expect(charIndexOf('main', true, 0)).toBe(charOf(AGENT_LOOKS.main.model))
  })

  it('variantStep 은 어떤 풀 크기에서도 풀 크기와 서로소다', () => {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
    for (let n = 3; n <= 30; n++) expect(gcd(variantStep(n), n), `n=${n}`).toBe(1)
  })
})
