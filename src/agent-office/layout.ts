/**
 * 사무실 배치(3D). 단위는 Kenney Furniture Kit 의 월드 단위이고, 이동 격자 한 칸은 G=0.25 이다.
 * 방은 x(0~W), z(0~D) 평면에 놓고 뒤쪽 두 면만 통유리로 감싼다. 카메라는 +x +z 쪽에서 내려다본다.
 *
 * 책상은 마주 보지 않는다. 팀 구역마다 책상 2줄(줄마다 3개)을 모두 북쪽 벽을 보게 나란히 놓고,
 * 뒷줄 3자리, 앞줄 3자리이고 앞줄 끝(5번) 책상만 한 단계 크다. 종류별 선호 자리는 office.config.ts SEAT_OF_TYPE 이 정한다.
 * 이 파일은 three 에 의존하지 않는 순수 데이터라 단위 테스트가 가능하다.
 */

/** 벽 조각(모델 높이 1.29)을 세로로 늘리는 배율. 벽 높이는 1.29 x WALL_SY */
export const WALL_SY = 2.3
/** 탕비실 하부장 세로 배율(상판 높이 = 0.45 x 1.1 x COUNTER_SY) */
const COUNTER_SY = 1.0
const COUNTER_TOP = 0.45 * 1.1 * COUNTER_SY + 0.005
/** 바깥 크기를 유지하고, 바리스타 한 명이 오가는 0.8 폭의 안쪽 통로를 둔다. */
const BAR_CENTER_X = 1.65
const BAR_OUTER_HALF_WIDTH = 1.42
const BAR_AISLE_WIDTH = 0.8
const BAR_INNER_HALF_WIDTH = BAR_AISLE_WIDTH / 2
export const CAFE = {
  counterX: BAR_CENTER_X - (BAR_OUTER_HALF_WIDTH + BAR_INNER_HALF_WIDTH) / 2,
  cupX: BAR_CENTER_X + (BAR_OUTER_HALF_WIDTH + BAR_INNER_HALF_WIDTH) / 2,
  counterDepth: BAR_OUTER_HALF_WIDTH - BAR_INNER_HALF_WIDTH,
  z: 12.6,
  startZ: 12,
  outerHalfWidth: BAR_OUTER_HALF_WIDTH,
  innerHalfWidth: BAR_INNER_HALF_WIDTH,
  frontZ: 14.514,
  tableX: 1.9,
  tableZ: 11.05,
  baristaX: BAR_CENTER_X,
}
export const G = 0.25
export const W = 18
export const D = 18
/** 뒤쪽 두 창면을 부드럽게 연결하는 곡면 유리 반지름. */
export const WINDOW_RADIUS = 3
export const COLS = Math.round(W / G)
export const ROWS = Math.round(D / G)
/** 앞쪽 엘리베이터. 객실 안에서 태어나고 객실 안으로 돌아가 퇴장한다. */
export const ELEVATOR = { x: 4.375, z: 16.125, frontX: 5.075, lobbyX: 5.625, w: 1.7, d: 1.4, h: 1.6 }
/** 길찾기에서 사용하는 출입 목적지(엘리베이터 객실 중심). */
export const DOOR = { x: ELEVATOR.x, z: ELEVATOR.z }

export const ZONE_COUNT = 6
/** 세션(팀) 색: 이름표 점·테두리·발밑 링·구역 바닥. 옷 색(agentType)은 office.config.ts 의 AGENT_LOOKS 가 따로 정한다 */
export const TEAM_COLORS = ['#22b8cf', '#f5d142', '#f06595', '#94d82d', '#9775fa', '#ff922b']
/** 구역 왼쪽 위(북서) 모서리 */
export const ZONE_ORIGIN: { x: number; z: number }[] = [
  { x: 5, z: 3 },
  { x: 11, z: 3 },
  { x: 5, z: 8 },
  { x: 11, z: 8 },
  { x: 5, z: 13 },
  { x: 11, z: 13 },
]
export const ZONE_SIZE = { w: 4.4, d: 2.55 }
const COL_X = [0.65, 2.11, 3.57]
const ROW_Z = [0, 1.35]

/** 앉았을 때 바라보는 방향(yaw). 모든 책상이 북쪽을 본다 */
export const SEAT_YAW = Math.PI

/** 의자 가로 폭을 깊이 대비 얼마로 넓히는가. 캐릭터 엉덩이(0.28)가 방석(0.27)보다 넓어 팔걸이와 겹치지 않게 키운다 */
export const CHAIR_WIDTH_RATIO = 1.2
/** 의자 깊이 배율. 방석을 앞뒤로 늘려 엉덩이·허벅지가 올라앉게 한다 */
export const CHAIR_DEPTH_RATIO = 1.25
/** 의자를 책상 반대쪽(남쪽)으로 물리는 거리. 앉은 사람 등과 등받이 사이를 벌린다 */
export const CHAIR_BACK_SHIFT = 0.02
/**
 * 의자 높이를 가로·깊이 대비 얼마로 낮추는가. 1 이면 모델 그대로(방석이 책상 윗면의 약 49%)다.
 * 0.6 이면 방석(0.11)이 책상 윗면(0.38)의 30% 쯤이라 바닥에 앉은 듯 보였다.
 */
export const CHAIR_HEIGHT_RATIO = 1

export interface Seat {
  id: string
  zone: number
  /** 구역 안 자리 번호: 0~2 뒷줄, 3~5 앞줄(5 가 큰 책상) */
  local: number
  /** 앉은 사람의 중심 */
  x: number
  z: number
  /** 의자 중심. 길찾기의 출입 지점이다(앉은 자리는 책상과 맞닿아 막힌 칸에 걸친다) */
  cx: number
  cz: number
  lead: boolean
  /** 의자 가로·깊이 스케일 */
  chairScale: number
  /** 의자 높이(y) 스케일. 앉은 높이(방석 윗면)가 여기에 비례한다 */
  chairHeight: number
}

export interface Item {
  model: string
  x: number
  z: number
  y?: number
  /** y 축 회전(라디안). 0 이면 앞면이 +z(남쪽) */
  rot?: number
  s?: number
  /** x 축 스케일(없으면 s). 의자를 넓힐 때 쓴다 */
  sx?: number
  /** z 축 스케일(없으면 s). 의자 깊이를 늘릴 때 쓴다 */
  sz?: number
  /** y 축 스케일(없으면 s). 의자 높이만 낮출 때 쓴다 */
  sy?: number
  /** 경계 정렬: 북쪽 유리에서 42cm 띄워 가구 깊이를 보정한다. x(N) 또는 z(W) 는 벽을 따라가는 좌표 */
  wall?: 'N' | 'W'
  /** 이동을 막지 않는 장식 */
  noBlock?: boolean
  /** 이 자리 PC 모니터(앉은 사람이 일하면 터미널이 스크롤된다) */
  screenOf?: string
  /** 모니터 화면 내용: 앉은 사람 기준 왼쪽은 디자인 툴, 오른쪽은 터미널 */
  screenKind?: 'design' | 'terminal'
  /** 팀 구역 책상이면 구역 번호(구역 색 표시용) */
  zone?: number
  /** 트로피 진열장(오픈 책장): 일부 선반에 책 대신 트로피를 올린다(TROPHY_SHELVES) */
  display?: boolean
}

/** 액자 장식은 items·blocked 에 넣지 않는다. x 는 북쪽 벽, z 는 서쪽 벽의 중심 위치다. */
export interface WallFrame {
  wall: 'N' | 'W'
  /** N 벽을 쓸 때 창의 중심 x 좌표 */
  x?: number
  /** W 벽을 쓸 때 창의 중심 z 좌표 */
  z?: number
  freestanding?: boolean
  y: number
  w: number
  h: number
  text: string
  /** 글자 대신 거는 그림(office.config.ts OFFICE_ART) */
  art: 'seaside' | 'skyline' | null
}

export interface Poi {
  x: number
  z: number
  /** 도착 후 바라보는 yaw */
  yaw: number
}

/**
 * loungeSofa·loungeChair GLB 를 재서 얻은 치수(모델 좌표, 스케일 1). 둘 다 앞면이 +z 이고 뒤쪽 z=-d 에 등받이가 서 있으며,
 * 팔걸이가 양끝에 있고 방석 윗면은 y=seatTop, 등받이 안쪽 면은 앞 가장자리에서 seatDepth 뒤다. 소파는 가로 w=0.98, 의자는 0.49 다(의자는 `LAYOUT` 의 loungeChair 배치만 쓰고 가로 폭은 CHAIR_SX 로 잡는다).
 */
const LOUNGE_MODEL = { d: 0.41, seatTop: 0.23, seatDepth: 0.32, arm: 0.09 }
const SOFA_MODEL_W = 0.98
/** 깊이·높이 배율(소파·의자 공통). 가로(좌석 줄 방향)는 따로 늘린다 */
const LOUNGE_SCALE = 1.35
/**
 * 가로 배율. `sit` 클립은 손을 방석에 짚느라 팔이 벌어져 앉은 캐릭터가 몸 중심에서 ±0.37 를 쓴다(몸통은 ±0.17).
 * 한 자리가 방석 안쪽 폭 0.8 이상을 써야 옆 사람·팔걸이와 겹치지 않으므로, 소파는 안쪽 폭이 두 자리분(1.6),
 * 의자는 한 자리분(0.8)이 되게 늘린다.
 */
const SOFA_SX = 2.0
const CHAIR_SX = 2.6
/** 소파 중심 z. 파노라마 창의 남쪽 끝에 휴게 공간을 두고, 앞쪽 책상 줄과 나란히 배치한다 */
const SOFA_Z = 5
/** 소파를 유리에서 띄워 파노라마 창을 가리지 않게 한다 */
const SOFA_CENTER_X = 0.7
/** 소파는 창을 등지고 사무실 안쪽(+x)을 본다 */
const SOFA_YAW = Math.PI / 2
/** 앉은 사람의 원점이 방석 앞 가장자리에서 얼마나 뒤인가(월드 단위). 엉덩이가 등받이를 뚫지 않고 무릎이 방석 앞으로 나오게 맞춘 값 */
export const SOFA_SIT_BACK = 0.225
/** 소파 중심에서 앞 가장자리까지의 x 좌표 */
const SOFA_FRONT = SOFA_CENTER_X + (LOUNGE_MODEL.d * LOUNGE_SCALE) / 2
/** 1인용 의자 두 개: 커피 테이블을 마주 본다. 의자 rot 이 곧 앉는 사람의 yaw 다 */
const CHAIRS = [
  { x: 1.7, z: SOFA_Z - 1.4, rot: 0 },
  { x: 1.7, z: SOFA_Z + 1.4, rot: Math.PI },
]

/** 티테이블 원목 의자(chairRounded, 배율 1.4)의 방석 윗면 높이. 모델 방석 윗면 0.22 를 잰 값 */
const TEA_SEAT_TOP = 0.22 * 1.4

/** 앉는 POI: 소파·1인용 의자·티테이블 의자의 한 자리 */
export interface SofaSeat {
  id: string
  /** 앉은 사람의 원점 */
  x: number
  z: number
  yaw: number
  /** 일어나 나오는 지점(소파 앞 칸 중심). 길찾기의 출입 지점이다 */
  cx: number
  cz: number
  /** 방석 윗면의 월드 높이 */
  seatTop: number
}

/** 쉬러 간 사람이 머무는 자리. 소파·의자에 앉거나(sit), 탕비실에서 커피를 마시거나(coffee), 휴게 공간 어딘가에 서 있는다(stand) */
export type RestSpot =
  | { kind: 'sit'; id: string; seat: SofaSeat }
  | { kind: 'coffee'; id: string; poi: Poi }
  | { kind: 'stand'; id: string; poi: Poi }

/** 메인이 사용자 응답을 이만큼 기다리면 자리를 비우고 쉬러 간다 */
export const REST_AFTER_MS = 60_000

/** 모델별 바닥 점유 크기(w x d). 배치 회전 전 기준이고 이동 막기에만 쓴다 */
const FOOT: Record<string, [number, number]> = {
  desk: [0.73, 0.56],
  loungeSofa: [0.98, 0.41],
  tableCoffee: [0.66, 0.4],
  bookcaseClosedWide: [0.8, 0.25],
  bookcaseClosed: [0.4, 0.25],
  bookcaseOpen: [0.4, 0.25],
  kitchenCabinet: [0.43, 0.48],
  kitchenSink: [0.43, 0.48],
  kitchenFridge: [0.43, 0.32],
  pottedPlant: [0.25, 0.29],
  loungeChair: [0.49, 0.41],
  sideTable: [0.53, 0.22],
  trashcan: [0.5, 0.44],
  lampRoundFloor: [0.16, 0.16],
  coatRackStanding: [0.28, 0.28],
  tableRound: [0.70, 0.70],
  chairRounded: [0.2, 0.2],
}

export const key = (c: number, r: number) => `${c},${r}`
export const cellOf = (v: number) => Math.floor(v / G)
export const cellCenter = (c: number) => (c + 0.5) * G

export interface OfficeLayout {
  items: Item[]
  seats: Seat[]
  pois: Poi[]
  /** 팀 구역에 자리가 모자란 인원이 서 있을 자리(구역별) */
  spots: { x: number; z: number }[][]
  blocked: Set<string>
  /** 휴게 공간 러그 중심·반지름 */
  rug: { x: number; z: number; r: number }
  /** 소파 좌석(앉는 POI) */
  sofaSeats: SofaSeat[]
  /** 1인용 의자 좌석(앉는 POI) */
  chairSeats: SofaSeat[]
  /** 휴게 공간에 서 있는 자리(pois 의 부분집합) */
  loungePois: Poi[]
  /** 커피 머신 앞 자리(pois 의 부분집합) */
  coffeePois: Poi[]
  /** 책장 선반에 얹는 책. 이동 막힘·그림자에 쓰지 않는 장식이다(책장이 이미 막고 있다) */
  shelfBooks: ShelfBook[]
  /** 탕비실 상판 위 에스프레소 머신 자리(바닥 가운데). 모델이 없어 scene 이 도형으로 만든다 */
  espresso: { x: number; y: number; z: number; rot: number; groups: number }
  /** 세션과 무관하게 항상 카페에 상주하는 바리스타 */
  barista: { x: number; z: number; yaw: number }
  /** 독립형 TV(가운데 x·높이 y, 화면 바깥 크기 w·h). 화면에 사용량을 그린다 */
  tv: { x: number; y: number; z: number; w: number; h: number }
  /** 티테이블 의자: 한가한 서브에이전트가 잠깐 앉아 쉬는 자리 */
  teaSeats: SofaSeat[]
  /** 트로피 진열장 선반의 트로피. 책처럼 이동 막힘·그림자에 쓰지 않는 장식이다 */
  trophies: Trophy[]
  /** 벽 액자 */
  frames: WallFrame[]
  /** 벽면에 붙이는 큰 창(유리판 + 얇은 창틀) */
  windows: WallWindow[]
}

/**
 * 벽면에 붙이는 큰 창. 창문 모델(wallWindow)은 유리 폭이 0.38 이라 늘리면 창틀까지 두꺼워져서, 유리판과 얇은 창틀로 직접 만든다.
 * 유리 뒤에 공유 파노라마를 투영한다. z·y 는 가운데, w·h 는 창틀 바깥 크기다
 */
export interface WallWindow {
  wall: 'N' | 'W'
  x?: number
  z?: number
  y: number
  w: number
  h: number
  /** 얇은 금속 세로 프레임 개수 */
  mullions?: number
  door?: boolean
}

/** 진열장 선반 위 트로피 하나. x, z 는 바닥 중심, y 는 선반 윗면의 월드 높이 */
export interface Trophy {
  x: number
  y: number
  z: number
  s: number
  /** y 축 회전. 손잡이가 책장 앞면과 나란하게 책장 회전을 따른다 */
  rot: number
  metal: 'gold' | 'silver' | 'bronze'
}

/** 선반 위 책 한 묶음. x, z 는 묶음 중심, y 는 선반 윗면의 월드 높이 */
export interface ShelfBook {
  x: number
  y: number
  z: number
  rot: number
  s: number
  /** 색을 바꾸는 곱셈 색(#rrggbb) */
  tint: string
}

/**
 * 책장 모델 3종의 선반 사양(모델 원본 좌표). 앞면이 +z 이고 z 는 -0.25(뒤판 바깥)~0(앞)이다.
 * shelves 는 선반 윗면 y, 안쪽 폭 x 는 [x0, x1], 뒤판 안쪽면(z=-0.23)과 선반 앞 끝(z=-0.02) 사이가 책이 놓이는 깊이다.
 */
export const BOOKCASE_SPEC: Record<
  string,
  { w: number; shelves: number[]; x0: number; x1: number }
> = {
  bookcaseClosedWide: { w: 0.8, shelves: [0.07, 0.31, 0.55], x0: 0.04, x1: 0.76 },
  bookcaseClosed: { w: 0.4, shelves: [0.13, 0.37, 0.61], x0: 0.04, x1: 0.36 },
  bookcaseOpen: { w: 0.4, shelves: [0.13, 0.37, 0.61, 0.85], x0: 0.04, x1: 0.36 },
}
export const BOOKCASE_DEPTH = 0.25
/** books 모델 원본 크기(가로 x 세로 x 깊이) */
export const BOOKS_SIZE = { w: 0.15, h: 0.104, d: 0.095 }
const BOOK_TINTS = ['#ffffff', '#f2c9c9', '#c9dcf2', '#f2e4a8', '#b9e0bf', '#d9c2ec', '#f0c9a0']

/** 고정 시드 난수(mulberry32). 새로고침해도 같은 책 배치가 나오게 한다 */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 벽에 붙인 책장 선반마다 책을 몇 묶음씩 올린다. 칸마다 개수·간격·회전·크기·색이 다르고 일부 칸은 비운다 */
function buildShelfBooks(items: Item[]): ShelfBook[] {
  const out: ShelfBook[] = []
  let n = 0
  for (const it of items) {
    const spec = BOOKCASE_SPEC[it.model]
    if (!spec || !it.wall) continue
    const cs = it.s ?? 1
    const rot = it.rot ?? 0
    // scene.placeItem 과 같은 벽 붙이기: 책장 중심(정규화 뒤 원점)의 월드 좌표
    const cx = it.wall === 'N' ? it.x : 0.02 + (BOOKCASE_DEPTH * cs) / 2
    const cz = it.wall === 'N' ? 0.42 + (BOOKCASE_DEPTH * cs) / 2 : it.z
    const sin = Math.sin(rot)
    const cos = Math.cos(rot)
    const rnd = seeded(1000 + n++ * 7919)
    for (const [si, top] of spec.shelves.entries()) {
      if (it.display && TROPHY_SHELVES.includes(si)) continue
      if (rnd() < 0.2) continue
      const bs = 1.0 + rnd() * 0.25
      const slotW = BOOKS_SIZE.w * bs + 0.03
      const slots = Math.floor((spec.x1 - spec.x0) / slotW)
      const used = new Set<number>()
      const want = 1 + Math.floor(rnd() * Math.min(slots, 3))
      for (let k = 0; k < want; k++) used.add(Math.floor(rnd() * slots))
      const margin = (spec.x1 - spec.x0 - slots * slotW) / 2
      for (const slot of used) {
        const sc = bs * (0.92 + rnd() * 0.16)
        const nx = spec.x0 + margin + (slot + 0.5) * slotW + (rnd() - 0.5) * 0.01
        const nz = -0.23 + 0.03 + (BOOKS_SIZE.d * sc) / 2 + rnd() * 0.06
        const lx = (nx - spec.w / 2) * cs
        const lz = (nz + BOOKCASE_DEPTH / 2) * cs
        out.push({
          x: cx + lx * cos + lz * sin,
          z: cz - lx * sin + lz * cos,
          y: top * (it.sy ?? cs),
          rot: rot + (rnd() - 0.5) * 0.2,
          s: cs * sc,
          tint: BOOK_TINTS[Math.floor(rnd() * BOOK_TINTS.length)],
        })
      }
    }
  }
  return out
}

/** 트로피 진열장에서 트로피를 올리는 선반 번호(아래에서부터). 나머지 선반에는 책을 꽂는다 */
const TROPHY_SHELVES = [1, 3]
const TROPHY_METALS: Trophy['metal'][] = ['gold', 'silver', 'bronze']

/** 트로피 진열장(display) 선반 가운데에 트로피를 하나씩 올린다. 금·은·동을 돌아가며 쓴다 */
function buildTrophies(items: Item[]): Trophy[] {
  const out: Trophy[] = []
  for (const it of items) {
    const spec = BOOKCASE_SPEC[it.model]
    if (!spec || !it.wall || !it.display) continue
    const cs = it.s ?? 1
    // 책장 중심(정규화 뒤 원점)의 월드 좌표 — buildShelfBooks 와 같은 벽 붙이기
    const x = it.wall === 'N' ? it.x : 0.02 + (BOOKCASE_DEPTH * cs) / 2
    const z = it.wall === 'N' ? 0.42 + (BOOKCASE_DEPTH * cs) / 2 : it.z
    for (const si of TROPHY_SHELVES) {
      const top = spec.shelves[si]
      if (top === undefined) continue
      out.push({
        x,
        z,
        y: top * (it.sy ?? cs),
        s: cs,
        rot: it.rot ?? 0,
        metal: TROPHY_METALS[out.length % TROPHY_METALS.length],
      })
    }
  }
  return out
}

/** 자리 번호별 의자·책상 위치 */
function seatPlacement(zone: number, local: number) {
  const o = ZONE_ORIGIN[zone]
  const row = local < 3 ? 0 : 1
  const col = local % 3
  const lead = local === 5
  const dx = o.x + COL_X[col]
  const dz = o.z + ROW_Z[row]
  return { dx, dz, lead, sx: dx, sz: dz + (lead ? 0.64 : 0.54) }
}

function build(): OfficeLayout {
  const items: Item[] = []
  const seats: Seat[] = []
  const blocked = new Set<string>()

  const blockRect = (cx: number, cz: number, w: number, d: number) => {
    const c0 = cellOf(cx - w / 2 + 0.001)
    const c1 = cellOf(cx + w / 2 - 0.001)
    const r0 = cellOf(cz - d / 2 + 0.001)
    const r1 = cellOf(cz + d / 2 - 0.001)
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) blocked.add(key(c, r))
  }
  const put = (it: Item) => {
    items.push(it)
    if (it.noBlock || it.y) return
    const f = FOOT[it.model]
    if (!f) return
    const s = it.s ?? 1
    const sx = it.sx ?? s
    const sz = it.sz ?? s
    const turned = Math.abs(Math.sin(it.rot ?? 0)) > 0.7
    const w = turned ? f[1] * sz : f[0] * sx
    const d = turned ? f[0] * sx : f[1] * sz
    if (it.wall === 'N') blockRect(it.x, d / 2 + 0.42, w, d)
    else if (it.wall === 'W') blockRect(w / 2 + 0.02, it.z, w, d)
    else blockRect(it.x, it.z, w, d)
  }

  // 곡면 유리 바깥 코너는 이동할 수 없다.
  for (let c = 0; c < WINDOW_RADIUS / G; c++) {
    for (let r = 0; r < WINDOW_RADIUS / G; r++) {
      if (Math.hypot(cellCenter(c) - WINDOW_RADIUS, cellCenter(r) - WINDOW_RADIUS) > WINDOW_RADIUS - 0.15) blocked.add(key(c, r))
    }
  }
  // 뒤쪽 두 면은 통유리, 출입구는 앞쪽 엘리베이터다.

  // ── 팀 구역: 책상 6개씩 ──
  for (let z = 0; z < ZONE_COUNT; z++) {
    for (let local = 0; local < 6; local++) {
      const p = seatPlacement(z, local)
      const id = `Z${z}-${local}`
      const s = p.lead ? 1.28 : 1
      put({ model: 'desk', x: p.dx, z: p.dz, s, sx: s * 1.65, zone: z })
      const chairScale = p.lead ? 0.88 : 0.8
      const chairHeight = chairScale * CHAIR_HEIGHT_RATIO
      put({
        model: 'chairDesk',
        x: p.sx,
        z: p.sz + CHAIR_BACK_SHIFT,
        rot: Math.PI,
        s: chairScale,
        sx: chairScale * CHAIR_WIDTH_RATIO,
        sy: chairHeight,
        sz: chairScale * CHAIR_DEPTH_RATIO,
        noBlock: true,
        zone: z,
      })
      // 의자 칸만 따로 막는다(앉은 사람이 목적지이므로 경로 계산에서는 예외로 둔다)
      blocked.add(key(cellOf(p.sx), cellOf(p.sz)))
      const top = 0.38 * s
      // Widen the desk, keeping its height and depth, for two full-size displays.
      for (const side of [-1, 1]) {
        put({
          model: 'computerScreen',
          x: p.dx + (side * 0.25 - 0.10) * s,
          z: p.dz - 0.07 * s,
          y: top,
          rot: -side * 0.10,
          s: p.lead ? 1.35 : 1.15,
          screenOf: id,
          screenKind: side < 0 ? 'design' : 'terminal',
        })
      }
      put({ model: 'computerKeyboard', x: p.dx, z: p.dz + 0.1 * s, y: top, s })
      put({ model: 'computerMouse', x: p.dx + 0.24 * s, z: p.dz + 0.1 * s, y: top, s })
      // 장식은 모니터와 겹치지 않게 책상 앞 왼쪽 모서리에 둔다
      if (p.lead) {
        put({ model: 'plantSmall2', x: p.dx - 0.28 * s, z: p.dz + 0.1 * s, y: top, s: 0.9 })
      } else if (local === 1) {
        put({ model: 'plantSmall1', x: p.dx - 0.27, z: p.dz + 0.1, y: top })
      } else if (local === 3) {
        put({ model: 'books', x: p.dx - 0.27, z: p.dz + 0.1, y: top })
      }
      // 앉은 사람은 의자 등받이보다 책상 쪽으로 조금 당겨 앉힌다
      seats.push({
        id,
        zone: z,
        local,
        x: p.sx,
        z: p.sz - 0.12,
        cx: p.sx,
        cz: p.sz,
        lead: p.lead,
        chairScale,
        chairHeight,
      })
    }
  }

  for (const o of ZONE_ORIGIN) {
    put({ model: 'pottedPlant', x: o.x + 4.1, z: o.z - 0.65, s: 1.1 })
  }

  // ── 카페: 평행한 11자 바, 왼쪽 머신·개수대 / 오른쪽 브루잉존 ──
  // Two independent counters leave both ends of the staff aisle open.
  const wingDepth = CAFE.frontZ - CAFE.startZ
  for (const x of [CAFE.counterX, CAFE.cupX]) blockRect(x, CAFE.startZ + wingDepth / 2, CAFE.counterDepth, wingDepth)
  put({ model: 'trashcan', x: 0.2, z: CAFE.z - 0.5, s: 0.55 })
  // 두 바 사이 통로는 직원 전용이다.
  blockRect(CAFE.baristaX, CAFE.z + 0.5, BAR_AISLE_WIDTH - 0.15, 1.8)
  const TEA_X = CAFE.tableX
  const teaSeats: SofaSeat[] = []
  for (const [i, z] of [CAFE.tableZ - 0.65, CAFE.tableZ + 0.65].entries()) {
    put({ model: 'tableRound', x: TEA_X, z, s: 0.8 })
    put({ model: i ? 'plantSmall2' : 'plantSmall1', x: TEA_X, z, y: 0.445, s: 0.7 })
    for (const dir of [1, -1]) {
      const x = TEA_X - dir * 0.55
      put({ model: 'chairRounded', x, z, rot: (dir * Math.PI) / 2, s: 1.4 })
      teaSeats.push({
        id: `tea-${teaSeats.length}`,
        x: x + dir * 0.02,
        z,
        yaw: (dir * Math.PI) / 2,
        cx: x - dir * 0.375,
        cz: z,
        seatTop: TEA_SEAT_TOP,
      })
    }
  }
  put({ model: 'pottedPlant', x: 0.35, z: CAFE.z - 2.5, s: 1.3 })
  put({ model: 'pottedPlant', x: 3.0, z: CAFE.frontZ + 0.15, s: 1.2 })

  // 출입문 오른쪽의 화분과 옷걸이
  put({ model: 'pottedPlant', x: 4.2, z: 0, wall: 'N', s: 1.3 })
  put({ model: 'coatRackStanding', x: 4.78, z: 0, wall: 'N', s: 1.0 })

  // ── 휴게 공간(통유리 앞, 유리에서 떨어뜨려 배치) ──
  const rug = { x: 1.55, z: SOFA_Z, r: 1.15 }
  put({
    model: 'loungeSofa',
    x: SOFA_CENTER_X,
    z: SOFA_Z,
    rot: SOFA_YAW,
    s: LOUNGE_SCALE,
    sx: SOFA_SX,
  })
  // 방석 안쪽 폭을 두 칸으로 나눠 각 칸 가운데에 앉는다
  const sofaSeatW = ((SOFA_MODEL_W - 2 * LOUNGE_MODEL.arm) * SOFA_SX) / 2
  const sofaSeats: SofaSeat[] = [-1, 1].map((side, i) => {
    const z = SOFA_Z + (side * sofaSeatW) / 2
    return {
      id: `sofa-${i}`,
      x: SOFA_FRONT - SOFA_SIT_BACK,
      z,
      yaw: SOFA_YAW,
      cx: cellCenter(cellOf(SOFA_FRONT) + 1),
      cz: cellCenter(cellOf(z)),
      seatTop: LOUNGE_MODEL.seatTop * LOUNGE_SCALE,
    }
  })
  put({ model: 'tableCoffee', x: 1.7, z: SOFA_Z, rot: Math.PI / 2, s: 1.15 })
  const chairHalfD = (LOUNGE_MODEL.d * LOUNGE_SCALE) / 2
  const chairSeats: SofaSeat[] = CHAIRS.map((c, i) => {
    put({ model: 'loungeChair', x: c.x, z: c.z, rot: c.rot, s: LOUNGE_SCALE, sx: CHAIR_SX })
    // rot 0 은 +z, rot π 는 -z 를 본다. 앞 가장자리에서 SOFA_SIT_BACK 뒤에 앉고, 앞 칸에서 걸어 들어간다
    const dir = Math.cos(c.rot) > 0 ? 1 : -1
    const front = c.z + dir * chairHalfD
    return {
      id: `chair-${i}`,
      x: c.x,
      z: front - dir * SOFA_SIT_BACK,
      yaw: c.rot,
      cx: cellCenter(cellOf(c.x)),
      cz: cellCenter(cellOf(front) + dir),
      seatTop: LOUNGE_MODEL.seatTop * LOUNGE_SCALE,
    }
  })
  // 소파 양옆 협탁(소파 중심 ±1.3). 모델 깊이(0.22)가 얕아 위 소품이 떨어질 듯 보여 깊이만 1.6배(0.35)로 늘린다.
  put({ model: 'sideTable', x: SOFA_CENTER_X, z: SOFA_Z + 1.3, rot: Math.PI / 2, s: 1.0, sz: 1.6 })
  put({ model: 'lampRoundTable', x: SOFA_CENTER_X, z: SOFA_Z + 1.3, y: 0.38 })
  put({ model: 'sideTable', x: SOFA_CENTER_X, z: SOFA_Z - 1.3, rot: Math.PI / 2, s: 1.0, sz: 1.6 })
  // 소파 방석 두 자리에 사람이 앉으므로 곰 인형·쿠션은 소파 앞 가장자리 칸(x 0.5~0.75)에 둔다. 바닥 소품은 이동 막힘에서 빠지므로 몸체가 소파 출구 열(x 0.75~1.0)로 넘치면 걸어 나오는 캐릭터가 뚫고 지나간다. 곰은 몸체 x 폭이 0.17 이라 중심을 0.66 에, 쿠션은 회전 뒤 x 폭이 0.063 이라 0.71 에 둔다(0.71+0.0315 < 0.75)
  put({ model: 'bear', x: 0.66, z: SOFA_Z - 0.85, y: 0.02, rot: Math.PI / 2, s: 0.7 })
  put({ model: 'pillowBlue', x: 0.71, z: SOFA_Z + 0.85, y: 0.02, rot: Math.PI / 2 })
  put({ model: 'plantSmall3', x: 1.7, z: SOFA_Z, y: 0.27, s: 1.0 })
  // 소파와 입구 통로 사이에 스탠드 조명, 창 끝에는 화분을 둔다
  put({ model: 'lampRoundFloor', x: 0.5, z: 7, s: 1.2 })
  // Stand lamps at pod edges and beside the café leave the main aisles open.
  for (const { x, z } of [
    { x: 3.35, z: CAFE.startZ + 0.1 },
    ...ZONE_ORIGIN.map(o => ({ x: o.x + 4.5, z: o.z - 0.65 })),
  ]) {
    put({ model: 'lampRoundFloor', x, z, s: 1.2 })
  }
  // 원통형 유리 포드의 측면을 막고 +x 방향의 열린 입구로만 출입한다.
  for (let c = cellOf(ELEVATOR.x - 0.9); c <= cellOf(ELEVATOR.x + 0.9); c++) {
    for (let r = cellOf(ELEVATOR.z - 0.9); r <= cellOf(ELEVATOR.z + 0.9); r++) {
      const dx = cellCenter(c) - ELEVATOR.x, dz = cellCenter(r) - ELEVATOR.z
      const radius = Math.hypot(dx, dz)
      const entrance = dx > 0 && Math.abs(dz) < 0.12
      if (!entrance && radius >= 0.56 && radius <= 0.88) blocked.add(key(c, r))
    }
  }

  const spots: { x: number; z: number }[][] = []
  for (let z = 0; z < ZONE_COUNT; z++) {
    const o = ZONE_ORIGIN[z]
    spots.push([
      { x: o.x + 0.9, z: o.z - 0.55 },
      { x: o.x + 2.4, z: o.z - 0.55 },
      { x: o.x + 0.9, z: o.z + 2.6 },
      { x: o.x + 2.4, z: o.z + 2.6 },
    ])
  }

  // 탕비실: 커피 머신·옆 수납장·싱크 앞(커피를 마시며 서 있는 자리)
  const coffeePois: Poi[] = [-0.5, 0, 0.5].map((dx) => ({ x: CAFE.baristaX + dx, z: CAFE.frontZ + 0.336, yaw: Math.PI }))
  // 휴게 공간(소파가 다 찼을 때 서 있는 자리)
  const loungePois: Poi[] = [
    { x: 2.9, z: SOFA_Z, yaw: -Math.PI / 2 },
    { x: 2.5, z: SOFA_Z - 1.3, yaw: Math.PI / 2 },
    { x: 2.75, z: SOFA_Z + 1.2, yaw: -Math.PI / 2 },
    { x: 1.2, z: 8.1, yaw: -Math.PI / 2 },
  ]
  const pois: Poi[] = [
    // TV 앞(사용량 보기)
    { x: W - 1.4, z: 1.2, yaw: Math.PI },
    { x: 8.6, z: 0.95, yaw: Math.PI },
    { x: 10.1, z: 0.95, yaw: Math.PI },
    // 큰 창 앞(창밖 보기)
    { x: 0.95, z: 8.2, yaw: -Math.PI / 2 },
    ...coffeePois,
    // 커피 바 모서리 앞
    { x: 3.75, z: CAFE.z - 1.5, yaw: -Math.PI / 2 },
    ...loungePois,
    // 통로
    { x: 10.1, z: 6.4, yaw: 0 },
    { x: 4.1, z: 8.4, yaw: 0 },
    { x: W - 0.6, z: 4.4, yaw: -Math.PI / 2 },
  ]

  const shelfBooks = buildShelfBooks(items)
  const trophies = buildTrophies(items)
  return {
    items,
    seats,
    pois,
    spots,
    blocked,
    rug,
    sofaSeats,
    chairSeats,
    loungePois,
    coffeePois,
    shelfBooks,
    trophies,
    teaSeats,
    espresso: { x: CAFE.counterX, y: COUNTER_TOP, z: CAFE.z, rot: Math.PI / 2, groups: 2 },
    barista: { x: CAFE.baristaX, z: CAFE.z + 0.45, yaw: 0 },
    // 유리에서 떨어진 이동식 TV
    tv: { x: W - 1.4, y: 0.91, z: 0.68, w: 1.8, h: 1.08 },
    frames: [],
    // 출입은 엘리베이터로 통합하고 각 유리면을 같은 폭의 패널로 균등 분할한다.
    windows: [
      { wall: 'W', z: (D + WINDOW_RADIUS) / 2, y: (1.29 * WALL_SY) / 2, w: D - WINDOW_RADIUS, h: 1.29 * WALL_SY, mullions: 4 },
      { wall: 'N', x: (W + WINDOW_RADIUS) / 2, y: (1.29 * WALL_SY) / 2, w: W - WINDOW_RADIUS, h: 1.29 * WALL_SY, mullions: 4 },
    ],
  }
}

export const LAYOUT: OfficeLayout = build()

/** 메인이 '답변을 마치고 사용자 차례(도구 없음)'로 REST_AFTER_MS 를 넘기면 쉬러 간다. now·lastAt 은 둘 다 서버(SSE 스냅샷) 시각이다 */
export function shouldRest(
  s: { state: string; tool: string | null; lastAt: number },
  now: number,
): boolean {
  return s.state === 'waiting' && s.tool === null && now - s.lastAt > REST_AFTER_MS
}

/**
 * 쉬러 간 사람이 머물 자리. 소파 → 1인용 의자 → 커피 머신 앞 → 휴게 공간 서 있는 자리 순으로 빈 곳을 고른다.
 * taken 은 이미 쓰는 자리 id(`sofa-0`, `chair-1`, `coffee-2`, `poi-2` …)이다.
 */
export function pickRestSpot(
  taken: ReadonlySet<string>,
  rnd: () => number = Math.random,
): RestSpot {
  const pick = <T>(list: T[]) => list[Math.floor(rnd() * list.length)]
  for (const group of [LAYOUT.sofaSeats, LAYOUT.chairSeats]) {
    const seats = group.filter((s) => !taken.has(s.id))
    if (seats.length) {
      const seat = pick(seats)
      return { kind: 'sit', id: seat.id, seat }
    }
  }
  const cups = LAYOUT.coffeePois
    .map((poi, i) => ({ poi, id: `coffee-${i}` }))
    .filter((c) => !taken.has(c.id))
  if (cups.length) {
    const one = pick(cups)
    return { kind: 'coffee', id: one.id, poi: one.poi }
  }
  const stands = LAYOUT.loungePois.map((poi, i) => ({ poi, id: `poi-${i}` }))
  const free = stands.filter((s) => !taken.has(s.id))
  const one = pick(free.length ? free : stands)
  return { kind: 'stand', id: one.id, poi: one.poi }
}

/** 후보 중 다른 캐릭터가 서 있거나 가는 중인 자리를 뺀 목록. occupied 의 null 은 무시한다 */
export function freePois(candidates: Poi[], occupied: Iterable<Poi | null | undefined>): Poi[] {
  const used = new Set<Poi>()
  for (const p of occupied) if (p) used.add(p)
  return candidates.filter((p) => !used.has(p))
}

export interface P2 {
  x: number
  z: number
}

/** 4방향 BFS 최단 경로(셀 중심 좌표 목록). 시작·도착 칸은 막혀 있어도 통과시킨다 */
export function findPath(from: P2, to: P2, blocked: Set<string>): P2[] | null {
  const fc = cellOf(from.x)
  const fr = cellOf(from.z)
  const tc = cellOf(to.x)
  const tr = cellOf(to.z)
  if (fc === tc && fr === tr) return []
  const startKey = key(fc, fr)
  const prev = new Map<string, string | null>()
  prev.set(startKey, null)
  const queue: [number, number][] = [[fc, fr]]
  const dirs = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ]
  for (let head = 0; head < queue.length; head++) {
    const [cc, cr] = queue[head]
    for (const [dc, dr] of dirs) {
      const c = cc + dc
      const r = cr + dr
      const k = key(c, r)
      if (prev.has(k)) continue
      const inRoom = c >= 1 && c <= COLS - 2 && r >= 1 && r <= ROWS - 2
      const isGoal = c === tc && r === tr
      if (!inRoom) continue
      if (blocked.has(k) && !isGoal) continue
      prev.set(k, key(cc, cr))
      if (isGoal) {
        const path: P2[] = []
        let at: string | null = k
        while (at && at !== startKey) {
          const [pc, pr] = at.split(',').map(Number)
          path.unshift({ x: cellCenter(pc), z: cellCenter(pr) })
          at = prev.get(at) ?? null
        }
        return path
      }
      queue.push([c, r])
    }
  }
  return null
}
