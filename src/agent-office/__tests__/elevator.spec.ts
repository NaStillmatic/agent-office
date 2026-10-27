import { describe, expect, it } from 'vitest'
import { arrivalCanAppear, FloorElevator } from '../elevator'
import { DOOR, ELEVATOR, LAYOUT, cellOf, findPath, key } from '../layout'

describe('엘리베이터 출입', () => {
  it('바닥 높이까지 올라오기 전에는 출입을 허용하지 않는다', () => {
    const lift = new FloorElevator()
    expect(lift.height).toBeLessThan(0)
    lift.update(0.5, true)
    expect(lift.ready).toBe(false)
    expect(lift.height).toBeGreaterThan(lift.bottom)
    lift.update(1, true)
    expect(lift.ready).toBe(true)
    expect(lift.height).toBe(0)
  })

  it('출입 요청이 이어지면 바닥에 머물고, 사람이 떠난 뒤에는 바닥 아래로 사라진다', () => {
    const lift = new FloorElevator()
    lift.update(2, true)
    for (let i = 0; i < 20; i++) lift.update(0.1, true)
    expect(lift.ready).toBe(true)
    for (let i = 0; i < 40; i++) lift.update(0.1, false)
    expect(lift.state).toBe('hidden')
    expect(lift.height).toBe(lift.bottom)
  })

  it('퇴장 승객을 태우고 내려가며 새 요청이 와도 하강을 마친 뒤 다시 올라온다', () => {
    const lift = new FloorElevator()
    lift.update(2, true)
    lift.update(0.1, false, true)
    lift.update(0.5, true)
    expect(lift.state).toBe('lowering')
    expect(lift.height).toBeLessThan(0)
    lift.update(2, true)
    expect(lift.state).toBe('hidden')
    lift.update(0.1, true)
    expect(lift.state).toBe('rising')
    lift.update(10, true)
    expect(lift.height).toBe(0)
  })

  it('출발과 도착에서 속도를 부드럽게 줄이며 왕복한다', () => {
    const lift = new FloorElevator()
    const positions = [lift.height]
    for (let i = 0; i < 14; i++) {
      lift.update(0.1, true)
      positions.push(lift.height)
    }
    expect(lift.ready).toBe(true)
    expect(positions[1] - positions[0]).toBeLessThan(positions[7] - positions[6])
    expect(positions[14] - positions[13]).toBeLessThan(positions[7] - positions[6])
    lift.update(0, false, true)
    for (let i = 0; i < 14; i++) lift.update(0.1, false)
    expect(lift.state).toBe('hidden')
    expect(lift.height).toBe(lift.bottom)
  })

  it('먼저 도착한 사람이 객실을 벗어나야 다음 사람이 나타난다', () => {
    const cabin = { x: 3, z: 3 }
    const arrival = { x: 3, z: 3, entering: true, visible: true, removed: false }
    expect(arrivalCanAppear(cabin, [arrival])).toBe(false)
    expect(arrivalCanAppear(cabin, [{ ...arrival, visible: false }])).toBe(true)
    expect(arrivalCanAppear(cabin, [{ ...arrival, x: 4 }])).toBe(true)
    expect(arrivalCanAppear(cabin, [{ ...arrival, removed: true }])).toBe(true)
  })

  it('화면 위쪽 중앙의 엘리베이터에서 객실·로비를 거쳐 모든 자리까지 오갈 수 있고 객실 뒤·옆은 막혀 있다', () => {
    expect(Math.abs(ELEVATOR.z - LAYOUT.items.find(item => item.model === 'loungeSofa')!.z)).toBeLessThan(0.5)
    expect(ELEVATOR.x).toBeLessThan(4)
    for (const seat of LAYOUT.seats) {
      const path = findPath(DOOR, { x: seat.cx, z: seat.cz }, LAYOUT.blocked)
      expect(path, seat.id).not.toBeNull()
      expect(path!.some((p) => p.x > ELEVATOR.frontX)).toBe(true)
      for (const p of path!.filter((p) => p.x >= ELEVATOR.frontX && p.x < ELEVATOR.frontX + 0.2 && Math.abs(p.z - ELEVATOR.z) < 0.8)) {
        expect(p.z).toBeCloseTo(ELEVATOR.z)
      }
      expect(findPath({ x: seat.cx, z: seat.cz }, DOOR, LAYOUT.blocked), seat.id).not.toBeNull()
    }
    for (const z of [ELEVATOR.z - 0.76, ELEVATOR.z + 0.76]) {
      expect(LAYOUT.blocked.has(key(cellOf(ELEVATOR.x), cellOf(z)))).toBe(true)
    }
    expect(LAYOUT.blocked.has(key(cellOf(ELEVATOR.x - 0.64), cellOf(ELEVATOR.z)))).toBe(true)
  })
})
