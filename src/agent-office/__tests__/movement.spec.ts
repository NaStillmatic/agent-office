import { describe, expect, it, vi } from 'vitest'
import { OfficeScene } from '../scene'

type Point = { x: number; z: number }
interface Walker extends Point {
  entering: boolean
  path: Point[]
  goal: string
  targetYaw: number
}

// Exercise the actual movement method without constructing a WebGL renderer.
const stepWalk = (OfficeScene.prototype as unknown as {
  stepWalk(ch: Walker, dt: number): void
}).stepWalk

function walker(path: Point[]) {
  const ch: Walker = { x: 0, z: 0, entering: false, path, goal: 'seat', targetYaw: 0 }
  const scene = {
    waitingForElevator: () => false,
    arrive: vi.fn(),
    wantedGoal: () => 'seat',
    go: vi.fn(),
  }
  return { ch, scene, step: (dt: number) => stepWalk.call(scene, ch, dt) }
}

describe('걷기 이동', () => {
  it('프레임 간격과 관계없이 1초에 같은 거리를 걷는다', () => {
    for (const frames of [
      Array(30).fill(1 / 30),
      Array(60).fill(1 / 60),
      Array(120).fill(1 / 120),
      [0.12, 0.08, 0.17, 0.03, 0.2, 0.15, 0.25],
    ]) {
      const w = walker(Array.from({ length: 16 }, (_, i) => ({ x: (i + 1) * 0.25, z: 0 })))
      for (const dt of frames) w.step(dt)
      expect(w.ch.x).toBeCloseTo(1.6, 10)
      expect(w.ch.z).toBe(0)
      expect(w.scene.arrive).not.toHaveBeenCalled()
    }
  })

  it('코너를 가로지르지 않고 남은 거리만큼 다음 구간을 걷는다', () => {
    const w = walker([{ x: 0.25, z: 0 }, { x: 0.25, z: 0.25 }])
    w.step(0.25)
    expect(w.ch.x).toBe(0.25)
    expect(w.ch.z).toBeCloseTo(0.15)
    expect(w.scene.arrive).not.toHaveBeenCalled()
  })

  it('목표가 바뀌면 칸 경계에서 경로를 바꾸고 옛 경로로 더 걷지 않는다', () => {
    const w = walker([{ x: 0.25, z: 0 }, { x: 0.5, z: 0 }])
    w.scene.wantedGoal = () => 'spot'
    w.step(0.25)
    expect(w.ch.x).toBe(0.25)
    expect(w.scene.go).toHaveBeenCalledWith(w.ch, 'spot')
  })

  it('도착점을 넘지 않고 한 번만 도착 처리한다', () => {
    const w = walker([{ x: 0, z: 0 }, { x: 0.25, z: 0 }])
    w.step(0.25)
    expect(w.ch.x).toBe(0.25)
    expect(w.ch.path).toHaveLength(0)
    expect(w.scene.arrive).toHaveBeenCalledTimes(1)
  })

  it('엘리베이터를 기다릴 때는 이동하지 않는다', () => {
    const w = walker([{ x: 0.25, z: 0 }])
    w.scene.waitingForElevator = () => true
    w.step(0.25)
    expect(w.ch.x).toBe(0)
    expect(w.ch.path).toHaveLength(1)
  })
})
