import { describe, expect, it } from 'vitest'
import { curvedWindowGeometry, windowArc } from '../windowGeometry'
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
})
