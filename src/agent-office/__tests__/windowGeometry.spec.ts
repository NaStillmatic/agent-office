import { describe, expect, it } from 'vitest'
import { curvedTrimGeometry, curvedWindowGeometry, windowArc } from '../windowGeometry'
import { WINDOW_RADIUS, W, D, LAYOUT, cellOf, key } from '../layout'

describe('완만한 코너 창문', () => {
  it('정사각형의 두 직선 창면과 곡면 끝이 연결된다', () => {
    expect(W).toBe(18)
    expect(D).toBe(18)
    const points = windowArc(WINDOW_RADIUS)
    expect(points[0].x).toBeCloseTo(0)
    expect(points[0].z).toBeCloseTo(WINDOW_RADIUS)
    expect(points.at(-1)!.x).toBeCloseTo(WINDOW_RADIUS)
    expect(points.at(-1)!.z).toBeCloseTo(0)
    for (const window of LAYOUT.windows) {
      const center = window.wall === 'N' ? window.x! : window.z!
      expect(center - window.w / 2).toBeCloseTo(WINDOW_RADIUS)
      expect(center + window.w / 2).toBeCloseTo(18)
    }
    for (const p of points) expect(Math.hypot(p.x - WINDOW_RADIUS, p.z - WINDOW_RADIUS)).toBeCloseTo(WINDOW_RADIUS)
  })

  it('곡면이 실내를 향하고 유리 바깥 코너로 걸어나가지 않는다', () => {
    const geometry = curvedWindowGeometry(WINDOW_RADIUS, 3)
    const normals = geometry.getAttribute('normal')
    for (let i = 0; i < normals.count; i++) {
      expect(normals.getX(i)).toBeGreaterThanOrEqual(-1e-6)
      expect(normals.getZ(i)).toBeGreaterThanOrEqual(-1e-6)
    }
    expect(LAYOUT.blocked.has(key(cellOf(0.25), cellOf(0.25)))).toBe(true)
    expect(LAYOUT.blocked.has(key(cellOf(2), cellOf(2)))).toBe(false)
    geometry.dispose()
  })
  it('matches the straight sill at both ends without a height step', () => {
    const trim = curvedTrimGeometry(WINDOW_RADIUS, 0, 0.085, -0.055, 0.185)
    const p = trim.getAttribute('position')
    let low = Infinity, high = -Infinity
    for (let i = 0; i < p.count; i++) { low = Math.min(low, p.getY(i)); high = Math.max(high, p.getY(i)) }
    expect(low).toBeCloseTo(0)
    expect(high).toBeCloseTo(0.085)
    const has = (x: number, z: number) => Array.from({ length: p.count }, (_, i) => i).some(i =>
      Math.abs(p.getX(i) - x) < 1e-5 && Math.abs(p.getZ(i) - z) < 1e-5 && Math.abs(p.getY(i) - 0.085) < 1e-5,
    )
    expect(has(-0.055, WINDOW_RADIUS)).toBe(true)
    expect(has(0.185, WINDOW_RADIUS)).toBe(true)
    expect(has(WINDOW_RADIUS, -0.055)).toBe(true)
    expect(has(WINDOW_RADIUS, 0.185)).toBe(true)
    trim.dispose()
  })

})
