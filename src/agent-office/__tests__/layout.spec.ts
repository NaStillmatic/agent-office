import { describe, expect, it } from 'vitest'
import {
  DOOR,
  LAYOUT,
  REST_AFTER_MS,
  ZONE_COUNT,
  ZONE_ORIGIN,
  TEAM_COLORS,
  W,
  D,
  WALL_SY,
  cellOf,
  findPath,
  freePois,
  key,
  pickRestSpot,
  shouldRest,
} from '../layout'

const door = { x: DOOR.x, z: DOOR.z }

describe('사무실 배치', () => {
  it('서로 다른 색의 6개 세션과 30자리가 사무실 안에 들어간다', () => {
    expect(ZONE_COUNT).toBe(6)
    expect(ZONE_ORIGIN).toHaveLength(6)
    expect(new Set(TEAM_COLORS).size).toBe(6)
    expect(LAYOUT.seats).toHaveLength(30)
    for (const seat of LAYOUT.seats) {
      expect(seat.cx).toBeGreaterThan(0)
      expect(seat.cx).toBeLessThan(W)
      expect(seat.cz).toBeGreaterThan(0)
      expect(seat.cz).toBeLessThan(D)
    }
  })

  it('활성 업무 구역은 각각 6자리', () => {
    expect(LAYOUT.seats).toHaveLength(30)
    for (let z = 0; z < ZONE_COUNT; z++) {
      const mine = LAYOUT.seats.filter((s) => s.zone === z)
      expect(mine).toHaveLength(z === 3 ? 0 : 6)
      expect(mine.filter((s) => s.lead)).toHaveLength(z === 3 ? 0 : 1)
    }
  })

  it('자리마다 듀얼 디스플레이이 넓힌 책상 안에 들어가고 서로 겹치지 않는다', () => {
    const SCREEN_W = 0.393 // computerScreen 모델 폭(스케일 1)
    const DESK_W = 0.73 // FOOT.desk 폭(스케일 1)
    for (const seat of LAYOUT.seats) {
      const screens = LAYOUT.items.filter((i) => i.screenOf === seat.id)
      if (seat.zone === 0) {
        expect(screens).toHaveLength(0)
        continue
      }
      expect(screens).toHaveLength(2)
      const [left, right] = [...screens].sort((a, b) => a.x - b.x)
      expect([left.screenKind, right.screenKind]).toEqual(seat.yaw === 0 ? ['terminal', 'design'] : ['design', 'terminal'])
      // 의자 바로 뒤(-z)의 책상. 같은 열의 다른 줄·구역 책상과 헷갈리지 않게 가장 가까운 것을 고른다
      const desk = LAYOUT.items
        .filter((i) => i.model === 'desk' && i.zone === seat.zone && Math.abs(i.x - seat.cx) < 0.01)
        .sort((p, q) => Math.abs(p.z - seat.cz) - Math.abs(q.z - seat.cz))[0]
      expect((left.x + right.x) / 2).toBeCloseTo(desk.x - 0.10 * (desk.s ?? 1))
      const deskHalf = (DESK_W * (desk.sx ?? desk.s ?? 1)) / 2
      const spans = screens.map((i) => {
        const half = (SCREEN_W * (i.s ?? 1)) / 2
        return [i.x - half, i.x + half] as const
      })
      for (const [l, r] of spans) {
        expect(l).toBeGreaterThanOrEqual(desk.x - deskHalf)
        expect(r).toBeLessThanOrEqual(desk.x + deskHalf)
      }
      const [leftSpan, rightSpan] = [...spans].sort((a, b) => a[0] - b[0])
      expect(rightSpan[0] - leftSpan[1]).toBeGreaterThan(0.04)
      // Adjacent desks retain space between their widened tops.
      for (const other of LAYOUT.items.filter((item) => item.model === 'desk' && item.z === desk.z && item.x > desk.x)) {
        const otherHalf = DESK_W * (other.sx ?? other.s ?? 1) / 2
        expect(other.x - otherHalf - (desk.x + deskHalf)).toBeGreaterThan(0.08)
      }
      // 장식(화분·책)은 모니터 줄보다 앞(+z)에 놓인다
      const decor = LAYOUT.items.filter(
        (i) =>
          ['plantSmall1', 'plantSmall2', 'books'].includes(i.model) &&
          i.y !== undefined &&
          Math.abs(i.x - desk.x) < deskHalf &&
          Math.abs(i.z - desk.z) < 0.4,
      )
      for (const d of decor) expect((d.z - screens[0].z) * -Math.cos(seat.yaw)).toBeGreaterThan(0.1)
    }
  })

  it('places one compact computer per desktop and none at the meeting table', () => {
    const desks = LAYOUT.seats.filter(seat => seat.zone !== 0)
    expect(LAYOUT.miniComputers).toHaveLength(desks.length)
    expect(new Set(LAYOUT.miniComputers.map(pc => pc.seatId)).size).toBe(desks.length)
    for (const seat of desks) {
      const pc = LAYOUT.miniComputers.find(item => item.seatId === seat.id)!
      expect(pc).toBeDefined()
      const desk = LAYOUT.items.filter(item => item.model === 'desk' && item.zone === seat.zone && Math.abs(item.x - seat.cx) < 0.01)
        .sort((a, b) => Math.abs(a.z - seat.cz) - Math.abs(b.z - seat.cz))[0]
      expect(Math.abs(pc.x - desk.x) + 0.09 * pc.scale).toBeLessThan(0.73 * (desk.sx ?? 1) / 2)
      expect(pc.y).toBeCloseTo(0.38 * (desk.s ?? 1))
    }
  })

  it('모든 자리·구경 지점·대기 자리까지 문에서 길이 이어진다', () => {
    const targets = [
      ...LAYOUT.seats.map((s) => ({ name: s.id, x: s.cx, z: s.cz })),
      ...LAYOUT.pois.map((p, i) => ({ name: `poi${i}`, x: p.x, z: p.z })),
      ...LAYOUT.spots.flat().map((p, i) => ({ name: `spot${i}`, x: p.x, z: p.z })),
      ...LAYOUT.sofaSeats.map((s) => ({ name: s.id, x: s.cx, z: s.cz })),
      ...LAYOUT.chairSeats.map((s) => ({ name: s.id, x: s.cx, z: s.cz })),
      ...LAYOUT.teaSeats.map((s) => ({ name: s.id, x: s.cx, z: s.cz })),
    ]
    for (const t of targets) {
      expect(findPath(door, t, LAYOUT.blocked), t.name).not.toBeNull()
      expect(findPath(t, door, LAYOUT.blocked), `${t.name} → 문`).not.toBeNull()
    }
  })

  it('배회 지점과 대기 자리는 가구 위가 아니다', () => {
    for (const p of [...LAYOUT.pois, ...LAYOUT.spots.flat()]) {
      expect(LAYOUT.blocked.has(key(cellOf(p.x), cellOf(p.z))), `${p.x},${p.z}`).toBe(false)
    }
  })

  it('장식 바닥 소품은 앉는 자리·구경 지점으로 가는 길 칸 위에 놓이지 않는다', () => {
    // y 가 낮게 뜬 소품은 이동 막힘에서 빠지므로(put 의 it.y 분기) 길 위에 놓이면 캐릭터가 뚫고 지나간다
    const decor = LAYOUT.items.filter(
      (i) => !i.noBlock && !i.wall && i.y !== undefined && i.y < 0.1,
    )
    expect(decor.length).toBeGreaterThan(0)
    const targets = [
      ...LAYOUT.seats.map((s) => ({ x: s.cx, z: s.cz })),
      ...LAYOUT.pois,
      ...LAYOUT.spots.flat(),
      ...LAYOUT.sofaSeats.map((s) => ({ x: s.cx, z: s.cz })),
      ...LAYOUT.chairSeats.map((s) => ({ x: s.cx, z: s.cz })),
      ...LAYOUT.teaSeats.map((s) => ({ x: s.cx, z: s.cz })),
    ]
    // 쉬던 자리에서 책상·구경 지점으로 돌아가는 길도 포함한다(문에서 오가는 길만으로는 소파 출구 열이 안 잡힌다)
    const rests = LAYOUT.sofaSeats.concat(LAYOUT.chairSeats).map((s) => ({ x: s.cx, z: s.cz }))
    const onPath = new Set<string>()
    for (const from of [door, ...rests]) {
      for (const t of targets) {
        for (const path of [findPath(from, t, LAYOUT.blocked), findPath(t, from, LAYOUT.blocked)]) {
          for (const p of path ?? []) onPath.add(key(cellOf(p.x), cellOf(p.z)))
        }
      }
    }
    for (const d of decor) {
      expect(onPath.has(key(cellOf(d.x), cellOf(d.z))), `${d.model} ${d.x},${d.z}`).toBe(false)
    }
  })

  it('업무 책상은 두 줄이 서로 마주 보고 회의실에는 개인 책상이 없다', () => {
    for (let z = 0; z < ZONE_COUNT; z++) {
      const desks = LAYOUT.items.filter((i) => i.model === 'desk' && i.zone === z)
      if (z === 0 || z === 3) { expect(desks).toHaveLength(0); continue }
      expect(desks).toHaveLength(6)
      expect(new Set(desks.map((d) => d.z.toFixed(2))).size).toBe(2)
      expect(new Set(desks.map((d) => d.rot ?? 0)).size).toBe(2)
    }
  })
})

describe('휴게 공간', () => {
  const waiting = { state: 'waiting', tool: null, lastAt: 1_000_000 }

  it('메인이 도구 없이 대기해 1분을 넘기면 쉬러 가고, AskUserQuestion 대기·작업 중·1분 이내는 아니다', () => {
    const at = (ms: number) => 1_000_000 + ms
    expect(shouldRest(waiting, at(REST_AFTER_MS))).toBe(false)
    expect(shouldRest(waiting, at(REST_AFTER_MS + 1))).toBe(true)
    expect(shouldRest({ ...waiting, tool: 'AskUserQuestion' }, at(10 * REST_AFTER_MS))).toBe(false)
    expect(shouldRest({ ...waiting, state: 'working' }, at(10 * REST_AFTER_MS))).toBe(false)
  })

  it('소파 좌석은 서로 다른 자리이고 방석 안, 등받이 앞이며 앞에서 걸어 들어갈 수 있다', () => {
    expect(LAYOUT.sofaSeats).toHaveLength(2)
    const [a, b] = LAYOUT.sofaSeats
    // 앉은 캐릭터는 팔까지 몸 중심에서 ±0.37 라서 두 자리 간격이 0.74 를 넘어야 서로 겹치지 않는다
    expect(Math.abs(a.z - b.z)).toBeGreaterThan(0.76)
    const sofa = LAYOUT.items.find((item) => item.model === 'loungeSofa')!
    for (const s of LAYOUT.sofaSeats) {
      expect(s.x).toBeGreaterThan(sofa.x - 0.14 + 0.19)
      expect(s.x).toBeLessThan(sofa.x + 0.27675)
      expect(LAYOUT.blocked.has(key(cellOf(s.cx), cellOf(s.cz)))).toBe(false)
    }
  })

  it('1인용 의자 두 개도 앉는 자리이고 의자 방향을 보며 앞에서 걸어 들어갈 수 있다', () => {
    expect(LAYOUT.chairSeats).toHaveLength(2)
    const chairs = LAYOUT.items.filter((i) => i.model === 'loungeChair')
    expect(chairs).toHaveLength(2)
    LAYOUT.chairSeats.forEach((seat, i) => {
      const chair = chairs[i]
      expect(seat.yaw).toBeCloseTo(chair.rot ?? 0)
      // 앉은 자리는 의자 중심에서 앞쪽으로 치우치되 방석(앞 가장자리) 안이다
      const dz = (seat.z - chair.z) * Math.cos(seat.yaw)
      expect(dz).toBeGreaterThan(0)
      expect(dz).toBeLessThan((0.41 * 1.35) / 2)
      expect(LAYOUT.blocked.has(key(cellOf(seat.cx), cellOf(seat.cz)))).toBe(false)
    })
  })

  it('쉬러 간 자리는 소파 → 1인용 의자 → 커피 머신 앞 → 서 있는 자리 순으로 채우고 겹치지 않는다', () => {
    const taken = new Set<string>()
    const kinds: string[] = []
    const ids = new Set<string>()
    const total =
      LAYOUT.sofaSeats.length +
      LAYOUT.chairSeats.length +
      LAYOUT.coffeePois.length +
      LAYOUT.loungePois.length
    for (let i = 0; i < total; i++) {
      const spot = pickRestSpot(taken)
      expect(ids.has(spot.id), spot.id).toBe(false)
      ids.add(spot.id)
      kinds.push(spot.kind)
      taken.add(spot.id)
    }
    expect(kinds).toEqual([
      ...LAYOUT.sofaSeats.map(() => 'sit'),
      ...LAYOUT.chairSeats.map(() => 'sit'),
      ...LAYOUT.coffeePois.map(() => 'coffee'),
      ...LAYOUT.loungePois.map(() => 'stand'),
    ])
    expect([...ids].slice(0, 4)).toEqual(
      expect.arrayContaining(['sofa-0', 'sofa-1', 'chair-0', 'chair-1']),
    )
    expect([...ids].slice(0, 2).sort()).toEqual(['sofa-0', 'sofa-1'])
  })
})

describe('POI 점유', () => {
  it('다른 캐릭터가 서 있거나 가는 중인 자리는 후보에서 빠지고, 모두 차면 빈 목록이다', () => {
    const [a, b, c] = LAYOUT.coffeePois
    expect(freePois(LAYOUT.coffeePois, [a, null, undefined])).toEqual([b, c])
    expect(freePois(LAYOUT.coffeePois, [])).toEqual(LAYOUT.coffeePois)
    expect(freePois(LAYOUT.coffeePois, [a, b, c])).toEqual([])
  })
})

describe('티테이블 의자', () => {
  it('네 자리가 있고, 테이블을 보며 앉고, 들어오는 길목은 테이블 반대쪽(의자 뒤)이다', () => {
    expect(LAYOUT.teaSeats).toHaveLength(4)
    for (const s of LAYOUT.teaSeats) {
      const facing = Math.sin(s.yaw) // +1 이면 +x(동쪽)를 본다
      expect(Math.sign(s.cx - s.x), s.id).toBe(-Math.sign(facing))
      expect(s.seatTop).toBeGreaterThan(0.2)
    }
  })
})

describe('창 앞 배치', () => {
  it('액자·책장과 선반 장식이 없고 책상 위 책은 유지한다', () => {
    expect(LAYOUT.frames).toHaveLength(0)
    expect(LAYOUT.items.some((item) => item.model.startsWith('bookcase'))).toBe(false)
    expect(LAYOUT.shelfBooks).toHaveLength(0)
    expect(LAYOUT.trophies).toHaveLength(0)
    expect(LAYOUT.items.filter((item) => item.model === 'books').every((item) => item.y! >= 0.3)).toBe(true)
  })

  it('뒤쪽 두 면만 유리다', () => {
    expect(LAYOUT.items.some((item) => item.wall === 'W')).toBe(false)
    expect(new Set(LAYOUT.windows.map((window) => window.wall))).toEqual(new Set(['N', 'W']))
    expect(LAYOUT.items.some((item) => ['wall', 'wallDoorway', 'wallWindow', 'kitchenCabinetUpper'].includes(item.model))).toBe(false)
    for (const window of LAYOUT.windows) {
      expect(window.h).toBe(1.29 * WALL_SY)
      expect(window.w / ((window.mullions ?? 0) + 1)).toBe(3)
    }
  })
})
