import { describe, expect, it, vi } from 'vitest'
import { classifyRole, pickRoleSeat, roleLabel, roleZone, sharedSeatForSlot, sharedSlotForSeat } from '../roles'
import { CAFE, LAYOUT, ZONE_ORIGIN, type Seat } from '../layout'
import { OfficeScene } from '../scene'

describe('role workspaces', () => {
  it('uses concise planning, backend and frontend labels in each language', () => {
    expect([0, 1, 2].map(zone => roleLabel(zone, 'ko'))).toEqual(['기획', '백엔드', '프론트엔드'])
    expect([0, 1, 2].map(zone => roleLabel(zone, 'en'))).toEqual(['Planning', 'Backend', 'Frontend'])
    expect([0, 1, 2].map(zone => roleLabel(zone, 'ja'))).toEqual(['企画', 'バックエンド', 'フロントエンド'])
    expect([0, 1, 2].map(zone => roleLabel(zone, 'zh'))).toEqual(['规划', '后端', '前端'])
  })
  it.each([
    ['Plan', '', 'planning'], ['feature:architect', '', 'planning'],
    ['worker', 'API 응답 처리', 'backend'], ['frontend-developer', '', 'frontend'],
    ['code-reviewer', 'API 리뷰', 'review'], ['commit-checker', '리뷰', 'ops'],
    ['', '최종 확인', 'review'], ['general-purpose', '', 'general'],
    ['worker', '화면 디자인', 'frontend'], ['explorer', '기획 검토', 'planning'],
    ['worker', 'capital update', 'general'],
  ])('%s / %s → %s', (type, description, expected) => {
    expect(classifyRole(type, description)).toBe(expected)
  })
  it('moves and enlarges the café while keeping operations at the front center', () => {
    expect(CAFE.baristaX).toBe(2.9)
    expect(CAFE.z).toBe(9.85)
    expect(CAFE.baristaX - CAFE.outerHalfWidth).toBeGreaterThan(1.6)
    expect(CAFE.outerHalfWidth * 2).toBeLessThan(2.5)
    expect(CAFE.frontZ - CAFE.startZ).toBeGreaterThan(3.4)
    expect(ZONE_ORIGIN[4]).toEqual({ x: 10.5, z: 11.25 })
  })
  it('faces paired workstations toward one another in every area', () => {
    for (let zone = 0; zone < 6; zone++) {
      if (zone === 3) { expect(LAYOUT.seats.filter(s => s.zone === zone)).toHaveLength(0); continue }
      for (let local = 0; local < 3; local++) {
        const north = LAYOUT.seats.find(s => s.zone === zone && s.local === local)!
        const south = LAYOUT.seats.find(s => s.zone === zone && s.local === local + 3)!
        expect(north.x).toBe(south.x)
        expect(north.z).toBeLessThan(south.z)
        expect(north.yaw).toBe(0)
        expect(south.yaw).toBe(Math.PI)
      }
    }
  })
  it('prioritizes the monitor-facing row and preserves stable main-seat reservations', () => {
    const taken = new Set<string>()
    for (const local of [3, 4, 5, 0, 1, 2]) {
      const seat = pickRoleSeat(LAYOUT.seats, taken, 2, 3)!
      expect(seat.local).toBe(local)
      taken.add(seat.id)
    }
    expect(Array.from({ length: 6 }, (_, slot) => sharedSeatForSlot(slot))).toEqual([3, 4, 5, 0, 1, 2])
    for (let slot = 0; slot < 6; slot++) expect(sharedSlotForSeat(sharedSeatForSlot(slot))).toBe(slot)
  })
  it('shares the review and commit workspace without reducing visible session slots', () => {
    expect(roleZone('code-reviewer')).toBe(4)
    expect(roleZone('commit-checker')).toBe(4)
    expect(LAYOUT.seats.filter(s => s.zone === 4)).toHaveLength(6)
    expect(LAYOUT.seats.filter(s => s.zone === 5)).toHaveLength(6)
  })
  it('keeps mains in the shared area even when their task mentions a role', () => {
    expect(roleZone('main', 'frontend design', true)).toBe(5)
  })
  it('allocates distinct seats across sessions and does not spill into another role', () => {
    const taken = new Set<string>()
    for (let i = 0; i < 6; i++) {
      const seat = pickRoleSeat(LAYOUT.seats, taken, 2, 2)!
      expect(seat.zone).toBe(2)
      expect(taken.has(seat.id)).toBe(false)
      taken.add(seat.id)
    }
    expect(pickRoleSeat(LAYOUT.seats, taken, 2)).toBeNull()
    expect(pickRoleSeat(LAYOUT.seats, taken, 1)).not.toBeNull()
  })
  it('moves a waiting reviewer into a vacated seat without assigning the same seat twice', () => {
    type Worker = { key: string; session: string; zone: number; typeKey: string; title: string; isMain: boolean; seat: Seat | null; spot: { x: number; z: number } | null; goal: string; leaving: boolean; removed: boolean }
    type SeatHarness = { chars: Map<string, Worker>; live: Set<string>; zones: (string | null)[]; lastSessions: { id: string; main: { state: string } }[]; route: ReturnType<typeof vi.fn>; reassignWaitingSeats(): void }
    const scene = Object.create(OfficeScene.prototype) as SeatHarness
    const reviewSeats = LAYOUT.seats.filter(s => s.zone === 4)
    const worker = (key: string, seat: Seat | null): Worker => ({ key, session: 'session', zone: 0, typeKey: 'code-reviewer', title: 'review', isMain: false, seat, spot: seat ? null : { x: 1, z: 1 }, goal: seat ? 'seat' : 'spot', leaving: false, removed: false })
    const occupied = reviewSeats.map((seat, i) => worker(`occupied-${i}`, seat))
    const first = worker('first-waiter', null)
    const second = worker('second-waiter', null)
    scene.chars = new Map([...occupied, first, second].map(ch => [ch.key, ch]))
    scene.live = new Set(['session'])
    scene.zones = ['session', null, null, null, null, null]
    scene.lastSessions = [{ id: 'session', main: { state: 'working' } }]
    scene.route = vi.fn()

    scene.reassignWaitingSeats()
    expect(first.seat).toBeNull()
    scene.chars.delete(occupied[0].key)
    scene.reassignWaitingSeats()
    expect(first.seat?.id).toBe(reviewSeats[0].id)
    expect(first.spot).toBeNull()
    expect(second.seat).toBeNull()
    expect(scene.route).toHaveBeenCalledWith(first, 'seat')
  })
})
