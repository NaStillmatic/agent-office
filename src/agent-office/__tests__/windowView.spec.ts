import { describe, expect, it } from 'vitest'
import { nightness, skyAt } from '../windowView'

describe('창밖 풍경', () => {
  it('정해 둔 시각에는 그 색, 사이 시각은 이웃 색을 섞는다', () => {
    expect(skyAt(12)).toEqual({ top: 'rgb(79,169,232)', bottom: 'rgb(191,227,247)' })
    const mid = skyAt(10.5) // 9시와 12시 사이
    expect(mid.top).not.toBe(skyAt(9).top)
    expect(mid.top).not.toBe(skyAt(12).top)
  })

  it('하루가 이어진다: 24시는 0시와 같고, 범위 밖 시각도 감아 돈다', () => {
    expect(skyAt(24)).toEqual(skyAt(0))
    expect(skyAt(-1)).toEqual(skyAt(23))
    expect(skyAt(25.5)).toEqual(skyAt(1.5))
  })

  it('밤 정도: 낮 0, 밤 1, 새벽·저녁은 그 사이', () => {
    expect(nightness(12)).toBe(0)
    expect(nightness(23)).toBe(1)
    expect(nightness(3)).toBe(1)
    expect(nightness(6)).toBeGreaterThan(0)
    expect(nightness(6)).toBeLessThan(1)
    expect(nightness(18.5)).toBeGreaterThan(0)
    expect(nightness(18.5)).toBeLessThan(1)
  })
})
