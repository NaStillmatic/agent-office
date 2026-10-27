import { OrthographicCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { panoramaBounds, panoramaWeights } from '../exterior'
import { D, W, WALL_SY, WINDOW_RADIUS } from '../layout'
import { windowArc } from '../windowGeometry'

describe('서울 강변 파노라마', () => {
  it('낮·노을·밤 원본을 해당 시간에 그대로 표시한다', () => {
    expect(panoramaWeights(12)).toEqual([1, 0, 0])
    expect(panoramaWeights(18)).toEqual([0, 1, 0])
    expect(panoramaWeights(22)).toEqual([0, 0, 1])
    expect(panoramaWeights(17)).toEqual([0.5, 0.5, 0])
    expect(panoramaWeights(19)).toEqual([0, 0.5, 0.5])
  })

  it('자정·새벽을 포함한 모든 시간에서 밝기 합이 일정하고 전환이 연속적이다', () => {
    for (let hour = -24; hour <= 48; hour += 0.05) {
      const weights = panoramaWeights(hour)
      expect(weights.reduce((sum, w) => sum + w, 0)).toBeCloseTo(1)
      weights.forEach(w => expect(w).toBeGreaterThanOrEqual(0))
      const next = panoramaWeights(hour + 0.001)
      weights.forEach((w, i) => expect(Math.abs(w - next[i])).toBeLessThan(0.001))
    }
    expect(panoramaWeights(24)).toEqual(panoramaWeights(0))
  })

  it.each([0.6, 1, 1400 / 860, 2.4])('화면 비율 %s에서 그림의 비율과 모든 창문 모서리를 보존한다', aspect => {
    const camera = new OrthographicCamera(-15 * aspect, 15 * aspect, 15, -15, 0.1, 200)
    camera.position.set(35, 22, 35)
    camera.lookAt(W / 2, 0, D / 2)
    camera.updateMatrixWorld()
    for (const zoom of [0.7, 1, 1.8]) {
      camera.zoom = zoom
      camera.updateProjectionMatrix()
      const bounds = panoramaBounds(camera, aspect)
      expect(bounds.z * aspect / bounds.w).toBeCloseTo(3)
      for (const [x, z] of [[W, 0], [0, D], ...windowArc(WINDOW_RADIUS).map(p => [p.x, p.z])]) {
        for (const y of [0, 1.29 * WALL_SY]) {
          const p = new Vector3(x, y, z).project(camera)
          expect(p.x).toBeGreaterThanOrEqual(bounds.x - 1e-8)
          expect(p.x).toBeLessThanOrEqual(bounds.x + bounds.z + 1e-8)
          expect(p.y).toBeGreaterThanOrEqual(bounds.y - 1e-8)
          expect(p.y).toBeLessThanOrEqual(bounds.y + bounds.w + 1e-8)
        }
      }
    }
  })
})
