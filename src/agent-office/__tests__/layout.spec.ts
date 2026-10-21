import { describe, expect, it } from 'vitest'
import {
  BOOKCASE_DEPTH,
  BOOKCASE_SPEC,
  BOOKS_SIZE,
  DOOR,
  LAYOUT,
  REST_AFTER_MS,
  ZONE_COUNT,
  cellOf,
  findPath,
  freePois,
  key,
  pickRestSpot,
  shouldRest,
} from '../layout'
import { OFFICE_ART, OFFICE_SIGN } from '../office.config'

const door = { x: DOOR.x, z: DOOR.z }

describe('사무실 배치', () => {
  it('팀 구역마다 자리 6개, 팀장 자리는 구역당 하나', () => {
    expect(LAYOUT.seats).toHaveLength(ZONE_COUNT * 6)
    for (let z = 0; z < ZONE_COUNT; z++) {
      const mine = LAYOUT.seats.filter((s) => s.zone === z)
      expect(mine).toHaveLength(6)
      expect(mine.filter((s) => s.lead)).toHaveLength(1)
    }
  })

  it('자리마다 듀얼 모니터 두 대가 그 자리 책상 위에 들어가고, 책상 위 장식과 겹치지 않는다', () => {
    const SCREEN_W = 0.393 // computerScreen 모델 폭(스케일 1)
    const DESK_W = 0.73 // FOOT.desk 폭(스케일 1)
    for (const seat of LAYOUT.seats) {
      const screens = LAYOUT.items.filter((i) => i.screenOf === seat.id)
      expect(screens).toHaveLength(2)
      // 앉은 사람(북쪽을 봄) 기준 왼쪽(-x)이 디자인 화면, 오른쪽이 터미널
      const [left, right] = [...screens].sort((p, q) => p.x - q.x)
      expect([left.screenKind, right.screenKind]).toEqual(['design', 'terminal'])
      // 의자 바로 뒤(-z)의 책상. 같은 열의 다른 줄·구역 책상과 헷갈리지 않게 가장 가까운 것을 고른다
      const desk = LAYOUT.items
        .filter((i) => i.model === 'desk' && Math.abs(i.x - seat.cx) < 0.01 && i.z < seat.cz)
        .sort((p, q) => q.z - p.z)[0]
      const deskHalf = (DESK_W * (desk.s ?? 1)) / 2
      const spans = screens.map((i) => {
        const half = (SCREEN_W * (i.s ?? 1)) / 2
        return [i.x - half, i.x + half] as const
      })
      for (const [l, r] of spans) {
        expect(l).toBeGreaterThanOrEqual(desk.x - deskHalf)
        expect(r).toBeLessThanOrEqual(desk.x + deskHalf)
      }
      // 두 대가 서로 겹치지 않는다
      const [a, b] = [...spans].sort((p, q) => p[0] - q[0])
      expect(a[1]).toBeLessThanOrEqual(b[0] + 0.001)
      // 장식(화분·책)은 모니터 줄보다 앞(+z)에 놓인다
      const decor = LAYOUT.items.filter(
        (i) =>
          ['plantSmall1', 'plantSmall2', 'books'].includes(i.model) &&
          i.y !== undefined &&
          Math.abs(i.x - desk.x) < deskHalf &&
          Math.abs(i.z - desk.z) < 0.4,
      )
      for (const d of decor) expect(d.z).toBeGreaterThan(Math.max(...screens.map((i) => i.z)) + 0.1)
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

  it('책상은 구역마다 2줄로 나란히 놓이고 모두 같은 방향이다', () => {
    for (let z = 0; z < ZONE_COUNT; z++) {
      const desks = LAYOUT.items.filter((i) => i.model === 'desk' && i.zone === z)
      expect(desks).toHaveLength(6)
      expect(new Set(desks.map((d) => d.z.toFixed(2))).size).toBe(2)
      expect(new Set(desks.map((d) => d.rot ?? 0)).size).toBe(1)
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
    for (const s of LAYOUT.sofaSeats) {
      expect(s.x).toBeGreaterThan(0.1415 + 0.19) // 엉덩이(원점 뒤 0.19)가 등받이 안쪽 면 앞
      expect(s.x).toBeLessThan(0.5735) // 방석 앞 가장자리 뒤
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

describe('책장 책', () => {
  it('선반마다 책이 올라가고 방 안에 있으며 이동 막힘을 바꾸지 않는다', () => {
    expect(LAYOUT.shelfBooks.length).toBeGreaterThan(0)
    for (const b of LAYOUT.shelfBooks) {
      expect(b.x).toBeGreaterThan(0)
      expect(b.z).toBeGreaterThan(0)
      expect(b.y).toBeGreaterThan(0)
    }
    // 선반 책은 items 가 아니라 shelfBooks 로만 두므로 이동 막힘·바닥 소품 검사에 들어가지 않는다(items 의 books 는 책상 위 것뿐)
    expect(LAYOUT.items.filter((i) => i.model === 'books').every((i) => i.y! >= 0.3)).toBe(true)
  })

  it('모든 책은 가장 가까운 책장의 옆판 안쪽·뒤판 앞·선반 앞 끝 안에 회전을 포함해 들어간다', () => {
    // buildShelfBooks 와 같은 벽 붙이기로 책장 중심을 구하고, 책 좌표를 책장 모델 좌표(정규화 전)로 되돌린다
    const cases = LAYOUT.items
      .filter((i) => BOOKCASE_SPEC[i.model] && i.wall)
      .map((it) => {
        const cs = it.s ?? 1
        return {
          it,
          cs,
          cx: it.wall === 'N' ? it.x : 0.02 + (BOOKCASE_DEPTH * cs) / 2,
          cz: it.wall === 'N' ? 0.02 + (BOOKCASE_DEPTH * cs) / 2 : it.z,
        }
      })
    expect(cases.length).toBeGreaterThan(0)
    const BACK = -0.23 // 뒤판 안쪽 면
    const FRONT = 0 // 선반 앞면
    for (const b of LAYOUT.shelfBooks) {
      const c = cases.reduce((best, k) =>
        Math.hypot(b.x - k.cx, b.z - k.cz) < Math.hypot(b.x - best.cx, b.z - best.cz) ? k : best,
      )
      const spec = BOOKCASE_SPEC[c.it.model]
      const rot = c.it.rot ?? 0
      const dx = b.x - c.cx
      const dz = b.z - c.cz
      const lx = (dx * Math.cos(rot) - dz * Math.sin(rot)) / c.cs
      const lz = (dx * Math.sin(rot) + dz * Math.cos(rot)) / c.cs
      const nx = lx + spec.w / 2
      const nz = lz - BOOKCASE_DEPTH / 2
      const theta = Math.abs(b.rot - rot)
      const sc = b.s / c.cs
      const halfW = ((BOOKS_SIZE.w * Math.cos(theta) + BOOKS_SIZE.d * Math.sin(theta)) / 2) * sc
      const halfD = ((BOOKS_SIZE.d * Math.cos(theta) + BOOKS_SIZE.w * Math.sin(theta)) / 2) * sc
      const where = `${c.it.model}@${c.it.x},${c.it.z} book ${b.x.toFixed(2)},${b.z.toFixed(2)}`
      expect(nx - halfW, `${where} 왼쪽 옆판`).toBeGreaterThanOrEqual(spec.x0)
      expect(nx + halfW, `${where} 오른쪽 옆판`).toBeLessThanOrEqual(spec.x1)
      expect(nz - halfD, `${where} 뒤판`).toBeGreaterThanOrEqual(BACK)
      expect(nz + halfD, `${where} 앞면`).toBeLessThanOrEqual(FRONT)
    }
  })
})

describe('벽 액자', () => {
  const [frame] = LAYOUT.frames
  const lo = frame.z - frame.w / 2
  const hi = frame.z + frame.w / 2

  it('설정의 액자 그림·문구(OFFICE_ART·OFFICE_SIGN)로 액자가 하나 걸리고 이동 막힘·items 에 들어가지 않는다', () => {
    expect(LAYOUT.frames).toHaveLength(1)
    expect(frame.art).toBe(OFFICE_ART)
    expect(frame.text).toBe(OFFICE_SIGN)
    expect(frame.wall).toBe('W')
    expect(LAYOUT.items.some((i) => i.model.toLowerCase().includes('frame'))).toBe(false)
  })

  // 카메라가 방위 45° 라 화면 가로 좌표는 x - z 에 비례한다(오른쪽이 클수록). 벽면 액자는 x≈0.02
  const WALL_X = 0.02
  const screenX = (x: number, z: number) => x - z
  const frameL = screenX(WALL_X, hi)
  const frameR = screenX(WALL_X, lo)

  it('창문·문과 겹치지 않고 서쪽 벽의 가구·화분과 충분히 떨어져 있다', () => {
    // 소파·쿠션·곰 인형은 액자 아래 끝(0.775)보다 낮아 액자 아래에 놓여도 가리지 않는다
    const BELOW_FRAME = new Set(['loungeSofa', 'pillowBlue', 'bear'])
    const west = LAYOUT.items.filter((i) => i.x < 0.9 && !i.noBlock && !BELOW_FRAME.has(i.model))
    expect(west.length).toBeGreaterThan(0)
    for (const i of west) {
      const sx = screenX(i.x, i.z)
      // 화분·램프 같은 바닥 가구의 화면 폭 한쪽(0.15)을 여유로 둔다
      expect(sx < frameL - 0.15 || sx > frameR + 0.15, `${i.model} ${i.x},${i.z}`).toBe(true)
    }
    const windows = [
      ...LAYOUT.items
        .filter((i) => i.wall === 'W' && i.noBlock && i.model !== 'wall')
        .map((i) => ({ z: i.z, w: 1, what: i.model })),
      ...LAYOUT.windows.map((w) => ({ z: w.z, w: w.w, what: '큰 창' })),
    ]
    expect(windows.length).toBeGreaterThan(0)
    for (const w of windows) {
      expect(w.z - w.w / 2 >= hi || w.z + w.w / 2 <= lo, `${w.what} z=${w.z}`).toBe(true)
    }
  })
})
