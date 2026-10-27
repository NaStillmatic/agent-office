/**
 * AI 작업 사무실 장면(three.js). 아이소메트릭으로 고정한 정사영 카메라로 내려다보고,
 * 이름표·말풍선은 한글 표시를 위해 CSS2DRenderer 로 올린다.
 * 사람형 캐릭터와 관절 애니메이션은 humanCharacter.ts 에서 생성한다.
 */
import {
  ACESFilmicToneMapping,
  Box3,
  BoxGeometry,
  AmbientLight,
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  LoopRepeat,
  LatheGeometry,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  MeshStandardMaterial,
  SkinnedMesh,
  type Object3D,
  OrthographicCamera,
  PCFShadowMap,
  PlaneGeometry,
  Plane,
  PointLight,
  RepeatWrapping,
  RingGeometry,
  SRGBColorSpace,
  Scene,
  Shape,
  ShapeGeometry,
  Texture,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { createHumanCharacter, HUMAN_HEAD_TOP, HUMAN_SIT_BOTTOM } from './humanCharacter'
import { createBaristaSprite, createSpritePerson, type SpritePerson } from './spriteCharacters'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {
  CHARACTER_NAMES,
  loadOfficeAssets,
  releaseOfficeAssets,
  type CharacterModel,
  type OfficeAssets,
} from './assets'
import {
  D,
  CAFE,
  DOOR,
  ELEVATOR,
  LAYOUT,
  TEAM_COLORS,
  W,
  WALL_SY,
  WINDOW_RADIUS,
  ZONE_COUNT,
  ZONE_ORIGIN,
  ZONE_SIZE,
  SEAT_YAW,
  findPath,
  freePois,
  pickRestSpot,
  shouldRest,
  type Item,
  type P2,
  type Poi,
  type RestSpot,
  type Seat,
  type SofaSeat,
  type WallFrame,
  type WallWindow,
} from './layout'
import { AGENT_LOOKS, AGENT_NAMES, CHARACTER_RENDER_STYLE, MAIN_STAYS_SEATED, SEAT_OF_TYPE, SEAT_OTHER } from './office.config'
import { t, getLocale } from '../i18n'
import type { Provider } from './providers'
import { classifyRole, roleZone, roleLabel, pickRoleSeat, sharedSeatForSlot, sharedSlotForSeat } from './roles'
import { addRoleFurniture } from './roleFurniture'
import { nightness } from './windowView'
import { createSeoulBackdrop, panoramaWeights } from './exterior'
import { arrivalCanAppear, FloorElevator } from './elevator'
import { curvedTrimGeometry, curvedWindowGeometry } from './windowGeometry'
import { instanceStaticMeshes } from './staticMeshes'

export interface Status {
  state: 'working' | 'waiting' | 'idle' | 'ended'
  tool: string | null
  lastAt: number
}
export interface AgentInfo extends Status {
  id: string
  agentType: string
  description: string
}

export interface SessionInfo {
  id: string
  provider?: Provider
  /** 세션을 시작한 폴더 이름(서버가 cwd 로 정한다) */
  project: string
  main: Status
  agents: AgentInfo[]
}

type Act = 'type' | 'read' | 'wait' | 'idle'
type Goal = 'seat' | 'poi' | 'spot' | 'door' | 'coffee' | 'lounge' | 'tea'
type ClipName = 'idle' | 'walk' | 'sit' | 'work' | 'read' | 'wait' | 'coffee'

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'NotebookRead', 'LS'])
/** 모니터 몸체는 검정 대신 밝은 은색. 빈자리 화면은 모든 자리가 같은 파란색으로 켜져 있다 */
const MONITOR_BODY = '#c9d1d6'
const SCREEN_IDLE_COLOR = '#2f8fe0'
const SCREEN_IDLE_GLOW = 0.55
/** Studio Display 스타일 화면의 로컬 좌표. 본체 앞(+z)에 콘텐츠를 붙인다. */
const SCREEN_FACE = { x0: -0.1895, x1: 0.1895, yBottom: 0.095, zBottom: 0.018, yTop: 0.3264, zTop: 0.018 }
/** 터미널 텍스처: 한 줄 높이(px)·줄 수. 자리마다 보이는 창을 아래로 옮겨 스크롤한다 */
const TERM_LINE = 14
const TERM_LINES = 60
/** 앉은 사람이 하는 일별 터미널 스크롤 속도(줄/초). 대기 중이면 멈춘다 */
const TERM_SPEED = { bash: 14, type: 5, read: 2 }
const FLOOR_CLIP = new Plane(new Vector3(0, 1, 0), 0)
const WALK_SPEED = 1.15 // 월드 단위/초
const CHAR_SCALE = 1.1
/** 서 있는 모델의 머리 끝 높이(모델 좌표, 스케일 1 기준) */
const MODEL_HEAD_TOP = HUMAN_HEAD_TOP
/** sit 클립이 뿌리를 낮추는 높이(모델 좌표, 스케일 1 기준) */
const SIT_ROOT_DROP = 0.15
const CHAR_HEIGHT = MODEL_HEAD_TOP * CHAR_SCALE
/** chairDesk 방석 윗면 높이(모델 좌표, 의자 스케일 1 기준) */
const SEAT_TOP = 0.233
/** 앉은 자세에서 허벅지 아랫면의 모델 좌표 높이(몸통 밑면보다 낮다). 이 면이 방석 윗면에 얹힌다 */
const SIT_THIGH_BOTTOM = HUMAN_SIT_BOTTOM
const NO_SHADOW = new Set(['rugRound', 'rugDoormat'])
/** 휴게 공간 소파·1인용 의자의 세이지 그린 패브릭 */
const SOFA_COLOR = new Color('#9cae9f')
/** 천 소파라 거의 무광 */
const SOFA_ROUGHNESS = 0.85
const TEAM_FLOORS = ['#c3d8d4', '#e1d3bc', '#dfc9cd', '#cedcc3', '#d4cde5', '#e5cfba']
/** 램프 불빛 색과 한밤 세기 */
const LAMP_GLOW = '#ffbf73'
const LAMP_POWER = 2.2
/** 둥근 러그: 나무 바닥·가죽 소파(주황빛 갈색)와 보색이라 눈에 띄는 딥 틸 바탕과 더 짙은 테(재질 이름별) */
const RUG_COLORS: Record<string, Color> = { carpet: new Color('#2c7a7b'), carpetDarker: new Color('#1d5556') }

/** 캐릭터 모델 이름(`character-` 접두 뺀 것)으로 CHARACTER_NAMES 번호를 구한다. 표에 없는 이름이면 로드 시점에 바로 던진다(개발 화면이라 fail-fast) */
export function charOf(name: string) {
  const i = CHARACTER_NAMES.indexOf(`character-${name}`)
  if (i < 0) throw new Error(`Unknown character model: ${name} (see CHARACTER_NAMES in assets.ts)`)
  return i
}

/**
 * 자동 배정 옷 색 후보. 서로 CIE Lab 거리 20 이상이고 메인 옷 색과도 떨어져 있다(테스트가 검사).
 * office.config.ts AGENT_LOOKS 에 없는 종류가 이 중에서 고른다(pickClothesColor).
 */
export const CLOTHES_COLORS = [
  '#30a46c', '#8e4ec6', '#3e63dd', '#d62839', '#0b8f8a', '#e0409a', '#eceff4', '#4cc3f0',
  '#c4551d', '#c3d62b', '#ffd43b', '#b8793f', '#4a5568', '#a8f0d0', '#a3264f', '#6b7d1e',
  '#f4b183', '#ff8a8a', '#b7a1f2', '#9aa5b8', '#ffb3c7', '#2f5d3a',
]

/** 표의 모델 이름이 CHARACTER_NAMES 에 모두 있는지 로드 시점에 확인한다 */
const MODEL_BY_TYPE: Record<string, number> = Object.fromEntries(
  Object.entries(AGENT_LOOKS).map(([type, look]) => [type, charOf(look.model)]),
)

function hashOf(type: string) {
  let h = 0
  for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) >>> 0
  return h
}

/**
 * 표에 없는 종류의 옷 색. 종류 이름으로 정한 후보부터 보고, 이미 다른 종류가 쓰는 색(taken)이면 다음 후보로 넘어간다.
 * 그래서 같은 종류는 대체로 늘 같은 색이고, 한 화면의 종류끼리는 후보가 남는 한 겹치지 않는다.
 * AGENT_LOOKS 에 고정한 색은 후보에서 뺀다. 후보가 다 쓰이면 겹치더라도 이름으로 정한 색을 쓴다.
 */
export function pickClothesColor(type: string, taken: ReadonlySet<string>) {
  const pinned = new Set(Object.values(AGENT_LOOKS).map((l) => l.color))
  const pool = CLOTHES_COLORS.filter((c) => !pinned.has(c))
  const start = hashOf(type) % pool.length
  for (let i = 0; i < pool.length; i++) {
    const c = pool[(start + i) % pool.length]
    if (!taken.has(c)) return c
  }
  return pool[start]
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
/** variant 한 단계마다 모델 번호를 건너뛰는 간격. 풀 크기와 서로소여야 같은 타입끼리 모델이 한 바퀴 돌 때까지 겹치지 않는다 */
export function variantStep(poolSize: number) {
  let s = Math.max(2, Math.floor(poolSize / 2))
  while (gcd(s, poolSize) !== 1) s++
  return s
}
const VARIANT_STEP = variantStep(CHARACTER_NAMES.length)

/** 같은 agentType 이 여럿이면 variant(0,1,2…)마다 다른 모델을 쓴다(옷 색은 종류 색 그대로) */
export function charIndexOf(type: string, isMain: boolean, variant: number) {
  const base = isMain
    ? MODEL_BY_TYPE.main
    : (MODEL_BY_TYPE[type] ?? hashOf(type) % CHARACTER_NAMES.length)
  return (base + variant * VARIANT_STEP) % CHARACTER_NAMES.length
}

/** 앉는 자리 한 곳(책상 의자 또는 소파). 앉은 높이와 일어나 나오는 지점을 담는다 */
interface SitSpot {
  x: number
  z: number
  yaw: number
  /** 일어나 나오는 지점 */
  cx: number
  cz: number
  /** 방석 윗면의 월드 높이 */
  seatTop: number
  /** 소파면 true. 일하는 동작 대신 그냥 앉은 클립을 쓴다 */
  sofa: boolean
}

const deskSit = (s: Seat): SitSpot => ({
  x: s.x,
  z: s.z,
  yaw: s.yaw,
  cx: s.cx,
  cz: s.cz,
  seatTop: SEAT_TOP * s.chairHeight,
  sofa: false,
})

/** 앉은 자세의 홀더 높이: 허벅지 아랫면이 방석 윗면에 얹히게 올린다 */
const liftOf = (seatTop: number) => seatTop - CHAR_SCALE * SIT_THIGH_BOTTOM

interface Char {
  key: string
  session: string
  zone: number
  typeKey: string
  /** 이름표의 이름 칸. agentType 이 늦게 들어오면 바꿔 쓴다 */
  nameTextEl: HTMLElement
  title: string
  isMain: boolean
  status: Status
  act: Act
  seat: Seat | null
  spot: P2 | null
  x: number
  z: number
  yaw: number
  targetYaw: number
  path: P2[]
  mode: 'walk' | 'sit' | 'stand'
  goal: Goal
  poi: Poi | null
  /** 지금 앉아 있는(또는 앉으러 가는) 자리. mode 가 sit 일 때만 의미가 있다 */
  sitAt: SitSpot | null
  /** 쉬러 간 자리(소파·의자 좌석, 커피 자리, 휴게 공간 서 있는 자리). 쉬는 동안만 값이 있다 */
  rest: RestSpot | null
  /** 한가할 때 잠깐 앉으러 가는 티테이블 의자(goal 'tea') */
  tea: SofaSeat | null
  /** 오른손에 든 컵(커피 마시는 동안만) */
  cup: Mesh | null
  /** 쉬러 가는 길에 커피 머신에 들를지 */
  coffeeFirst: boolean
  idleTimer: number
  standTimer: number
  leaving: boolean
  entering: boolean
  ridingDown: boolean
  removed: boolean
  /** 입장 전 대기(여럿이 한꺼번에 들어와 겹치지 않게 시차를 둔다) */
  delay: number
  holder: Group
  ring: Group
  mixer: AnimationMixer
  spritePerson: SpritePerson | null
  spriteTime: number
  actions: Partial<Record<ClipName, AnimationAction>>
  clips: CharacterModel['clips']
  playing: ClipName | null
  label: CSS2DObject
  tagEl: HTMLElement
  textEl: HTMLElement
  labelEl: HTMLElement
  /** 이름표 위 말풍선: 작업 중이면 도구 칩 + 설명, 응답 대기면 점 세 개 */
  bubbleEl: HTMLElement
  dotsEl: HTMLElement
  shownText: string
  shownTag: string
  /** 메인이 막 띄운 에이전트를 아직 못 찾음(spawningAgent) */
  spawning: boolean
}

/**
 * 서브에이전트 이름표에 쓰는 이름. 어떤 프로젝트의 agentType 이 와도 읽히도록 규칙으로 정한다.
 * - office.config.ts AGENT_NAMES 에 적은 이름이 있으면 그것
 * - 플러그인 에이전트(`플러그인:에이전트`)는 에이전트 이름만(전체 이름은 상세 카드에 나온다)
 * - agentType 을 모르면(meta.json 이 없는 드문 기록) '서브에이전트'(지금 언어로)
 */
export function agentLabel(type: string) {
  if (AGENT_NAMES[type]) return AGENT_NAMES[type]
  if (!type) return t().subagent
  return type.slice(type.lastIndexOf(':') + 1) || type
}

/** 이름표 1줄에 쓰는 이름 */
const agentNameOf = (type: string, isMain: boolean) => (isMain ? t().mainName : agentLabel(type))

const rand = (a: number, b: number) => a + Math.random() * (b - a)

function actOf(s: Status): Act {
  if (s.state === 'waiting') return 'wait'
  if (s.state === 'idle') return 'idle'
  return s.tool && READ_TOOLS.has(s.tool) ? 'read' : 'type'
}

/** 서브에이전트를 띄우는 도구. Task 는 예전 Claude Code 의 이름이다 */
const AGENT_TOOLS = new Set(['Agent', 'Task', 'spawn_agent', 'wait', 'send_input'])

/**
 * 메인 말풍선 설명. 에이전트를 기다리는 중이면 칩(Agent)만으로는 누구를 기다리는지 모르므로
 * 일하는 에이전트 이름(같은 종류가 여럿이면 ×인원수)을 적는다. 그 밖에는 이름표와 같아 설명 줄이 숨겨진다.
 */
export function mainTitle(s: SessionInfo) {
  const busy = s.agents.filter((a) => a.state === 'working')
  if (!s.main.tool || !AGENT_TOOLS.has(s.main.tool) || !busy.length) return t().mainName
  // 같은 종류가 여럿이면 이름 뒤에 인원수를 붙인다(이름을 한 번만 적으면 한 명만 일하는 것처럼 보인다)
  const count = new Map<string, number>()
  for (const a of busy) count.set(agentLabel(a.agentType), (count.get(agentLabel(a.agentType)) ?? 0) + 1)
  const names = [...count].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name))
  return t().waitingFor(names.join(' · '))
}

/** 메인이 에이전트를 띄웠는데 아직 그 에이전트 기록이 안 잡힌 순간(1~2초). 이름 대신 점 세 개를 띄운다 */
export function spawningAgent(s: SessionInfo) {
  return !!s.main.tool && AGENT_TOOLS.has(s.main.tool) && !s.agents.some((a) => a.state === 'working')
}

/**
 * 도구 이름을 말풍선에 맞게 줄인다. MCP 도구(`mcp__<서버>__<도구>`)는 이름이 길고 내부 식별자라
 * `서버 · 도구` 로 바꾼다. 플러그인 서버는 `plugin_<플러그인>_<서버>` 꼴이라 둘이 같으면 하나만 남긴다.
 * 예: mcp__plugin_playwright_playwright__browser_take_screenshot → playwright · take screenshot
 */
export function toolLabel(name: string) {
  if (!name.startsWith('mcp__')) return name
  const [rawServer, ...rest] = name.slice(5).split('__')
  let server = rawServer.replace(/^plugin_/, '').replace(/^claude_ai_/, '')
  const half = server.split('_')
  if (half.length === 2 && half[0] === half[1]) server = half[0]
  const tool = rest.join('__').replace(/^browser_/, '')
  return [server, tool]
    .filter(Boolean)
    .map((t) => t.replace(/_/g, ' '))
    .join(' · ')
}

/** 메인이나 서브 중 하나라도 일하고 있는 세션 */
export const isBusy = (s: SessionInfo) =>
  s.main.state === 'working' || s.agents.some((a) => a.state === 'working')

/** 세션의 마지막 활동 시각(메인·서브 중 가장 최근) */
const activeAt = (s: SessionInfo) => Math.max(s.main.lastAt, ...s.agents.map((a) => a.lastAt))

/**
 * 구역 배정. zones 는 구역별 세션 id(빈 구역 null), live 는 화면에 나올 세션, leaving 은 이미
 * 비켜 주는 중인(캐릭터가 나가는) 세션이다.
 * - 빈 구역은 일하는 세션 → 최근 활동순으로 채운다.
 * - 구역이 모자라면 일하는 세션을 위해서만, 일하지 않는 세션 중 가장 오래 조용한 것을 비켜 세운다(evict).
 *   일하는 세션끼리는 밀어내지 않는다 — 활동 시각이 바뀔 때마다 자리가 뒤바뀌며 들락거리지 않도록.
 * - 이미 나가는 중인 구역은 곧 비므로, 그만큼은 새로 비켜 세우지 않는다.
 */
export function planZones(
  zones: readonly (string | null)[],
  live: readonly SessionInfo[],
  leaving: ReadonlySet<string>,
): { zones: (string | null)[]; evict: string[] } {
  const next = [...zones]
  const byId = new Map(live.map((s) => [s.id, s]))
  const waiting = live
    .filter((s) => !next.includes(s.id))
    .sort((a, b) => Number(isBusy(b)) - Number(isBusy(a)) || activeAt(b) - activeAt(a))
  const evict: string[] = []
  let freeing = next.filter((id) => id !== null && (!byId.has(id) || leaving.has(id))).length
  for (const s of waiting) {
    const free = next.indexOf(null)
    if (free >= 0) {
      next[free] = s.id
      continue
    }
    if (!isBusy(s)) break // 일하지 않는 세션은 남는 구역이 생길 때만 들어온다
    if (freeing > 0) {
      freeing--
      continue
    }
    const victim = next
      .map((id) => (id ? byId.get(id) : undefined))
      .filter((h): h is SessionInfo => !!h && !isBusy(h) && !leaving.has(h.id) && !evict.includes(h.id))
      .sort((a, b) => activeAt(a) - activeAt(b))[0]
    if (!victim) break
    evict.push(victim.id)
  }
  return { zones: next, evict }
}

/** 도구 결과를 너무 오래 못 받은 서브(서버가 idle 로 내리되 도구 이름은 남긴다) */
const isStalled = (s: Status) => s.state === 'idle' && s.tool !== null

/** 말풍선 칩 문구. 도구가 없으면 모델이 답변·다음 호출을 만드는 중이라 '작업 중'이다 */
function toolText(s: Status) {
  if (isStalled(s)) return t().state.stalled
  return s.tool ? toolLabel(s.tool) : t().state.working
}

function turnToward(cur: number, target: number, step: number) {
  let diff = (target - cur) % (Math.PI * 2)
  if (diff > Math.PI) diff -= Math.PI * 2
  if (diff < -Math.PI) diff += Math.PI * 2
  if (Math.abs(diff) <= step) return target
  return cur + Math.sign(diff) * step
}

/** Four large 1.2 m limestone tiles per repeat, with fine seams and a matte finish. */
const FLOOR_TILE = 2.4

function stoneTexture() {
  const size = 256
  const tile = size / 2
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const g = cv.getContext('2d')!
  let seed = 614
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32
  const tones = ['#d6d9d8', '#d4d7d6', '#d8dad9', '#d5d8d7']
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const x = col * tile
      const y = row * tile
      g.fillStyle = tones[row * 2 + col]
      g.fillRect(x, y, tile, tile)
      for (let i = 0; i < 1800; i++) {
        g.fillStyle = random() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(71,80,83,0.035)'
        g.fillRect(x + Math.floor(random() * tile), y + Math.floor(random() * tile), 1, 1)
      }
      g.fillStyle = 'rgba(86,96,101,0.18)'
      g.fillRect(x, y, tile, 1)
      g.fillRect(x, y, 1, tile)
    }
  }
  const tex = new CanvasTexture(cv)
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/**
 * 액자 글자 판: 밝은 크림 바탕에 짙은 남색 굵은 산세리프 글자(두 줄)와 주황 밑줄. 글자 한 줄의 크기가 판 높이의 42% 라 멀리서도 읽힌다.
 * 1024px 높이로 그리고 anisotropy·sRGB 를 맞춰 비스듬한 시점에서도 또렷하게 한다.
 */
function frameTexture(text: string, aspect: number, maxAniso: number) {
  const h = 1024
  const w = Math.round(h * aspect)
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d')!
  g.fillStyle = '#fff4d6'
  g.fillRect(0, 0, w, h)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const lines = text.split(' ')
  const font = (px: number) =>
    `900 ${px}px "Helvetica Neue", Arial, "Apple SD Gothic Neo", sans-serif`
  let size = Math.round(h * 0.42)
  g.font = font(size)
  while (Math.max(...lines.map((l) => g.measureText(l).width)) > w * 0.88 && size > 40) {
    size -= 8
    g.font = font(size)
  }
  g.fillStyle = '#14213d'
  const gap = size * 0.98
  const top = h * 0.46 - ((lines.length - 1) * gap) / 2
  lines.forEach((l, i) => g.fillText(l, w / 2, top + i * gap))
  g.fillStyle = '#e8590c'
  g.fillRect(w * 0.3, h * 0.93, w * 0.4, 14)
  const tex = new CanvasTexture(cv)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = Math.min(8, maxAniso)
  return tex
}

/** 화면 면의 가로세로 비(기울어진 세로 길이 기준) */
const SCREEN_ASPECT =
  (SCREEN_FACE.x1 - SCREEN_FACE.x0) /
  Math.hypot(SCREEN_FACE.yTop - SCREEN_FACE.yBottom, SCREEN_FACE.zTop - SCREEN_FACE.zBottom)

/** 모니터 화면용 캔버스 텍스처 공통 설정 */
function screenTexture(cv: HTMLCanvasElement, maxAniso: number) {
  const tex = new CanvasTexture(cv)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = Math.min(8, maxAniso)
  return tex
}

/** 왼쪽 모니터: 디자인 툴 화면(레이어 목록·캔버스 위 아트보드·속성 패널). 모든 자리가 같은 그림을 나눠 쓴다 */
function designTexture(maxAniso: number) {
  const w = 324
  const h = Math.round(w / SCREEN_ASPECT)
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d')!
  const box = (x: number, y: number, bw: number, bh: number, c: string) => {
    g.fillStyle = c
    g.fillRect(x, y, bw, bh)
  }
  box(0, 0, w, h, '#dfe2ea') // 캔버스 바탕
  box(0, 0, w, 14, '#2b2f45') // 제목 표시줄
  ;['#ff6b6b', '#f0c56a', '#7fe0a0'].forEach((c, i) => box(6 + i * 9, 5, 5, 5, c))
  box(0, 14, 58, h - 14, '#ffffff') // 레이어 목록
  for (let i = 0; i < 9; i++) box(8, 24 + i * 15, 30 + ((i * 13) % 14), 5, i === 2 ? '#3e63dd' : '#c9ccdf')
  box(w - 58, 14, 58, h - 14, '#ffffff') // 속성 패널
  for (let i = 0; i < 7; i++) {
    box(w - 50, 24 + i * 18, 18, 4, '#c9ccdf')
    box(w - 28, 22 + i * 18, 20, 8, '#eef0f6')
  }
  // 아트보드: 머리글·큰 이미지·카드 셋·버튼
  const ax = 74
  const ay = 24
  const aw = w - 148
  const ah = h - 34
  box(ax, ay, aw, ah, '#ffffff')
  box(ax, ay, aw, 14, '#3e63dd')
  box(ax + 10, ay + 22, aw - 20, 46, '#f0c56a')
  box(ax + 10, ay + 74, aw * 0.5, 6, '#2b2f45')
  box(ax + 10, ay + 84, aw * 0.7, 4, '#c9ccdf')
  const cw = (aw - 40) / 3
  ;['#30a46c', '#e0409a', '#4cc3f0'].forEach((c, i) => {
    const cx = ax + 10 + i * (cw + 10)
    box(cx, ay + 96, cw, 40, '#eef0f6')
    box(cx, ay + 96, cw, 14, c)
    box(cx + 4, ay + 116, cw - 12, 3, '#c9ccdf')
    box(cx + 4, ay + 123, cw - 20, 3, '#c9ccdf')
  })
  box(ax + 10, ay + ah - 18, 44, 11, '#ff9f1c')
  // 선택한 카드: 파란 테두리와 모서리 손잡이
  const sx = ax + 10 + cw + 10
  const sy = ay + 96
  g.strokeStyle = '#3e63dd'
  g.lineWidth = 2
  g.strokeRect(sx - 2, sy - 2, cw + 4, 44)
  for (const [hx, hy] of [
    [sx - 2, sy - 2],
    [sx + cw + 2, sy - 2],
    [sx - 2, sy + 42],
    [sx + cw + 2, sy + 42],
  ]) {
    box(hx - 2, hy - 2, 5, 5, '#ffffff')
    g.strokeRect(hx - 2, hy - 2, 5, 5)
  }
  return screenTexture(cv, maxAniso)
}

/**
 * 오른쪽 모니터: 터미널 출력. 세로로 긴 한 장(TERM_LINES 줄)을 그려 두고, 자리마다 이 텍스처를 복제해
 * (이미지는 공유) 보이는 창(repeat·offset)만 아래로 옮겨 글자가 위로 흘러가게 한다. 위아래가 이어지게 반복된다.
 */
function terminalTexture(maxAniso: number) {
  const w = 324
  const h = TERM_LINE * TERM_LINES
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d')!
  g.fillStyle = '#0e1320'
  g.fillRect(0, 0, w, h)
  g.font = `${TERM_LINE - 3}px Menlo, Consolas, "DejaVu Sans Mono", monospace`
  g.textBaseline = 'top'
  const OUT: [string, string][] = [
    ['$ npm test', '#7fe0a0'],
    [' ✓ server/analyze.spec.ts (25)', '#7fe0a0'],
    [' ✓ src/zones.spec.ts (5)', '#7fe0a0'],
    [' ✓ src/layout.spec.ts (16)', '#7fe0a0'],
    ['   Tests  71 passed (71)', '#c9ccdf'],
    ['$ git status --short', '#7fe0a0'],
    [' M src/agent-office/scene.ts', '#f0c56a'],
    [' M README.md', '#f0c56a'],
    ['$ npm run build', '#7fe0a0'],
    ['vite v7.3.7 building for production...', '#c9ccdf'],
    ['✓ 312 modules transformed.', '#7fe0a0'],
    ['dist/assets/index.js   412.8 kB', '#7fb8ff'],
    ['$ grep -rn "TODO" src', '#7fe0a0'],
    ['src/app.ts:42:  // TODO: retry', '#7fb8ff'],
    ['$ curl -s localhost:3000/health', '#7fe0a0'],
    ['{"status":"ok","uptime":8123}', '#c9ccdf'],
  ]
  for (let i = 0; i < TERM_LINES; i++) {
    const [text, color] = OUT[i % OUT.length]
    g.fillStyle = color
    g.fillText(text, 8, i * TERM_LINE + 2)
  }
  const tex = screenTexture(cv, maxAniso)
  tex.wrapT = RepeatWrapping
  tex.repeat.y = w / SCREEN_ASPECT / h
  return tex
}

/**
 * 액자 픽셀아트: 세피아 노을 아래 벽돌 아파트 단지. 낮은 해상도로 칠하고 NearestFilter 로 키워 픽셀이 보이게 한다.
 * 매번 같은 그림이 나오도록 고정 시드 난수를 쓴다.
 */
/**
 * 액자 픽셀아트: 해 뜬 바다. 맑은 하늘·구름·해, 물결과 햇빛 반짝임이 있는 바다, 돛단배, 거품 줄과 모래사장.
 * 낮은 해상도로 칠하고 NearestFilter 로 키워 픽셀이 보이게 한다. 고정 시드 난수라 늘 같은 그림이다
 */
function seasideTexture(aspect: number) {
  const h = 36
  const w = Math.round(h * aspect)
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d')!
  let seed = 4242
  const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32
  const px = (x: number, y: number, c: string) => {
    g.fillStyle = c
    g.fillRect(x, y, 1, 1)
  }
  const horizon = Math.round(h * 0.5)
  const shore = Math.round(h * 0.8)
  // 하늘: 위는 맑은 파랑, 수평선 쪽은 옅은 하늘색. 띠 경계는 점묘로 섞는다
  const SKY = ['#4fa3e0', '#5fb0e6', '#72bdeb', '#88caef', '#a3d7f2', '#bfe4f5']
  for (let y = 0; y < horizon; y++) {
    const t = (y / horizon) * (SKY.length - 1)
    const i = Math.floor(t)
    for (let x = 0; x < w; x++) px(x, y, SKY[Math.min(SKY.length - 1, i + (rnd() < t - i ? 1 : 0))])
  }
  // 구름 두 덩이
  for (const [cx, cy, cw] of [
    [Math.round(w * 0.22), 6, 9],
    [Math.round(w * 0.6), 4, 7],
  ]) {
    for (let x = -cw; x <= cw; x++) {
      const top = Math.round(Math.sqrt(Math.max(0, 1 - (x / cw) ** 2)) * 2.5)
      for (let y = -top; y <= 1; y++) px(cx + x, cy + y, '#ffffff')
    }
  }
  // 해
  const sun = { x: Math.round(w * 0.8), y: Math.round(h * 0.2), r: 3 }
  for (let y = -sun.r; y <= sun.r; y++) {
    for (let x = -sun.r; x <= sun.r; x++) {
      if (Math.hypot(x, y) <= sun.r) px(sun.x + x, sun.y + y, '#fff3b0')
    }
  }
  // 바다: 수평선 쪽은 짙은 청록, 앞쪽은 밝은 청록. 가로 물결 무늬와 햇빛 반짝임
  const SEA = ['#1d6fa5', '#2382b5', '#2b95c2', '#36a8c9', '#47b9cc']
  for (let y = horizon; y < shore; y++) {
    const t = ((y - horizon) / (shore - horizon)) * (SEA.length - 1)
    for (let x = 0; x < w; x++) {
      const wave = (x + y * 3) % 7 === 0 && rnd() < 0.7
      px(x, y, wave ? '#e6f6fb' : SEA[Math.min(SEA.length - 1, Math.round(t))])
    }
  }
  for (let y = horizon + 1; y < shore - 2; y++) {
    if (rnd() < 0.6) px(sun.x + Math.round((rnd() - 0.5) * 6), y, '#fff3b0')
  }
  // 돛단배
  const bx = Math.round(w * 0.35)
  const by = horizon + 4
  for (let x = -3; x <= 3; x++) px(bx + x, by, '#7a4a2a')
  for (let x = -2; x <= 2; x++) px(bx + x, by + 1, '#7a4a2a')
  for (let y = 1; y <= 6; y++) {
    px(bx, by - y, '#5a3a22')
    for (let x = 1; x <= Math.round((6 - y) * 0.6) + 1; x++) px(bx + x, by - y, '#ffffff')
  }
  // 파도 거품 줄과 모래사장
  for (let x = 0; x < w; x++) {
    px(x, shore, rnd() < 0.8 ? '#ffffff' : '#d8f1f6')
    for (let y = shore + 1; y < h; y++) px(x, y, rnd() < 0.15 ? '#e0c48f' : '#f0d9a6')
  }
  const tex = new CanvasTexture(cv)
  tex.colorSpace = SRGBColorSpace
  tex.magFilter = NearestFilter
  tex.minFilter = NearestFilter
  tex.generateMipmaps = false
  return tex
}

function skylineTexture(aspect: number) {
  const h = 30
  const w = Math.round(h * aspect)
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d')!
  let seed = 20240419
  const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32
  const px = (x: number, y: number, c: string) => {
    g.fillStyle = c
    g.fillRect(x, y, 1, 1)
  }
  // 하늘: 위는 짙은 갈색, 지평선으로 갈수록 밝은 세피아. 띠 경계는 점묘(디더)로 섞는다
  const SKY = ['#6a4a32', '#7c5a3d', '#906b48', '#a47d55', '#b78f63', '#c8a171', '#d7b382', '#e3c494', '#ecd3a7']
  const ground = h - 2
  for (let y = 0; y < ground; y++) {
    const t = (y / ground) * (SKY.length - 1)
    const i = Math.floor(t)
    for (let x = 0; x < w; x++) px(x, y, SKY[Math.min(SKY.length - 1, i + (rnd() < t - i ? 1 : 0))])
  }
  // 낮게 걸린 흐릿한 해
  const sun = { x: Math.round(w * 0.7), y: Math.round(h * 0.3), r: 3 }
  for (let y = -sun.r; y <= sun.r; y++) {
    for (let x = -sun.r; x <= sun.r; x++) {
      const d = Math.hypot(x, y)
      if (d <= sun.r) px(sun.x + x, sun.y + y, d < sun.r - 1 ? '#fff1cf' : '#f6ddb0')
    }
  }
  // 건물 한 동: 벽돌 몸통 + 창문 격자(2칸 간격). 불 켜진 창은 lit 확률로
  const tower = (x0: number, bw: number, top: number, body: string, win: string, dark: string, lit: number) => {
    for (let y = top; y < ground; y++) for (let x = x0; x < x0 + bw; x++) px(x, y, body)
    for (let y = top + 1; y < ground - 1; y += 2) {
      for (let x = x0 + 1; x < x0 + bw - 1; x += 2) px(x, y, rnd() < lit ? win : dark)
    }
  }
  // 뒷줄: 멀어서 흐린 높은 동들
  for (let x = -1; x < w; ) {
    const bw = 5 + Math.floor(rnd() * 3)
    tower(x, bw, Math.round(h * (0.4 + rnd() * 0.12)), '#9a7351', '#c9a477', '#86613f', 0.45)
    x += bw + 1 + Math.floor(rnd() * 2)
  }
  // 앞줄: 진한 벽돌 동들. 한 동 지붕에는 물탱크
  let tank = false
  for (let x = -2; x < w; ) {
    const bw = 6 + Math.floor(rnd() * 4)
    const top = Math.round(h * (0.52 + rnd() * 0.16))
    tower(x, bw, top, '#4a3121', '#f2d398', '#36241a', 0.35)
    if (!tank && x > 2 && x + bw < w - 2) {
      const tx = x + Math.floor(bw / 2) - 1
      for (let y = top - 4; y < top - 1; y++) for (let k = 0; k < 3; k++) px(tx + k, y, '#2f2017')
      px(tx, top - 1, '#2f2017')
      px(tx + 2, top - 1, '#2f2017')
      tank = true
    }
    x += bw + Math.floor(rnd() * 2)
  }
  // 땅과 사진 같은 거친 입자
  for (let y = ground; y < h; y++) for (let x = 0; x < w; x++) px(x, y, '#22170f')
  const img = g.getImageData(0, 0, w, h)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 12
    for (let c = 0; c < 3; c++) img.data[i + c] = Math.max(0, Math.min(255, img.data[i + c] + n))
  }
  g.putImageData(img, 0, 0)
  const tex = new CanvasTexture(cv)
  tex.colorSpace = SRGBColorSpace
  tex.magFilter = NearestFilter
  tex.minFilter = NearestFilter
  tex.generateMipmaps = false
  return tex
}

export class OfficeScene {
  private renderer: WebGLRenderer
  private labelRenderer: CSS2DRenderer
  private scene = new Scene()
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200)
  private target = new Vector3(W / 2, 0.3, D / 2)
  private assets: OfficeAssets | null = null
  private chars = new Map<string, Char>()
  private elevator: { motion: FloorElevator; pod: Group; signal: MeshStandardMaterial } | null = null
  private barista: { mixer: AnimationMixer; spritePerson: SpritePerson | null; elapsed: number } | null = null
  private zones: (string | null)[] = new Array(ZONE_COUNT).fill(null)
  private zoneMats: MeshBasicMaterial[] = []
  private zoneLabels: { el: HTMLElement; obj: CSS2DObject }[] = []
  private teamRingMats = TEAM_COLORS.map(
    (c) => new MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 }),
  )
  private teamDiscMats = TEAM_COLORS.map(
    (c) => new MeshBasicMaterial({ color: c, transparent: true, opacity: 0.3 }),
  )
  /** 커피 컵: Kenney Furniture Kit 에 컵·머그 모델이 없어 작은 원통으로 대신한다(캐릭터 모델 좌표 크기) */
  private cupGeo = new CylinderGeometry(0.04, 0.032, 0.08, 14)
  private cupMat = new MeshStandardMaterial({ color: '#f4efe6', roughness: 0.6 })
  private ringGeo = new RingGeometry(0.2, 0.27, 40)
  private discGeo = new CircleGeometry(0.27, 40)
  /**
   * 자리별 모니터 화면. planes 는 듀얼 디스플레이의 내용 판(사람이 앉아 있을 때만 보인다), term 은 터미널 텍스처
   * (이미지는 terminalBase 와 공유), scroll 은 스크롤한 줄 수다.
   */
  private screens = new Map<string, { planes: Mesh[]; term: Texture | null; scroll: number }>()
  private designBase: Texture | null = null
  private terminalBase: Texture | null = null
  private designMat: MeshBasicMaterial | null = null
  private screenGeo: PlaneGeometry | null = null
  private screenIdleMat: MeshStandardMaterial | null = null
  /** 방(바닥·벽·가구)의 월드 범위. 모델을 다 놓기 전에는 null 이고 대략값으로 맞춘다 */
  private roomBox: Box3 | null = null
  /** 구역별 의자 방석 재질(팀 색으로 바뀐다) */
  private chairMats = new Map<number, MeshStandardMaterial>()
  /** 자동 배정한 종류별 옷 색(clothesColorOf) */
  private typeColors = new Map<string, string>()
  /** 모니터 몸체 재질. 모든 모니터가 같은 색이라 하나를 나눠 쓴다 */
  private monitorBody: MeshStandardMaterial | null = null
  private deskTemplate: Group | null = null
  private keyboardTemplate: Group | null = null
  private displayTemplates = new Map<boolean, Group>()
  private staticFurniture: Mesh[] = []
  /** 창문 안에서 이어지는 서울 강변 파노라마 */
  private exterior: ReturnType<typeof createSeoulBackdrop> | null = null
  private exteriorMinute = -1
  /** 방 조명(낮 밝기 기준). 밤이 될수록 줄여 램프 불빛이 드러나게 한다(updateDayNight) */
  private roomLights: { hemi: HemisphereLight; amb: AmbientLight; sun: DirectionalLight } | null = null
  /** 램프마다 갓 재질(밤에 빛남)과 갓 속 점광원 */
  private lamps: { shade: MeshStandardMaterial; light: PointLight }[] = []

  /** (모델 번호, 옷 색) 별 색상표 변형 */
  /** 벽 액자의 텍스처·재질·지오메트리 */
  private frameDisposables: { dispose(): void }[] = []
  private raf = 0
  private last = 0
  private width = 1
  private height = 1
  private userZoom = 1
  private destroyed = false
  private pending: SessionInfo[] | null = null
  /** 마지막 스냅샷의 서버 시각과, 그것을 받은 순간의 단조 시계. 스냅샷 사이(변화 없는 하트비트 구간)에는 단조 시계의 경과분만 더한다 */
  private clock: { now: number; at: number } | null = null
  private live = new Set<string>()
  /** 일하는 세션에 구역을 내주려고 캐릭터를 내보내는 중인 세션. 다 나가면 구역을 비운다 */
  private evicting = new Set<string>()
  /** 마지막 스냅샷. 구역이 비면 이것으로 다시 배정한다(서버는 변화가 없으면 스냅샷을 보내지 않는다) */
  private lastSessions: SessionInfo[] = []
  private showProject = true
  /** 이번 sync 에서 새로 들어온 인원 수 */
  private spawned = 0
  private wheelTarget: HTMLElement | null
  private canvas: HTMLCanvasElement
  /** 캐릭터를 고르면(이름표·몸 클릭) 그 키(`세션ID:main` · `세션ID:에이전트ID`), 빈 곳을 누르면 null */
  onSelect: ((key: string | null) => void) | null = null
  private selected: string | null = null
  private onCanvasClick = (e: MouseEvent) => this.onSelect?.(this.charAt(e.clientX, e.clientY))
  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    this.userZoom = Math.min(2.6, Math.max(0.6, this.userZoom * Math.exp(-e.deltaY * 0.0012)))
    this.fit()
  }

  constructor(canvas: HTMLCanvasElement, layer: HTMLElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true })
    this.renderer.localClippingEnabled = true
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFShadowMap
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.scene.background = new Color('#2a2233')

    this.labelRenderer = new CSS2DRenderer()
    this.labelRenderer.domElement.style.position = 'absolute'
    this.labelRenderer.domElement.style.inset = '0'
    this.labelRenderer.domElement.style.pointerEvents = 'none'
    layer.appendChild(this.labelRenderer.domElement)

    // 사무실 안쪽 시야에 가까운 낮은 아이소메트릭: 방위 45도, 고도 18도
    const az = Math.PI / 4
    const el = (18 * Math.PI) / 180
    const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
    this.camera.position.copy(this.target).addScaledVector(dir, 60)
    this.camera.lookAt(this.target)
    this.camera.updateMatrixWorld(true)

    this.initLights()
    this.wheelTarget = canvas.parentElement
    this.wheelTarget?.addEventListener('wheel', this.onWheel, { passive: false })
    this.canvas = canvas
    canvas.addEventListener('click', this.onCanvasClick)

    const models = [...new Set([...LAYOUT.items.map((i) => i.model), 'books'])]
    loadOfficeAssets(models)
      .then((a) => {
        if (this.destroyed) return
        this.assets = a
        this.build()
        if (this.pending) this.sync(this.pending)
      })
      .catch((e) => console.error('[agent-office] failed to load 3D models', e))
  }

  private initLights() {
    const hemi = new HemisphereLight('#f7fbff', '#a4acb0', 1.35)
    const amb = new AmbientLight('#ffffff', 0.55)
    this.scene.add(hemi, amb)
    const sun = new DirectionalLight('#fffaf3', 2.1)
    this.roomLights = { hemi, amb, sun }
    sun.position.copy(this.target).add(new Vector3(5.5, 11, 3.5))
    sun.target.position.copy(this.target)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const cam = sun.shadow.camera
    cam.left = -W
    cam.right = W
    cam.top = D
    cam.bottom = -D
    cam.near = 1
    cam.far = 40
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.03
    sun.shadow.radius = 4
    this.scene.add(sun, sun.target)
  }

  // ───────────────────────── 장면 구성 ─────────────────────────

  private floorPatch(w: number, d: number, radius: number, color: string, x: number, z: number) {
    const shape = new Shape()
    const left = -w / 2, right = w / 2, bottom = -d / 2, top = d / 2
    shape.moveTo(left + radius, bottom)
    shape.lineTo(right - radius, bottom)
    shape.quadraticCurveTo(right, bottom, right, bottom + radius)
    shape.lineTo(right, top - radius)
    shape.quadraticCurveTo(right, top, right - radius, top)
    shape.lineTo(left + radius, top)
    shape.quadraticCurveTo(left, top, left, top - radius)
    shape.lineTo(left, bottom + radius)
    shape.quadraticCurveTo(left, bottom, left + radius, bottom)
    const mat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.8, toneMapped: false })
    const mesh = new Mesh(new ShapeGeometry(shape), mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x, 0.006, z)
    this.scene.add(mesh)
    return mat
  }

  private build() {
    const a = this.assets!
    // 바닥
    const tex = stoneTexture()
    tex.repeat.set(W / FLOOR_TILE, D / FLOOR_TILE)
    const floor = new Mesh(
      new PlaneGeometry(W, D),
      new MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.set(W / 2, 0, D / 2)
    floor.receiveShadow = true
    this.scene.add(floor)
    const slab = new Mesh(new BoxGeometry(W + 0.03, 0.1, D + 0.03), new MeshStandardMaterial({ color: '#b5bdbf', roughness: 0.9 }))
    slab.position.set(W / 2, -0.055, D / 2)
    this.scene.add(slab)

    // Compact, softly rounded islands distinguish work pods and shared spaces.
    this.floorPatch(4.3, 7.5, 0.45, '#dfccb0', CAFE.baristaX, CAFE.z - 0.5)
    this.floorPatch(3.65, 3.15, 0.45, '#cbd9d2', LAYOUT.rug.x, LAYOUT.rug.z - 0.35)
    for (let z = 0; z < ZONE_COUNT; z++) {
      const o = ZONE_ORIGIN[z]
      const mat = this.floorPatch(ZONE_SIZE.w, ZONE_SIZE.d, 0.34, TEAM_FLOORS[z], o.x + 2.1, o.z + 0.75)
      mat.visible = z !== 3
      this.zoneMats.push(mat)

      const el = document.createElement('div')
      el.className = 'ao-zone'
      el.style.setProperty('--team', TEAM_COLORS[z])
      el.textContent = roleLabel(z, getLocale())
      const obj = new CSS2DObject(el)
      obj.visible = z !== 3
      obj.center.set(0.5, 0.5)
      obj.position.set(o.x + 2.1, 0.05, o.z + 2.22)
      this.scene.add(obj)
      this.zoneLabels.push({ el, obj })
    }

    // Lounge upholstery uses the custom rounded furniture below.
    a.furniture.get('rugRound')?.root.traverse((o) => {
      const m = (o as Mesh).material as MeshStandardMaterial | undefined
      const color = m && RUG_COLORS[m.name]
      if (color) {
        const c = m.clone()
        c.color.copy(color)
        ;(o as Mesh).material = c
      }
    })

    for (const it of LAYOUT.items) this.placeItem(it)
    addRoleFurniture(this.scene)
    this.placeShelfBooks()
    this.placeTrophies()
    this.placeEspresso()
    this.placeBarista()
    this.placeCafeDetails()
    this.placeElevator()
    for (const f of LAYOUT.frames) this.placeFrame(f)
    this.exterior = createSeoulBackdrop(this.renderer)
    const squareWindows = new URLSearchParams(location.search).get('window') === 'square'
    for (const w of LAYOUT.windows) {
      this.placeWindow(squareWindows ? { ...w, w: w.w + WINDOW_RADIUS, x: w.wall === 'N' ? W / 2 : w.x, z: w.wall === 'W' ? D / 2 : w.z, mullions: 5 } : w)
    }
    if (!squareWindows) this.placeCurvedWindow()
    instanceStaticMeshes(this.scene, this.staticFurniture)
    this.staticFurniture = []
    // 건물 외곽으로 화면을 맞춰 소품이나 캐릭터 자세가 화면 배율을 바꾸지 않게 한다.
    this.roomBox = new Box3(
      new Vector3(-0.08, -0.12, -0.08),
      new Vector3(W + 0.08, 1.29 * WALL_SY, D + 0.08),
    )
    this.scene.background = new Color('#e8eceb')
    this.fit()
  }

  /** Slayer Espresso 2-group: low black body, metal X frame and wood brew paddles. */
  private placeEspresso() {
    const { x, y, z } = LAYOUT.espresso
    const body = new MeshStandardMaterial({ color: '#252b2c', metalness: 0.25, roughness: 0.4 })
    const steel = new MeshStandardMaterial({ color: '#c9ced4', metalness: 0.4, roughness: 0.3 })
    const dark = new MeshStandardMaterial({ color: '#2b2b2e', roughness: 0.6 })
    const red = new MeshStandardMaterial({ color: '#c0392b', roughness: 0.5 })
    const wood = new MeshStandardMaterial({ color: '#b58c5e', roughness: 0.65 })
    const cupMat = new MeshStandardMaterial({ color: '#f4efe6', roughness: 0.6 })
    const coffee = new MeshStandardMaterial({ color: '#4a2c1c', roughness: 0.4 })
    const g = new Group()
    const box = (w: number, h: number, d: number, mat: Material, px: number, py: number, pz: number) => {
      const geo = new BoxGeometry(w, h, d)
      this.frameDisposables.push(geo)
      const m = new Mesh(geo, mat)
      m.position.set(px, py + h / 2, pz)
      g.add(m)
      return m
    }
    const cyl = (rt: number, rb: number, h: number, mat: Material, px: number, py: number, pz: number) => {
      const geo = new CylinderGeometry(rt, rb, h, 16)
      this.frameDisposables.push(geo)
      const m = new Mesh(geo, mat)
      m.position.set(px, py + h / 2, pz)
      g.add(m)
      return m
    }
    this.frameDisposables.push(body, steel, dark, red, cupMat, coffee, wood)
    // https://slayerespresso.com/product/espresso-v3/
    box(0.68, 0.19, 0.215, body, 0, 0.135, -0.06)
    box(0.68, 0.018, 0.25, steel, 0, 0.325, -0.045)
    for (const side of [-1, 1]) {
      box(0.025, 0.195, 0.23, body, side * 0.3275, 0.13, -0.055)
      // The side X frames run from the body down to the four rubber feet.
      for (const angle of [-0.72, 0.72]) {
        const frame = box(0.026, 0.30, 0.035, steel, side * 0.339, -0.01, 0)
        frame.rotation.x = angle
      }
      for (const z of [-0.10, 0.10]) {
        const footGeo = new LatheGeometry([
          new Vector2(0.020, 0), new Vector2(0.022, 0.015),
          new Vector2(0.020, 0.037), new Vector2(0.015, 0.050), new Vector2(0, 0.054),
        ], 16)
        const foot = new Mesh(footGeo, steel)
        foot.position.set(side * 0.339, 0, z)
        g.add(foot)
        this.frameDisposables.push(footGeo)
      }
      const hub = cyl(0.025, 0.025, 0.01, steel, side * 0.355, 0.135, 0)
      hub.rotation.z = Math.PI / 2
      box(0.02, 0.035, 0.25, wood, side * 0.33, 0.343, -0.045)
      const knob = cyl(0.025, 0.025, 0.025, wood, side * 0.30, 0.24, 0.07)
      knob.rotation.x = Math.PI / 2
      const wand = box(0.012, 0.13, 0.012, steel, side * 0.30, 0.09, 0.13)
      wand.rotation.z = side * 0.2
    }
    box(0.66, 0.016, 0.018, wood, 0, 0.35, -0.16)
    box(0.65, 0.018, 0.16, steel, 0, 0.05, 0.12)
    for (let i = -9; i <= 9; i++) box(0.004, 0.003, 0.135, dark, i * 0.032, 0.068, 0.12)
    for (let i = 0; i < LAYOUT.espresso.groups; i++) {
      const gx = (i - (LAYOUT.espresso.groups - 1) / 2) * 0.25
      cyl(0.034, 0.030, 0.04, steel, gx, 0.155, 0.115)
      cyl(0.03, 0.028, 0.022, dark, gx, 0.133, 0.115)
      const handle = box(0.025, 0.022, 0.125, wood, gx, 0.137, 0.195)
      handle.rotation.x = 0.12
      cyl(0.018, 0.018, 0.018, steel, gx, 0.255, 0.085)
      const paddle = box(0.11, 0.018, 0.042, wood, gx - 0.018, 0.273, 0.11)
      paddle.rotation.y = i === 0 ? 0.12 : -0.12
      const gauge = new Mesh(new CircleGeometry(0.022, 20), cupMat)
      gauge.position.set(gx, 0.225, 0.052)
      const rim = new Mesh(new RingGeometry(0.022, 0.025, 20), steel)
      rim.position.copy(gauge.position)
      const needle = box(0.002, 0.016, 0.002, dark, gx, 0.219, 0.054)
      needle.rotation.z = -0.55
      g.add(gauge, rim)
      this.frameDisposables.push(gauge.geometry, rim.geometry)
      cyl(0.020, 0.015, 0.034, cupMat, gx, 0.072, 0.12)
      cyl(0.018, 0.018, 0.002, coffee, gx, 0.105, 0.12)
      cyl(0.019, 0.015, 0.029, cupMat, gx, 0.343, -0.06)
    }
    const brandCanvas = document.createElement('canvas')
    brandCanvas.width = 512
    brandCanvas.height = 64
    const context = brandCanvas.getContext('2d')!
    context.font = 'bold 42px Arial, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = '#e7eceb'
    context.fillText('S L A Y E R', 256, 34)
    const brandTexture = new CanvasTexture(brandCanvas)
    brandTexture.colorSpace = SRGBColorSpace
    const brandMaterial = new MeshBasicMaterial({ map: brandTexture, transparent: true, depthWrite: false, toneMapped: false })
    for (const side of [-1, 1]) {
      const brand = new Mesh(new PlaneGeometry(0.34, 0.043), brandMaterial)
      brand.position.set(0, side > 0 ? 0.314 : 0.22, side > 0 ? 0.085 : -0.169)
      if (side < 0) brand.rotation.y = Math.PI
      g.add(brand)
      this.frameDisposables.push(brand.geometry)
    }
    this.frameDisposables.push(brandTexture, brandMaterial)
    g.rotation.y = LAYOUT.espresso.rot
    g.position.set(x, y, z)
    g.traverse((o) => ((o as Mesh).castShadow = true))
    this.scene.add(g)
  }

  private placeElevator() {
    const collarMaterial = new MeshStandardMaterial({ color: '#c7d0d2', metalness: 0.45, roughness: 0.38 })
    const collar = new Mesh(new RingGeometry(0.71, 0.86, 64), collarMaterial)
    collar.rotation.x = -Math.PI / 2
    collar.position.set(ELEVATOR.x, 0.012, ELEVATOR.z)
    collar.receiveShadow = true
    this.scene.add(collar)
    const silver = new MeshStandardMaterial({ color: '#c7d6db', metalness: 0.45, roughness: 0.32, clippingPlanes: [FLOOR_CLIP], clipShadows: true })
    const glass = new MeshStandardMaterial({ color: '#c7e7ec', transparent: true, opacity: 0.15, roughness: 0.08, metalness: 0.05, side: DoubleSide, depthWrite: false, clippingPlanes: [FLOOR_CLIP] })
    const pod = new Group()
    const shell = new Mesh(new CylinderGeometry(0.68, 0.68, 1.28, 64, 1, true, Math.PI / 2 + 0.47, Math.PI * 2 - 0.94), glass)
    shell.position.y = 0.71
    const platform = new Mesh(new CylinderGeometry(0.70, 0.70, 0.065, 64), silver)
    platform.position.y = 0.033
    pod.add(shell, platform)
    for (const y of [0.07, 1.35]) {
      const ring = new Mesh(new TorusGeometry(0.68, 0.016, 6, 64), silver)
      ring.rotation.x = Math.PI / 2
      ring.position.y = y
      pod.add(ring)
    }
    for (const angle of [Math.PI / 2 + 0.49, Math.PI, Math.PI * 1.5, Math.PI * 2]) {
      const post = new Mesh(new CylinderGeometry(0.008, 0.008, 1.28, 6), silver)
      post.position.set(Math.sin(angle) * 0.68, 0.71, Math.cos(angle) * 0.68)
      pod.add(post)
    }
    const signal = new MeshStandardMaterial({ color: '#a6c8c1', emissive: '#7fc6b8', emissiveIntensity: 0.4 })
    const light = new Mesh(new RingGeometry(0.75, 0.78, 64), signal)
    light.rotation.x = -Math.PI / 2
    light.position.set(ELEVATOR.x, 0.015, ELEVATOR.z)
    this.scene.add(light, pod)
    this.elevator = { motion: new FloorElevator(), pod, signal }
    this.updateElevator(0)
  }

  private updateElevator(dt: number) {
    const lift = this.elevator
    if (!lift) return
    let requested = false
    let passengers = false
    let arrivalsInside = false
    for (const ch of this.chars.values()) {
      if (ch.removed) continue
      if (ch.ridingDown) { passengers = true; continue }
      if (ch.entering && !ch.leaving && ch.delay <= 0.5) {
        requested = true
        if (ch.delay <= 0 && ch.holder.visible && Math.hypot(ch.x - DOOR.x, ch.z - DOOR.z) < 1) arrivalsInside = true
      }
      if (ch.leaving && Math.hypot(ch.x - DOOR.x, ch.z - DOOR.z) < 1.8) requested = true
    }
    lift.motion.update(dt, requested, passengers && !arrivalsInside)
    lift.pod.position.set(ELEVATOR.x, lift.motion.height, ELEVATOR.z)
    lift.signal.emissiveIntensity = lift.motion.state === 'hidden' ? 0.1 : 0.7
    for (const ch of this.chars.values()) {
      if (ch.ridingDown && lift.motion.state === 'hidden') ch.removed = true
    }
  }

  private waitingForElevator(ch: Char) {
    if (ch.ridingDown) return true
    if (!this.elevator || this.elevator.motion.ready) return false
    return ch.entering || (ch.goal === 'door' && ch.x <= ELEVATOR.frontX + 0.35 && ch.x > ELEVATOR.frontX && Math.abs(ch.z - ELEVATOR.z) < 0.6)
  }

  /** Café staff remain in place independently of incoming agent sessions. */
  private placeBarista() {
    const spritePerson = CHARACTER_RENDER_STYLE === 'sprite' ? createBaristaSprite() : null
    const barista3d = spritePerson ? null : createHumanCharacter(charOf('female-d'), '#596f60', { outfit: 'shirt' })
    const model = barista3d?.root ?? new Group()
    model.position.set(LAYOUT.barista.x, 0, LAYOUT.barista.z)
    model.rotation.y = LAYOUT.barista.yaw
    let mixer: AnimationMixer
    if (spritePerson) {
      model.add(spritePerson.sprite)
      spritePerson.update(0, 'idle', 0, null, 0)
      mixer = new AnimationMixer(model)
    } else {
      model.scale.setScalar(CHAR_SCALE)
      model.traverse((o) => {
        const mesh = o as Mesh
        if (!mesh.isMesh) return
        mesh.castShadow = true
        mesh.frustumCulled = false
      })
      const apron = new Mesh(new BoxGeometry(0.23, 0.27, 0.035), new MeshStandardMaterial({ color: '#424e43', roughness: 0.95 }))
      apron.position.set(0, 0.32, 0.12)
      model.add(apron)
      mixer = new AnimationMixer(model)
      mixer.clipAction(barista3d!.clips.coffee).play()
    }
    this.scene.add(model)
    this.barista = { mixer, spritePerson, elapsed: 0 }
  }

  private placeCafeDetails() {
    const dark = new MeshStandardMaterial({ color: '#30383c', roughness: 0.55 })
    // Parallel stainless counters with a single-person staff aisle.
    const bodyMat = new MeshStandardMaterial({ color: '#d0d9de', metalness: 0.35, roughness: 0.38 })
    const topMat = new MeshStandardMaterial({ color: '#e7edef', metalness: 0.42, roughness: 0.28 })
    const topY = LAYOUT.espresso.y
    const counter = (x: number, z: number, width: number, depth: number) => {
      const body = new Mesh(new BoxGeometry(width, topY - 0.035, depth), bodyMat)
      body.position.set(x, (topY - 0.035) / 2, z)
      const top = new Mesh(new BoxGeometry(width, 0.035, depth), topMat)
      top.position.set(x, topY - 0.0175, z)
      body.castShadow = top.castShadow = true
      body.receiveShadow = top.receiveShadow = true
      this.scene.add(body, top)
    }
    const wingDepth = CAFE.frontZ - CAFE.startZ
    counter(CAFE.cupX, CAFE.startZ + wingDepth / 2, CAFE.counterDepth, wingDepth)
    // Split the machine counter around a real opening instead of laying a basin on top.
    const sinkX = CAFE.counterX
    const sinkZ = CAFE.frontZ - 0.414
    const sinkW = 0.68
    const sinkD = 0.32
    const openingW = sinkD
    const openingD = sinkW
    const sinkAssembly = new Group()
    const sinkLeft = sinkX - openingW / 2
    const sinkRight = sinkX + openingW / 2
    const barLeft = CAFE.counterX - CAFE.counterDepth / 2
    const barRight = CAFE.counterX + CAFE.counterDepth / 2
    counter((barLeft + sinkLeft) / 2, CAFE.startZ + wingDepth / 2, sinkLeft - barLeft, wingDepth)
    counter((sinkRight + barRight) / 2, CAFE.startZ + wingDepth / 2, barRight - sinkRight, wingDepth)
    const beforeSink = sinkZ - openingD / 2 - CAFE.startZ
    const afterSink = CAFE.frontZ - sinkZ - openingD / 2
    counter(sinkX, CAFE.startZ + beforeSink / 2, openingW, beforeSink)
    counter(sinkX, CAFE.frontZ - afterSink / 2, openingW, afterSink)
    const cabinet = new Mesh(new BoxGeometry(sinkW, topY - 0.13, sinkD), bodyMat)
    cabinet.position.set(sinkX, (topY - 0.13) / 2, sinkZ)
    const basinMat = new MeshStandardMaterial({ color: '#87969f', metalness: 0.5, roughness: 0.28 })
    const basin = new Mesh(new BoxGeometry(sinkW, 0.012, sinkD), basinMat)
    basin.position.set(sinkX, topY - 0.12, sinkZ)
    sinkAssembly.add(cabinet, basin)
    for (const side of [-1, 1]) {
      const wall = new Mesh(new BoxGeometry(0.008, 0.12, sinkD), basinMat)
      wall.position.set(sinkX + side * (sinkW / 2 - 0.004), topY - 0.06, sinkZ)
      const end = new Mesh(new BoxGeometry(sinkW, 0.12, 0.008), basinMat)
      end.position.set(sinkX, topY - 0.06, sinkZ + side * (sinkD / 2 - 0.004))
      sinkAssembly.add(wall, end)
    }
    const drain = new Mesh(new CylinderGeometry(0.028, 0.028, 0.003, 20), dark)
    drain.position.set(sinkX, topY - 0.112, sinkZ)
    const tapStem = new Mesh(new CylinderGeometry(0.014, 0.014, 0.14, 12), topMat)
    tapStem.position.set(sinkX, topY + 0.07, sinkZ - 0.20)
    const tapArch = new Mesh(new TorusGeometry(0.085, 0.014, 8, 24, Math.PI), topMat)
    tapArch.rotation.y = Math.PI / 2
    tapArch.position.set(sinkX, topY + 0.14, sinkZ - 0.115)
    const spout = new Mesh(new CylinderGeometry(0.014, 0.014, 0.045, 12), topMat)
    spout.position.set(sinkX, topY + 0.1175, sinkZ - 0.03)
    sinkAssembly.add(drain, tapStem, tapArch, spout)
    for (const part of sinkAssembly.children) {
      part.position.x -= sinkX
      part.position.z -= sinkZ
    }
    sinkAssembly.position.set(sinkX, 0, sinkZ)
    sinkAssembly.rotation.y = Math.PI / 2
    this.scene.add(sinkAssembly)
    // E65S-inspired espresso grinders, facing the barista like the machine.
    // https://www.mahlkoenig.com/products/e65s
    const hopperGlass = new MeshStandardMaterial({ color: '#c8dde1', transparent: true, opacity: 0.4, roughness: 0.15, depthWrite: false })
    const beans = new MeshStandardMaterial({ color: '#59402e', roughness: 0.9 })
    const screen = new MeshStandardMaterial({ color: '#82c6dd', emissive: '#5aafce', emissiveIntensity: 0.3, roughness: 0.3 })
    for (const dz of [0.85, 1.30]) {
      const grinder = new Group()
      const base = new Mesh(new BoxGeometry(0.17, 0.025, 0.20), dark)
      base.position.set(0, 0.013, 0.025)
      const body = new Mesh(new CylinderGeometry(0.069, 0.077, 0.235, 16), dark)
      body.position.y = 0.14
      const collar = new Mesh(new CylinderGeometry(0.074, 0.074, 0.02, 20), topMat)
      collar.position.y = 0.263
      const hopper = new Mesh(new CylinderGeometry(0.082, 0.043, 0.16, 24), hopperGlass)
      hopper.position.y = 0.355
      const fill = new Mesh(new CylinderGeometry(0.068, 0.038, 0.10, 20), beans)
      fill.position.y = 0.333
      const lid = new Mesh(new CylinderGeometry(0.085, 0.085, 0.012, 24), dark)
      lid.position.y = 0.441
      const displayFrame = new Mesh(new BoxGeometry(0.10, 0.07, 0.023), dark)
      displayFrame.position.set(0, 0.207, 0.069)
      const display = new Mesh(new PlaneGeometry(0.073, 0.041), screen)
      display.position.set(0, 0.21, 0.082)
      const chute = new Mesh(new BoxGeometry(0.035, 0.035, 0.052), topMat)
      chute.position.set(0, 0.144, 0.085)
      grinder.add(base, body, collar, hopper, fill, lid, displayFrame, display, chute)
      for (const side of [-1, 1]) {
        const fork = new Mesh(new BoxGeometry(0.012, 0.012, 0.07), topMat)
        fork.position.set(side * 0.027, 0.087, 0.084)
        grinder.add(fork)
      }
      this.addGrinderSideLogo(grinder, 0.078, 0.15, 0.065)
      grinder.rotation.y = Math.PI / 2
      grinder.position.set(CAFE.counterX, LAYOUT.espresso.y, CAFE.z + dz + 0.25)
      grinder.traverse((o) => { if ((o as Mesh).isMesh) (o as Mesh).castShadow = true })
      this.scene.add(grinder)
    }
    this.placeBrewingZone()

  }

  /** EK43-inspired tall grinder and three pour-over dripper/server sets. */
  private placeBrewingZone() {
    // https://www.mahlkoenig.com/en-de/products/ek43
    const black = new MeshStandardMaterial({ color: '#292f30', roughness: 0.6 })
    const metal = new MeshStandardMaterial({ color: '#b9c5c9', metalness: 0.5, roughness: 0.35 })
    const ceramic = new MeshStandardMaterial({ color: '#f5f2e9', roughness: 0.6, side: DoubleSide })
    const glass = new MeshStandardMaterial({ color: '#c9e6e8', transparent: true, opacity: 0.42, roughness: 0.1, side: DoubleSide, depthWrite: false })
    const beans = new MeshStandardMaterial({ color: '#62432f', roughness: 0.9 })
    const grinder = new Group()
    const base = new Mesh(new BoxGeometry(0.23, 0.025, 0.26), black)
    base.position.y = 0.013
    const stand = new Mesh(new BoxGeometry(0.115, 0.23, 0.14), black)
    stand.position.set(0, 0.14, -0.03)
    const motor = new Mesh(new CylinderGeometry(0.105, 0.105, 0.23, 24), black)
    motor.rotation.x = Math.PI / 2
    motor.position.y = 0.28
    const scale = new Mesh(new CircleGeometry(0.084, 24), ceramic)
    scale.position.set(0, 0.28, 0.117)
    const dial = new Mesh(new CylinderGeometry(0.046, 0.046, 0.085, 24), black)
    dial.rotation.x = Math.PI / 2
    // The adjustment knob projects beyond the white scale; its side profile stays visible.
    dial.position.set(0, 0.28, 0.16)
    const dialFace = new Mesh(new CylinderGeometry(0.038, 0.038, 0.009, 24), black)
    dialFace.rotation.x = Math.PI / 2
    dialFace.position.set(0, 0.28, 0.207)
    const pointer = new Mesh(new BoxGeometry(0.005, 0.018, 0.003), ceramic)
    pointer.position.set(0, 0.304, 0.213)
    grinder.add(base, stand, motor, scale, dial, dialFace, pointer)
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6
      const tick = new Mesh(new BoxGeometry(0.003, 0.009, 0.002), black)
      tick.position.set(Math.sin(angle) * 0.066, 0.28 + Math.cos(angle) * 0.066, 0.119)
      tick.rotation.z = -angle
      grinder.add(tick)
    }
    const hopper = new Mesh(new CylinderGeometry(0.069, 0.042, 0.16, 24), glass)
    hopper.position.y = 0.445
    const fill = new Mesh(new CylinderGeometry(0.058, 0.038, 0.105, 20), beans)
    fill.position.y = 0.422
    const lid = new Mesh(new CylinderGeometry(0.074, 0.074, 0.014, 24), black)
    lid.position.y = 0.532
    const chute = new Mesh(new BoxGeometry(0.031, 0.065, 0.04), metal)
    chute.position.set(0, 0.16, 0.115)
    const dosingCup = new Mesh(new CylinderGeometry(0.033, 0.026, 0.06, 16), metal)
    dosingCup.position.set(0, 0.052, 0.115)
    grinder.add(hopper, fill, lid, chute, dosingCup)
    this.addGrinderSideLogo(grinder, 0.108, 0.28, 0.08)
    grinder.rotation.y = -Math.PI / 2
    grinder.position.set(CAFE.cupX, LAYOUT.espresso.y, CAFE.startZ + 0.25)
    grinder.traverse((o) => { if ((o as Mesh).isMesh) (o as Mesh).castShadow = true })
    this.scene.add(grinder)
    // Acaia-inspired scales sit flush in the stainless counter, one beneath each server.
    const scaleFace = new MeshStandardMaterial({ color: '#fafbfa', roughness: 0.32 })
    const displayCanvas = document.createElement('canvas')
    displayCanvas.width = 512
    displayCanvas.height = 96
    const displayCtx = displayCanvas.getContext('2d')!
    displayCtx.fillStyle = '#fafbfa'
    displayCtx.fillRect(0, 0, 512, 96)
    displayCtx.fillStyle = '#7d8b91'
    displayCtx.textAlign = 'center'
    displayCtx.textBaseline = 'middle'
    displayCtx.font = '44px monospace'
    displayCtx.fillText('00:24   250.0', 256, 42)
    displayCtx.fillStyle = '#a2aaad'
    displayCtx.font = '18px sans-serif'
    displayCtx.fillText('acaia', 256, 80)
    const displayTexture = new CanvasTexture(displayCanvas)
    displayTexture.colorSpace = SRGBColorSpace
    const displayMaterial = new MeshBasicMaterial({ map: displayTexture, toneMapped: false })
    for (const z of [CAFE.z + 0.16, CAFE.z + 0.65, CAFE.z + 1.14]) {
      const scale = new Group()
      // The casing is embedded below the worktop; only a thin steel seam and white face show.
      const bezel = new Mesh(new BoxGeometry(0.28, 0.018, 0.31), metal)
      bezel.position.y = -0.007
      const face = new Mesh(new BoxGeometry(0.265, 0.016, 0.295), scaleFace)
      face.position.y = -0.005
      const display = new Mesh(new PlaneGeometry(0.225, 0.042), displayMaterial)
      display.rotation.x = -Math.PI / 2
      display.position.set(0, 0.0035, 0.113)
      scale.add(bezel, face, display)
      scale.rotation.y = -Math.PI / 2
      scale.position.set(CAFE.cupX - 0.08, LAYOUT.espresso.y, z)
      this.scene.add(scale)
      const set = new Group()
      const profile = [[0.045,0.008],[0.067,0.02],[0.077,0.065],[0.065,0.105],[0.041,0.137]].map(([r,y]) => new Vector2(r,y))
      const server = new Mesh(new LatheGeometry(profile, 32), glass)
      const coffee = new Mesh(new CylinderGeometry(0.061, 0.055, 0.04, 24), beans)
      coffee.position.y = 0.041
      const rim = new Mesh(new TorusGeometry(0.041, 0.004, 6, 24), glass)
      rim.rotation.x = Math.PI / 2
      rim.position.y = 0.137
      const handlePath = new CatmullRomCurve3([
        new Vector3(0.057, 0.115, 0), new Vector3(0.090, 0.112, 0),
        new Vector3(0.112, 0.091, 0), new Vector3(0.111, 0.061, 0),
        new Vector3(0.091, 0.043, 0), new Vector3(0.068, 0.049, 0),
      ])
      const handle = new Mesh(new TubeGeometry(handlePath, 24, 0.007, 8, false), glass)
      handle.scale.x = -1 // Face the barista standing in the aisle.
      const dripper = new Mesh(new CylinderGeometry(0.067, 0.022, 0.08, 24, 1, true), ceramic)
      dripper.position.y = 0.19
      const plate = new Mesh(new CylinderGeometry(0.054, 0.054, 0.008, 24), ceramic)
      plate.position.y = 0.147
      const filter = new Mesh(new CylinderGeometry(0.058, 0.019, 0.07, 24, 1, true), new MeshStandardMaterial({ color: '#fffdf4', roughness: 1, side: DoubleSide }))
      filter.position.y = 0.197
      set.add(server, coffee, rim, handle, dripper, plate, filter)
      set.position.set(CAFE.cupX - 0.055, LAYOUT.espresso.y + 0.003, z)
      set.traverse((o) => { if ((o as Mesh).isMesh) (o as Mesh).castShadow = true })
      this.scene.add(set)
    }
    // Fellow Stagg EKG-inspired kettle in the free space at the end of the brewing bar.
    // https://fellowproducts.com/products/stagg-ekg-electric-pour-over-kettle
    const kettle = new Group()
    const matte = new MeshStandardMaterial({ color: '#252b2d', roughness: 0.75 })
    const wood = new MeshStandardMaterial({ color: '#ad835c', roughness: 0.7 })
    const kettleBase = new Mesh(new RoundedBoxGeometry(0.26, 0.026, 0.25, 2, 0.009), matte)
    kettleBase.position.y = 0.013
    const kettleBody = new Mesh(new CylinderGeometry(0.063, 0.091, 0.135, 32), matte)
    kettleBody.position.set(0, 0.094, -0.015)
    const kettleLid = new Mesh(new CylinderGeometry(0.064, 0.065, 0.012, 32), matte)
    kettleLid.position.set(0, 0.168, -0.015)
    const knob = new Mesh(new CylinderGeometry(0.018, 0.022, 0.024, 16), wood)
    knob.position.set(0, 0.185, -0.015)
    const tube = (points: number[][], radius: number, material: Material) => new Mesh(
      new TubeGeometry(new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z))), 24, radius, 8, false), material,
    )
    const spout = tube([[-0.075,0.06,-0.015],[-0.12,0.085,-0.015],[-0.155,0.18,-0.015],[-0.20,0.20,-0.015],[-0.225,0.19,-0.015]], 0.009, matte)
    const handle = tube([[0.057,0.147,-0.015],[0.12,0.16,-0.015],[0.145,0.12,-0.015],[0.13,0.055,-0.015],[0.08,0.043,-0.015]], 0.017, wood)
    const kettleDial = new Mesh(new CylinderGeometry(0.022, 0.022, 0.014, 20), matte)
    kettleDial.position.set(0.083, 0.033, 0.086)
    const screen = new Mesh(new PlaneGeometry(0.07, 0.026), new MeshStandardMaterial({ color: '#c0d8de', emissive: '#8aafb8', emissiveIntensity: 0.2 }))
    screen.rotation.x = -Math.PI / 2
    screen.position.set(-0.04, 0.027, 0.088)
    kettle.add(kettleBase, kettleBody, kettleLid, knob, spout, handle, kettleDial, screen)
    kettle.rotation.y = Math.PI
    kettle.traverse((o) => { if ((o as Mesh).isMesh) (o as Mesh).castShadow = true })
    for (const z of [CAFE.z + 1.65, CAFE.z + 2.10, CAFE.z + 2.55]) {
      const station = kettle.clone(true)
      station.position.set(CAFE.cupX, LAYOUT.espresso.y, z)
      this.scene.add(station)
    }
  }

  /** Small red crown-inspired maker marks on both sides of the coffee grinders. */
  private addGrinderSideLogo(grinder: Group, halfWidth: number, y: number, size: number) {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#e9363f'
    ctx.beginPath()
    ctx.moveTo(47, 60)
    ctx.lineTo(88, 94)
    ctx.lineTo(128, 36)
    ctx.lineTo(168, 94)
    ctx.lineTo(209, 60)
    ctx.lineTo(187, 157)
    ctx.lineTo(69, 157)
    ctx.closePath()
    ctx.fill()
    ctx.fillRect(69, 169, 118, 15)
    ctx.textAlign = 'center'
    ctx.font = 'bold 22px Arial, sans-serif'
    ctx.fillText('MAHLKÖNIG', 128, 220)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false })
    for (const side of [-1, 1]) {
      const badge = new Mesh(new PlaneGeometry(size, size), material)
      badge.position.set(side * halfWidth, y, 0)
      badge.rotation.y = side * Math.PI / 2
      grinder.add(badge)
    }
  }

  /**
   * 트로피 진열장 선반의 트로피. Kenney 가구 모음에 트로피가 없어 받침대·기둥·컵·양쪽 손잡이를 도형으로 만든다.
   * 높이 0.13(배율 1)이라 선반 간격(0.24)에 들어간다. 금속감은 환경 맵이 없어 금속도를 낮게 두고 색으로 낸다.
   */
  private placeTrophies() {
    if (!LAYOUT.trophies.length) return
    const base = new BoxGeometry(0.07, 0.02, 0.07)
    base.translate(0, 0.01, 0)
    const stem = new CylinderGeometry(0.008, 0.012, 0.035, 10)
    stem.translate(0, 0.0375, 0)
    const cup = new CylinderGeometry(0.034, 0.014, 0.05, 16)
    cup.translate(0, 0.08, 0)
    const handle = new TorusGeometry(0.016, 0.005, 6, 12, Math.PI)
    const mats = {
      gold: new MeshStandardMaterial({ color: '#e3b33c', metalness: 0.3, roughness: 0.35 }),
      silver: new MeshStandardMaterial({ color: '#cfd5dc', metalness: 0.3, roughness: 0.3 }),
      bronze: new MeshStandardMaterial({ color: '#c47a3c', metalness: 0.3, roughness: 0.4 }),
    }
    this.frameDisposables.push(base, stem, cup, handle, ...Object.values(mats))
    for (const t of LAYOUT.trophies) {
      const mat = mats[t.metal]
      const g = new Group()
      g.add(new Mesh(base, mat), new Mesh(stem, mat), new Mesh(cup, mat))
      // 손잡이: 반원 고리를 컵 양옆에 세운다(왼쪽은 뒤집어 바깥을 향하게)
      for (const side of [-1, 1]) {
        const h = new Mesh(handle, mat)
        h.position.set(side * 0.034, 0.083, 0)
        h.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI / 2
        g.add(h)
      }
      g.position.set(t.x, t.y, t.z)
      g.rotation.y = t.rot
      g.scale.setScalar(t.s)
      g.traverse((o) => ((o as Mesh).castShadow = true))
      this.scene.add(g)
    }
  }

  /**
   * 책장 선반의 책. books 모델은 재질 4개짜리 메시 4개라 그대로 복제하면 책 한 묶음에 드로우콜 4개다.
   * 메시마다 InstancedMesh 하나로 묶어(드로우콜 4개) 묶음별 색(instanceColor)만 달리한다.
   * 이동 막힘(blocked)에 관여하지 않고 그림자도 드리우지 않는다.
   */
  private placeShelfBooks() {
    const m = this.assets!.furniture.get('books')
    const list = LAYOUT.shelfBooks
    if (!m || !list.length) return
    m.root.updateMatrixWorld(true)
    const place = new Matrix4()
    const inst = new Matrix4()
    const tint = new Color()
    m.root.traverse((o) => {
      const src = o as Mesh
      if (!src.isMesh) return
      const mesh = new InstancedMesh(src.geometry, src.material, list.length)
      list.forEach((b, i) => {
        place
          .makeRotationY(b.rot)
          .scale(new Vector3(b.s, b.s, b.s))
          .setPosition(b.x, b.y, b.z)
        inst.multiplyMatrices(place, src.matrixWorld)
        mesh.setMatrixAt(i, inst)
        mesh.setColorAt(i, tint.set(b.tint))
      })
      mesh.castShadow = false
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      this.scene.add(mesh)
    })
  }

  /**
   * 바닥부터 천장까지 이어지는 파노라마 창. 두께 있는 알루미늄 프레임과 안쪽 창턱으로 실내 경계를 만든다.
   * 이동 막힘에는 넣지 않는 벽 장식이다.
   */
  private placeWindow(w: WallWindow) {
    const frameMat = new MeshStandardMaterial({ color: '#6f8087', metalness: 0.35, roughness: 0.48 })
    const glassMat = new MeshStandardMaterial({ color: '#b8dce7', transparent: true, opacity: 0.055, roughness: 0.12, metalness: 0.2, side: DoubleSide, depthWrite: false })
    const bar = 0.032
    const depth = 0.14
    const glassGeo = new PlaneGeometry(w.w - bar * 2, w.h - bar * 2)
    const verticalGeo = new BoxGeometry(bar * 0.72, w.h, depth)
    const horizontalGeo = new BoxGeometry(w.w, bar, depth)
    this.frameDisposables.push(frameMat, glassMat, glassGeo, verticalGeo, horizontalGeo)
    const g = new Group()
    if (this.exterior) {
      const view = new Mesh(glassGeo, this.exterior.material)
      view.position.z = -0.055
      g.add(view)
    }
    const glass = new Mesh(glassGeo, glassMat)
    glass.position.z = 0.003
    g.add(glass)
    for (const x of [-w.w / 2, w.w / 2]) {
      const post = new Mesh(verticalGeo, frameMat)
      post.position.x = x
      g.add(post)
    }
    for (const y of [-w.h / 2, w.h / 2]) {
      const rail = new Mesh(horizontalGeo, frameMat)
      rail.position.y = y
      g.add(rail)
    }
    for (let i = 1; i <= (w.mullions ?? 0); i++) {
      const post = new Mesh(verticalGeo, frameMat)
      post.position.x = -w.w / 2 + (w.w * i) / ((w.mullions ?? 0) + 1)
      g.add(post)
    }
    if (!w.door) {
      const sillGeo = new BoxGeometry(w.w, 0.085, 0.24)
      const sillMat = new MeshStandardMaterial({ color: '#d3d9d9', roughness: 0.65 })
      const sill = new Mesh(sillGeo, sillMat)
      sill.position.set(0, -w.h / 2 + 0.0425, 0.065)
      sill.receiveShadow = true
      g.add(sill)
      this.frameDisposables.push(sillGeo, sillMat)
    }
    if (w.door) {
      const handleGeo = new BoxGeometry(0.012, 0.24, 0.035)
      const handle = new Mesh(handleGeo, frameMat)
      handle.position.set(w.w * 0.35, 0.85 - w.y, 0.025)
      g.add(handle)
      this.frameDisposables.push(handleGeo)
    }
    if (w.wall === 'W') {
      g.rotation.y = Math.PI / 2
      g.position.set(0, w.y, w.z ?? D / 2)
    } else {
      g.position.set(w.x ?? W / 2, w.y, 0)
    }
    this.scene.add(g)
  }

  /** Continuous curved glass removes the upright where the river view joins. */
  private placeCurvedWindow() {
    if (!this.exterior) return
    const height = 1.29 * WALL_SY
    const geometry = curvedWindowGeometry(WINDOW_RADIUS, height)
    const view = new Mesh(geometry, this.exterior.material)
    this.scene.add(view)
    const glassMat = new MeshStandardMaterial({ color: '#b8dce7', transparent: true, opacity: 0.045, roughness: 0.12, metalness: 0.2, side: DoubleSide, depthWrite: false })
    const glass = new Mesh(geometry, glassMat)
    glass.position.set(0.005, 0, 0.005)
    this.scene.add(glass)
    const frameMat = new MeshStandardMaterial({ color: '#6f8087', metalness: 0.35, roughness: 0.48 })
    const sillMat = new MeshStandardMaterial({ color: '#d3d9d9', roughness: 0.65 })
    this.frameDisposables.push(geometry, glassMat, frameMat, sillMat)
    // Match the straight windows' sill and top rail profiles at both tangents.
    const sill = curvedTrimGeometry(WINDOW_RADIUS, 0, 0.085, -0.055, 0.185)
    const top = curvedTrimGeometry(WINDOW_RADIUS, height - 0.016, height + 0.016, -0.07, 0.07)
    const sillMesh = new Mesh(sill, sillMat)
    sillMesh.receiveShadow = true
    this.scene.add(sillMesh, new Mesh(top, frameMat))
    this.frameDisposables.push(sill, top)
  }

  /**
   * 서울 강변의 낮·노을·밤을 현재 시각에 맞춘다(분이 바뀔 때만). 주소에 `?hour=18.5` 처럼 시각을 주면 그 시각으로 고정한다(확인용)
   */
  private updateExterior() {
    const now = new Date()
    const minute = now.getHours() * 60 + now.getMinutes()
    if (minute === this.exteriorMinute) return
    this.exteriorMinute = minute
    const fixed = Number(new URLSearchParams(location.search).get('hour'))
    const hour = location.search.includes('hour=') && Number.isFinite(fixed) ? fixed : minute / 60
    this.exterior?.update(hour)
    this.updateDayNight(hour)
  }

  /** 밤 정도에 따라 방 조명을 줄이고 램프를 켠다. 한밤에도 사무실이 잘 보이게 방 조명은 절반 남짓까지만 줄인다 */
  private updateDayNight(hour: number) {
    const night = nightness(hour)
    const r = this.roomLights
    if (r) {
      r.hemi.intensity = 1.35 * (1 - 0.25 * night)
      r.amb.intensity = 0.55 * (1 - 0.15 * night)
      r.sun.intensity = 2.1 * (1 - 0.7 * night)
      const sunset = panoramaWeights(hour)[1]
      r.sun.color.set('#fff6e8').lerp(new Color('#ffc18c'), sunset)
    }
    for (const l of this.lamps) {
      l.shade.emissiveIntensity = 1.4 * night
      l.light.intensity = LAMP_POWER * night
      // Exclude switched-off lamps from the daytime lighting shader.
      l.light.visible = night > 0
    }
  }

  /**
   * 벽 액자. Kenney Furniture Kit 에 액자 모델이 없어 얇은 박스(짙은 남색 틀) + 종이 판 + 글자 판으로 만든다.
   * 글자는 CanvasTexture 로 그려 붙인다. 벽 장식이라 이동 막힘(blocked)·items 에는 넣지 않고,
   * 지오메트리·재질·텍스처는 frameDisposables 에 모아 destroy 에서 정리한다.
   */
  private placeFrame(f: WallFrame) {
    const depth = 0.035
    const border = 0.035
    const matW = 0.02
    const artW = f.w - 2 * (border + matW)
    const artH = f.h - 2 * (border + matW)
    const tex =
      f.art === 'seaside'
        ? seasideTexture(artW / artH)
        : f.art === 'skyline'
        ? skylineTexture(artW / artH)
        : frameTexture(f.text, artW / artH, this.renderer.capabilities.getMaxAnisotropy())
    // 그림 액자는 밝은 원목 틀(바다 그림·머스터드 소파와 어울리게), 글자 액자는 남색 틀
    const woodMat = new MeshStandardMaterial({ color: f.art ? '#c9a06a' : '#1b2a4e', roughness: 0.6 })
    const paperMat = new MeshBasicMaterial({ color: '#fffaf0', toneMapped: false })
    // 조명·톤매핑에 어두워지지 않게 글자 판은 조명을 받지 않는 재질로 항상 또렷하게 보인다
    const artMat = new MeshBasicMaterial({ map: tex, toneMapped: false })
    const woodGeo = new BoxGeometry(f.w, f.h, depth)
    const paperGeo = new PlaneGeometry(f.w - 2 * border, f.h - 2 * border)
    const artGeo = new PlaneGeometry(artW, artH)
    this.frameDisposables.push(tex, woodMat, paperMat, artMat, woodGeo, paperGeo, artGeo)
    const group = new Group()
    group.add(new Mesh(woodGeo, woodMat))
    const paper = new Mesh(paperGeo, paperMat)
    paper.position.z = depth / 2 + 0.001
    const art = new Mesh(artGeo, artMat)
    art.position.z = depth / 2 + 0.002
    group.add(paper, art)
    // 북쪽 벽은 앞면(+z)을 그대로 두고, 서쪽 벽은 방 안쪽(+x)을 보도록 회전한다.
    if (f.wall === 'W') {
      group.rotation.y = Math.PI / 2
      group.position.set(0.005 + depth / 2, f.y, f.z ?? 0)
    } else {
      group.position.set(f.x ?? 0, f.y, f.freestanding ? (f.z ?? 0.68) : 0.005 + depth / 2)
      if (f.freestanding) {
        const standHeight = f.y - f.h / 2
        const standGeo = new BoxGeometry(0.025, standHeight, 0.03)
        const baseGeo = new BoxGeometry(f.w * 0.8, 0.025, 0.28)
        const standMat = new MeshStandardMaterial({ color: '#b5bec4', metalness: 0.6, roughness: 0.3 })
        const leg = new Mesh(standGeo, standMat)
        leg.position.set(0, -f.h / 2 - standHeight / 2, 0)
        const base = new Mesh(baseGeo, standMat)
        base.position.set(0, -f.y + 0.02, 0)
        group.add(leg, base)
        this.frameDisposables.push(standGeo, baseGeo, standMat)
      }
    }
    this.scene.add(group)
  }

  /** Rounded oak workstation; keep the seating footprint and 0.38 top height. */
  private modernDesk() {
    const group = new Group()
    const oak = new MeshStandardMaterial({ color: '#c6a478', roughness: 0.72 })
    const ivory = new MeshStandardMaterial({ color: '#f3f3ef', roughness: 0.7 })
    const metal = new MeshStandardMaterial({ color: '#465254', metalness: 0.35, roughness: 0.5 })
    const felt = new MeshStandardMaterial({ color: '#708681', roughness: 1 })
    const recess = new MeshStandardMaterial({ color: '#89918b', roughness: 0.9 })
    const boxGeometry = new BoxGeometry(1, 1, 1)
    const box = (w: number, h: number, d: number, mat: Material, x: number, y: number, z: number) => {
      const mesh = new Mesh(boxGeometry, mat)
      mesh.scale.set(w, h, d)
      mesh.position.set(x, y, z)
      group.add(mesh)
    }
    const rounded = (w: number, h: number, d: number, radius: number, mat: Material, x: number, y: number, z: number) => {
      const mesh = new Mesh(new RoundedBoxGeometry(w, h, d, 2, radius), mat)
      mesh.position.set(x, y, z)
      group.add(mesh)
    }
    rounded(0.73, 0.035, 0.56, 0.012, oak, 0, 0.3625, 0)
    box(0.68, 0.014, 0.51, ivory, 0, 0.338, 0)
    // Full white slab supports, with clear knee space between them.
    for (const x of [-0.29, 0.29]) box(0.045, 0.335, 0.49, ivory, x, 0.1675, 0)
    rounded(0.39, 0.002, 0.21, 0.0008, felt, 0.035, 0.381, 0.105)
    // Flush cable outlet behind the monitors, with a dark inset.
    box(0.09, 0.002, 0.027, metal, 0, 0.381, -0.23)
    box(0.069, 0.001, 0.009, recess, 0, 0.3825, -0.23)
    return group
  }

  /** Slim silver keyboard, with the rear edge higher than the edge facing the user. */
  private modernKeyboard() {
    const root = new Group()
    const board = new Group()
    board.rotation.x = -0.045
    board.position.y = 0.004
    const silver = new MeshStandardMaterial({ color: '#cbd1d2', metalness: 0.55, roughness: 0.42 })
    const keys = new MeshStandardMaterial({ color: '#f6f6f2', roughness: 0.68 })
    const base = new Mesh(new RoundedBoxGeometry(0.30, 0.008, 0.12, 2, 0.003), silver)
    base.position.y = 0.004
    board.add(base)
    const keyGeometry = new RoundedBoxGeometry(0.016, 0.003, 0.014, 2, 0.001)
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 13; col++) {
        if (row === 0 && col >= 4 && col <= 8) continue
        const key = new Mesh(keyGeometry, keys)
        key.position.set((col - 6) * 0.021, 0.0095, -0.040 + row * 0.025)
        board.add(key)
      }
    }
    const space = new Mesh(new RoundedBoxGeometry(0.096, 0.003, 0.014, 2, 0.001), keys)
    space.position.set(0, 0.0095, -0.040)
    board.add(space)
    root.add(board)
    return root
  }

  private cafeRoundTable() {
    const group = new Group()
    const oak = new MeshStandardMaterial({ color: '#d8bc91', roughness: 0.65 })
    const metal = new MeshStandardMaterial({ color: '#aeb8bc', metalness: 0.5, roughness: 0.4 })
    const top = new Mesh(new CylinderGeometry(0.35, 0.35, 0.04, 40), oak)
    top.position.y = 0.53
    const leg = new Mesh(new CylinderGeometry(0.035, 0.045, 0.49, 16), metal)
    leg.position.y = 0.265
    const foot = new Mesh(new CylinderGeometry(0.19, 0.21, 0.025, 32), metal)
    foot.position.y = 0.0125
    group.add(top, leg, foot)
    return group
  }

  private studioDisplay() {
    const group = new Group()
    const aluminum = new MeshStandardMaterial({ name: 'metalDark', color: MONITOR_BODY, metalness: 0.65, roughness: 0.28 })
    const bezel = new MeshStandardMaterial({ color: '#23282c', roughness: 0.4 })
    const idle = new MeshStandardMaterial({ name: 'metal', color: SCREEN_IDLE_COLOR })
    const box = (w: number, h: number, d: number, mat: Material, x: number, y: number, z: number) => {
      const mesh = new Mesh(new BoxGeometry(w, h, d), mat)
      mesh.position.set(x, y, z)
      group.add(mesh)
    }
    // A uniform black bezel replaces the all-in-one's deep silver chin.
    box(0.399, 0.251, 0.022, aluminum, 0, 0.2107, 0)
    box(0.393, 0.245, 0.004, bezel, 0, 0.2107, 0.014)
    // A slim aluminum support slopes gently into a low, rounded rectangular foot.
    const support = new Mesh(new RoundedBoxGeometry(0.052, 0.105, 0.009, 3, 0.004), aluminum)
    support.position.set(0, 0.057, -0.018)
    support.rotation.x = -0.12
    group.add(support)
    const foot = new Mesh(new RoundedBoxGeometry(0.15, 0.006, 0.125, 3, 0.003), aluminum)
    foot.position.set(0, 0.003, 0.004)
    group.add(foot)
    const face = new PlaneGeometry(0.379, 0.2314)
    face.translate(0, 0.2107, 0.018)
    group.add(new Mesh(face, idle))
    const camera = new Mesh(new CylinderGeometry(0.002, 0.002, 0.001, 8), new MeshStandardMaterial({ color: '#3b4751' }))
    camera.rotation.x = Math.PI / 2
    camera.position.set(0, 0.331, 0.017)
    group.add(camera)
    return group
  }

  /** Low rounded upholstery, preserving the layout's 0.23 seat top and 0.41 depth. */
  private loungeFurniture(single: boolean) {
    const group = new Group()
    const width = single ? 0.49 : 0.98
    const fabric = new MeshStandardMaterial({ color: SOFA_COLOR, roughness: SOFA_ROUGHNESS })
    const cushion = new MeshStandardMaterial({ color: '#b5c2b0', roughness: 1 })
    const wood = new MeshStandardMaterial({ color: '#76604d', roughness: 0.85 })
    const round = (w: number, h: number, d: number, radius: number, x: number, y: number, z: number, material = fabric) => {
      const mesh = new Mesh(new RoundedBoxGeometry(w, h, d, 4, radius), material)
      mesh.position.set(x, y, z)
      group.add(mesh)
      return mesh
    }
    round(width - 0.03, 0.12, 0.38, 0.025, 0, 0.12, 0)
    round(width - 0.05, 0.24, 0.10, 0.035, 0, 0.28, -0.155)
    for (const side of [-1, 1]) {
      round(0.075, 0.19, 0.38, 0.035, side * (width / 2 - 0.0375), 0.24, 0)
      for (const end of [-1, 1]) {
        const foot = new Mesh(new CylinderGeometry(0.018, 0.015, 0.065, 10), wood)
        foot.position.set(side * (width / 2 - 0.09), 0.0325, end * 0.13)
        group.add(foot)
      }
    }
    const count = single ? 1 : 2
    const seatWidth = (width - 0.18) / count
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * seatWidth
      round(seatWidth - 0.012, 0.07, 0.30, 0.018, x, 0.195, 0.045, cushion)
      const back = round(seatWidth - 0.014, 0.20, 0.085, 0.028, x, 0.31, -0.105, cushion)
      back.rotation.x = -0.10
    }
    return group
  }

  private placeItem(it: Item) {
    const m = this.assets!.furniture.get(it.model)
    if (!m) return
    const s = it.s ?? 1
    const obj = it.model === 'desk' ? (this.deskTemplate ??= this.modernDesk()).clone(true)
      : it.model === 'loungeSofa' || it.model === 'loungeChair' ? this.loungeFurniture(it.model === 'loungeChair')
      : it.model === 'tableRound' ? this.cafeRoundTable()
      : it.model === 'computerKeyboard' ? (this.keyboardTemplate ??= this.modernKeyboard()).clone(true)
      : it.model === 'computerScreen' ? this.displayTemplate().clone(true)
      : m.root.clone(true)
    obj.scale.set(it.sx ?? s, it.sy ?? s, it.sz ?? s)
    const depth = m.size.z * (it.sz ?? s)
    let x = it.x
    let z = it.z
    // 북쪽 정렬 가구는 유리에서 42cm 띄운 독립형 배치다.
    if (it.wall === 'N') z = 0.42 + depth / 2
    if (it.wall === 'W') x = 0.02 + depth / 2
    obj.position.set(x, it.y ?? 0, z)
    obj.rotation.y = it.rot ?? 0
    const shadow = !NO_SHADOW.has(it.model)
    obj.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = shadow
      mesh.receiveShadow = true
    })
    if (['kitchenCabinet', 'kitchenSink', 'tableCoffee', 'sideTable', 'chairRounded', 'computerMouse', 'pottedPlant'].includes(it.model)) {
      obj.traverse((o) => {
        const mesh = o as Mesh
        if (!mesh.isMesh) return
        const source = mesh.material as MeshStandardMaterial
        if (source.name === 'plant') return
        const mat = source.clone()
        mat.map = null
        if (source.name.startsWith('wood')) {
          mat.color.set(it.model === 'pottedPlant' ? '#c1c8c8' : source.name === 'woodDark' ? '#bea580' : '#d8bc91')
          mat.roughness = 0.7
        } else {
          mat.color.set(source.name === 'metalDark' ? '#929ca2' : '#e2e6e7')
          mat.roughness = 0.4
          mat.metalness = 0.3
        }
        mesh.material = mat
      })
    }
    if (it.screenOf) this.bindScreen(it.screenOf, it.screenKind ?? 'design', obj)
    if (it.model === 'chairDesk' && it.zone !== undefined) this.bindChair(it.zone, obj)
    if (it.model === 'coatRackStanding') this.hangClothes(obj)
    if (it.model === 'rugDoormat') this.dressDoormat(obj)
    if (it.model.startsWith('lamp')) this.wireLamp(obj, m.size.y)
    if (it.model === 'desk' || it.model === 'computerScreen' || it.model === 'computerKeyboard') {
      obj.traverse((o) => {
        if ((o as Mesh).isMesh) this.staticFurniture.push(o as Mesh)
      })
    }
    this.scene.add(obj)
  }

  private displayTemplate() {
    let template = this.displayTemplates.get(false)
    if (!template) {
      template = this.studioDisplay()
      this.displayTemplates.set(false, template)
    }
    return template
  }

  /**
   * 옷걸이에 코트 두 벌과 모자를 건다. 모델 세트에 옷이 없어 도형으로 만든다(옷걸이 모델 좌표, 정규화 뒤 기둥이 원점).
   * 고리는 높이 0.62(끝 0.122)·0.77(끝 0.10)에 ±x·±z 네 방향이다. 벽을 따라가는 ±x 고리에 코트를, 기둥 꼭대기에 모자를 얹는다
   */
  private hangClothes(rack: Object3D) {
    const coat = (side: 1 | -1, hookY: number, hookR: number, color: string, len: number) => {
      const mat = new MeshStandardMaterial({ color, roughness: 0.9 })
      // 몸판: 위가 좁고 아래가 넓은 납작한 원뿔대. 어깨 쪽 위 끝이 고리 끝에 걸린다
      const body = new CylinderGeometry(0.045, 0.07, len, 10)
      body.scale(0.6, 1, 1)
      const collar = new CylinderGeometry(0.02, 0.045, 0.04, 10)
      collar.scale(0.6, 1, 1)
      this.frameDisposables.push(mat, body, collar)
      const g = new Group()
      const b = new Mesh(body, mat)
      b.position.y = -0.03 - len / 2
      const c = new Mesh(collar, mat)
      c.position.y = -0.02
      g.add(b, c)
      g.position.set(side * (hookR + 0.025), hookY, 0)
      g.rotation.z = side * 0.06 // 고리에 걸려 살짝 바깥으로 벌어진다
      g.traverse((o) => ((o as Mesh).castShadow = true))
      rack.add(g)
    }
    coat(-1, 0.62, 0.122, '#b5835a', 0.34) // 카멜 코트
    coat(1, 0.62, 0.122, '#2f3e5c', 0.3) // 남색 재킷
    // 모자: 챙 + 둥근 머리
    const hatMat = new MeshStandardMaterial({ color: '#3b3330', roughness: 0.85 })
    const brim = new CylinderGeometry(0.07, 0.07, 0.008, 18)
    const crown = new CylinderGeometry(0.038, 0.045, 0.05, 14)
    this.frameDisposables.push(hatMat, brim, crown)
    const hat = new Group()
    const hb = new Mesh(brim, hatMat)
    const hc = new Mesh(crown, hatMat)
    hc.position.y = 0.029
    hat.add(hb, hc)
    hat.position.set(0.03, 0.775, 0.02)
    hat.rotation.z = -0.12
    hat.traverse((o) => ((o as Mesh).castShadow = true))
    rack.add(hat)
  }

  /**
   * 문 앞 매트 무늬: 검남색 테두리, 섬유 결이 보이는 짙은 남색 바탕(나무 바닥과 대비)에 작은 주황·크림 반짝임(네 갈래 별)을
   * 엇갈린 격자로 반복한다. 반짝임은 특정 로고를 옮기지 않은 일반 도형이다.
   * 매트 모델(0.429 x 0.237, 높이 0.01)은 단색이라 윗면에 같은 크기의 판을 덧대 그린다(매트 모델 좌표)
   */
  private dressDoormat(mat: Object3D) {
    const w = 0.429
    const d = 0.237
    const cv = document.createElement('canvas')
    cv.width = 512
    cv.height = Math.round((512 * d) / w)
    const g = cv.getContext('2d')!
    const W = cv.width
    const H = cv.height
    g.fillStyle = '#1c2233'
    g.fillRect(0, 0, W, H)
    const m = 22
    g.fillStyle = '#2f3a52'
    g.fillRect(m, m, W - 2 * m, H - 2 * m)
    // 섬유 결: 가는 세로줄을 밝기만 조금씩 달리해 긋는다
    for (let x = m; x < W - m; x += 4) {
      g.fillStyle = (x / 4) % 3 === 0 ? 'rgba(10,14,25,0.25)' : 'rgba(200,215,255,0.06)'
      g.fillRect(x, m, 2, H - 2 * m)
    }
    // 네 갈래 별: 꼭짓점 사이를 안쪽으로 오목하게 이은 반짝임. 큰 별 하나와 양옆 작은 별 둘
    const sparkle = (cx: number, cy: number, r: number, color: string) => {
      const k = r * 0.22
      g.beginPath()
      g.moveTo(cx, cy - r)
      g.quadraticCurveTo(cx + k, cy - k, cx + r, cy)
      g.quadraticCurveTo(cx + k, cy + k, cx, cy + r)
      g.quadraticCurveTo(cx - k, cy + k, cx - r, cy)
      g.quadraticCurveTo(cx - k, cy - k, cx, cy - r)
      g.closePath()
      g.fillStyle = color
      g.fill()
    }
    // 안쪽 칸을 가로 7줄 x 세로 3줄로 나누고, 홀수 줄은 반 칸 밀어 엇갈리게 한다. 두 가지 주황을 번갈아 쓴다
    const cols = 7
    const rows = 3
    const cw = (W - 2 * m) / cols
    const rh = (H - 2 * m) / rows
    for (let r = 0; r < rows; r++) {
      const shift = r % 2 ? cw / 2 : 0
      for (let c = 0; c < cols + (r % 2 ? -1 : 0); c++) {
        const cx = m + shift + (c + 0.5) * cw
        const cy = m + (r + 0.5) * rh
        sparkle(cx, cy, rh * 0.36, (r + c) % 2 ? '#f3d9b0' : '#f08a4b')
      }
    }
    const tex = new CanvasTexture(cv)
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
    const geo = new PlaneGeometry(w, d)
    const material = new MeshStandardMaterial({ map: tex, roughness: 0.95 })
    this.frameDisposables.push(tex, geo, material)
    const top = new Mesh(geo, material)
    top.rotation.x = -Math.PI / 2
    top.position.y = 0.0102
    top.receiveShadow = true
    mat.add(top)
  }

  /**
   * 램프: 갓('lamp' 재질)을 램프마다 복제해 밤에 따뜻하게 빛나게 하고, 갓 높이에 점광원을 둬 주변 벽·바닥에 불빛이 번지게 한다.
   * 낮에는 꺼져 있다(updateDayNight 가 밤 정도로 세기를 정한다). 그림자는 그리지 않는다(가볍게)
   */
  private wireLamp(obj: Object3D, height: number) {
    let shade: MeshStandardMaterial | null = null
    obj.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as MeshStandardMaterial
      if (mat.name !== 'lamp') return
      shade ??= Object.assign(mat.clone(), { emissive: new Color(LAMP_GLOW), emissiveIntensity: 0 })
      mesh.material = shade
    })
    if (!shade) return
    const light = new PointLight(LAMP_GLOW, 0, 3.2, 1.6)
    light.position.y = height * 0.82
    obj.add(light)
    this.lamps.push({ shade, light })
  }

  /** 의자 방석 재질을 구역 전용으로 복제해 팀 색을 입힌다 */
  private bindChair(zone: number, obj: Object3D) {
    obj.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as MeshStandardMaterial
      if (mat.name !== 'carpet') return
      let c = this.chairMats.get(zone)
      if (!c) {
        c = mat.clone()
        this.chairMats.set(zone, c)
      }
      mesh.material = c
    })
  }

  /** 은색 본체와 유휴 화면을 공유하고, 작업 중인 자리에는 디자인·터미널 콘텐츠를 표시한다. */
  private bindScreen(seatId: string, kind: 'design' | 'terminal', obj: Object3D) {
    const aniso = this.renderer.capabilities.getMaxAnisotropy()
    if (!this.screenGeo) {
      const f = SCREEN_FACE
      const geo = new PlaneGeometry(f.x1 - f.x0, Math.hypot(f.yTop - f.yBottom, f.zTop - f.zBottom))
      // 위쪽이 뒤(-z)로 기운 화면 면과 같은 각도로 눕히고 그 가운데로 옮긴다. 면에서 아주 조금 띄워 겹침 깜빡임을 막는다
      geo.rotateX(-Math.atan2(f.zBottom - f.zTop, f.yTop - f.yBottom))
      geo.translate((f.x0 + f.x1) / 2, (f.yBottom + f.yTop) / 2, (f.zBottom + f.zTop) / 2 + 0.0015)
      this.screenGeo = geo
    }
    obj.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as MeshStandardMaterial
      if (mat.name === 'metalDark') {
        if (!this.monitorBody) {
          this.monitorBody = mat.clone()
          this.monitorBody.color.set(MONITOR_BODY)
        }
        mesh.material = this.monitorBody
      } else if (mat.name === 'metal') {
        if (!this.screenIdleMat) {
          this.screenIdleMat = mat.clone()
          this.screenIdleMat.color.set(SCREEN_IDLE_COLOR)
          this.screenIdleMat.emissive = new Color(SCREEN_IDLE_COLOR)
          this.screenIdleMat.emissiveIntensity = SCREEN_IDLE_GLOW
        }
        mesh.material = this.screenIdleMat
        let screen = this.screens.get(seatId)
        if (!screen) this.screens.set(seatId, (screen = { planes: [], term: null, scroll: 0 }))
        let content: MeshBasicMaterial
        if (kind === 'design') {
          this.designBase ??= designTexture(aniso)
          this.designMat ??= new MeshBasicMaterial({ map: this.designBase, toneMapped: false })
          content = this.designMat
        } else {
          if (!this.terminalBase) {
            // 원본은 재질에 직접 붙지 않으므로(자리마다 복제본을 쓴다) destroy 에서 따로 정리한다
            this.terminalBase = terminalTexture(aniso)
            this.frameDisposables.push(this.terminalBase)
          }
          const tex = screen.term ?? this.terminalBase.clone()
          tex.offset.y = 1 - tex.repeat.y // 맨 윗줄부터 보인다
          screen.term = tex
          content = new MeshBasicMaterial({ map: tex, toneMapped: false })
        }
        const plane = new Mesh(this.screenGeo!, content)
        plane.visible = false
        screen.planes.push(plane)
        mesh.add(plane)
      }
    })
  }

  // ───────────────────────── 화면 크기·카메라 ─────────────────────────

  resize(width: number, height: number) {
    this.width = Math.max(1, Math.floor(width))
    this.height = Math.max(1, Math.floor(height))
    this.renderer.setSize(this.width, this.height, false)
    this.labelRenderer.setSize(this.width, this.height)
    this.fit()
  }

  /**
   * 방의 가로 폭을 화면 폭에 딱 맞춰(좌우 여백 없이) 정사영 범위를 잡는다.
   * 화면이 방보다 넓적하면 위쪽 벽 끝·아래쪽 바닥 끝이 조금 잘리고, 좁고 길면 위아래가 남는다.
   */
  private fit() {
    const cam = this.camera
    const right = new Vector3().setFromMatrixColumn(cam.matrixWorld, 0)
    const up = new Vector3().setFromMatrixColumn(cam.matrixWorld, 1)
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    const p = new Vector3()
    const box = this.roomBox
    for (const x of box ? [box.min.x, box.max.x] : [0, W]) {
      for (const y of box ? [box.min.y, box.max.y] : [0, 1.5]) {
        for (const z of box ? [box.min.z, box.max.z] : [-0.3, D]) {
          p.set(x, y, z).sub(this.target)
          const px = p.dot(right)
          const py = p.dot(up)
          minX = Math.min(minX, px)
          maxX = Math.max(maxX, px)
          minY = Math.min(minY, py)
          maxY = Math.max(maxY, py)
        }
      }
    }
    const aspect = this.width / this.height
    const viewH = Math.max((maxX - minX) / aspect, (maxY - minY) * 1.02) / this.userZoom
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    cam.left = cx - (viewH * aspect) / 2
    cam.right = cx + (viewH * aspect) / 2
    cam.top = cy + viewH / 2
    cam.bottom = cy - viewH / 2
    cam.updateProjectionMatrix()
    this.exterior?.syncCamera(cam)
  }

  // ───────────────────────── 실행·정리 ─────────────────────────

  start() {
    if (this.raf || this.destroyed) return
    this.last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.25, (now - this.last) / 1000)
      this.last = now
      if (this.assets) {
        this.update(dt)
        if (this.barista) {
          this.barista.mixer.update(dt)
          this.barista.elapsed += dt
          this.barista.spritePerson?.update(0, 'work', this.barista.elapsed, null, 0)
        }
        this.updateScreens(dt)
        this.updateExterior()
      }
      this.renderer.render(this.scene, this.camera)
      this.labelRenderer.render(this.scene, this.camera)
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  destroy() {
    this.destroyed = true
    this.exterior?.dispose()
    this.stop()
    this.wheelTarget?.removeEventListener('wheel', this.onWheel)
    this.canvas.removeEventListener('click', this.onCanvasClick)
    this.barista?.mixer.stopAllAction()
    this.barista?.spritePerson?.dispose()
    this.barista = null
    for (const ch of this.chars.values()) {
      ch.mixer.stopAllAction()
      ch.spritePerson?.dispose()
    }
    this.chars.clear()
    const disposed = new Set<unknown>()
    const disposeTexture = (t: unknown) => {
      if (t instanceof Texture && !disposed.has(t)) {
        disposed.add(t)
        t.dispose()
      }
    }
    const disposeMaterial = (m: Material) => {
      if (disposed.has(m)) return
      disposed.add(m)
      for (const v of Object.values(m)) disposeTexture(v)
      m.dispose()
    }
    this.scene.traverse((o) => {
      const mesh = o as Mesh
      if (mesh instanceof InstancedMesh) mesh.dispose()
      ;(o as SkinnedMesh).skeleton?.dispose()
      if (mesh.geometry) mesh.geometry.dispose()
      const mat = mesh.material as Material | Material[] | undefined
      if (Array.isArray(mat)) mat.forEach(disposeMaterial)
      else if (mat) disposeMaterial(mat)
    })
    // Template materials can have been replaced by the shared screen materials.
    for (const template of [this.deskTemplate, this.keyboardTemplate, ...this.displayTemplates.values()]) {
      template?.traverse((o) => {
        const mat = (o as Mesh).material
        if (Array.isArray(mat)) mat.forEach(disposeMaterial)
        else if (mat) disposeMaterial(mat)
      })
    }
    this.deskTemplate = null
    this.keyboardTemplate = null
    this.displayTemplates.clear()
    for (const d of this.frameDisposables) d.dispose()
    this.frameDisposables = []
    for (const m of [...this.teamRingMats, ...this.teamDiscMats]) m.dispose()
    this.cupGeo.dispose()
    this.cupMat.dispose()
    this.ringGeo.dispose()
    this.discGeo.dispose()
    // 원본 모델이 가진 지오메트리·재질(씬에 복제본을 넣었으므로 공유분)도 함께 정리한다
    this.assets?.furniture.forEach((f) =>
      f.root.traverse((o) => {
        const mesh = o as Mesh
        mesh.geometry?.dispose()
        const mat = mesh.material as Material | Material[] | undefined
        if (Array.isArray(mat)) mat.forEach(disposeMaterial)
        else if (mat) disposeMaterial(mat)
      }),
    )
    this.scene.clear()
    this.labelRenderer.domElement.remove()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    releaseOfficeAssets()
  }

  // ───────────────────────── 세션 반영 ─────────────────────────

  /** now 는 스냅샷의 서버 시각(ms). 대기 경과 시간은 이 값과 lastAt 의 차이로만 잰다 */
  sync(sessions: SessionInfo[], now?: number, filterChanged = false) {
    if (filterChanged) {
      const visible = new Set(sessions.map(s => s.id))
      for (const ch of [...this.chars.values()]) if (!visible.has(ch.session)) this.disposeChar(ch)
      this.zones = this.zones.map(id => id && visible.has(id) ? id : null)
      for (const id of this.evicting) if (!visible.has(id)) this.evicting.delete(id)
    }
    if (now !== undefined) this.clock = { now, at: performance.now() }
    if (!this.assets) {
      this.pending = sessions
      return
    }
    this.pending = null
    this.spawned = 0
    this.lastSessions = sessions
    const live = new Map<string, SessionInfo>()
    for (const s of sessions) {
      if (s.main.state !== 'ended' || s.agents.some((a) => a.state !== 'ended')) live.set(s.id, s)
    }
    this.live = new Set(live.keys())
    // 끝난 세션은 비켜 세울 필요가 없다(그냥 나간다)
    for (const id of this.evicting) if (!live.has(id)) this.evicting.delete(id)
    const plan = planZones(this.zones, [...live.values()], this.evicting)
    this.zones = plan.zones
    for (const id of plan.evict) this.evicting.add(id)

    // A newly visible main reclaims its reserved shared desk from a generic subagent.
    for (const ch of this.chars.values()) {
      if (ch.isMain || ch.leaving || ch.seat?.zone !== 5) continue
      const owner = this.zones[sharedSlotForSeat(ch.seat.local)]
      if (!owner || live.get(owner)?.main.state === 'ended') continue
      ch.seat = this.seatFor(ch.zone, ch.typeKey, false, ch.title, ch.key)
      ch.spot = ch.seat ? null : LAYOUT.spots[5][ch.zone % LAYOUT.spots[5].length]
      this.route(ch, ch.seat ? 'seat' : 'spot')
    }
    const wanted = new Set<string>()
    for (const s of live.values()) {
      const zone = this.zones.indexOf(s.id)
      if (zone < 0 || this.evicting.has(s.id)) continue
      if (s.main.state !== 'ended') {
        wanted.add(`${s.id}:main`)
        this.upsert(`${s.id}:main`, s.id, zone, 'main', mainTitle(s), s.main, true)
        this.chars.get(`${s.id}:main`)!.spawning = spawningAgent(s)
      }
      for (const a of s.agents) {
        if (a.state === 'ended') continue
        wanted.add(`${s.id}:${a.id}`)
        this.upsert(
          `${s.id}:${a.id}`,
          s.id,
          zone,
          a.agentType,
          a.description || agentLabel(a.agentType),
          a,
          false,
        )
      }
    }
    for (const ch of this.chars.values()) {
      if (!wanted.has(ch.key)) ch.leaving = true
    }
    this.reassignWaitingSeats()
  }

  /** 서버 시각 기준 현재. 서버는 변화가 없으면 스냅샷을 다시 보내지 않으므로 받은 뒤 흐른 시간을 더한다 */
  private serverNow() {
    return this.clock ? this.clock.now + (performance.now() - this.clock.at) : null
  }

  private seatFor(zone: number, type: string, isMain: boolean, title: string, except?: string): Seat | null {
    const taken = new Set(
      [...this.chars.values()].filter(c => !c.removed && c.key !== except && c.seat).map(c => c.seat!.id),
    )
    const home = roleZone(type, title, isMain)
    if (!isMain && home === 5) {
      // Preserve one home seat per visible main even before it has spawned.
      for (const [index, session] of this.zones.entries()) {
        if (session && this.lastSessions.find(s => s.id === session)?.main.state !== 'ended') taken.add(`Z5-${sharedSeatForSlot(index)}`)
      }
    }
    return pickRoleSeat(LAYOUT.seats, taken, home, isMain ? sharedSeatForSlot(zone) : (SEAT_OF_TYPE[type] ?? SEAT_OTHER))
  }

  /** A waiting worker can claim a desk once a previous occupant has left. */
  private reassignWaitingSeats() {
    for (const ch of this.chars.values()) {
      if (ch.removed || ch.leaving || ch.seat || !this.live.has(ch.session)) continue
      const seat = this.seatFor(ch.zone, ch.typeKey, ch.isMain, ch.title, ch.key)
      if (!seat) continue
      ch.seat = seat
      ch.spot = null
      if (ch.goal === 'spot') this.route(ch, 'seat')
    }
  }

  private makeChar(
    zone: number,
    type: string,
    isMain: boolean,
    variant: number,
  ): Pick<
    Char,
    | 'holder'
    | 'ring'
    | 'mixer'
    | 'spritePerson'
    | 'spriteTime'
    | 'clips'
    | 'label'
    | 'tagEl'
    | 'textEl'
    | 'labelEl'
    | 'bubbleEl'
    | 'dotsEl'
    | 'nameTextEl'
  > {
    const modelIdx = charIndexOf(type, isMain, variant)
    const look = AGENT_LOOKS[isMain ? 'main' : type]
    const useSprite = CHARACTER_RENDER_STYLE === 'sprite' && !look?.glasses
    const clothingColor = isMain && zone > 0 ? CLOTHES_COLORS[(zone * 3) % CLOTHES_COLORS.length] : this.clothesColorOf(type, isMain)
    const spritePerson = useSprite ? createSpritePerson(modelIdx >= 6 ? 'female' : 'male', look?.cap ?? false, clothingColor) : null
    const def = useSprite
      ? { root: new Group(), clips: Object.fromEntries((['idle', 'walk', 'sit', 'work', 'read', 'wait', 'coffee'] as const).map(name => [name, new AnimationClip(name, name === 'walk' ? 0.8 : 3.2, [])])) as CharacterModel['clips'] }
      : createHumanCharacter(modelIdx, this.clothesColorOf(type, isMain), { cap: look?.cap, glasses: look?.glasses })
    const model = def.root
    model.scale.setScalar(CHAR_SCALE)
    model.traverse((o) => {
      const mesh = o as Mesh
      if (mesh.isMesh) {
        const m = mesh.material as MeshStandardMaterial
        m.clippingPlanes = [FLOOR_CLIP]
        m.clipShadows = true
        mesh.material = m
        mesh.castShadow = true
        mesh.receiveShadow = false
        mesh.frustumCulled = false
      }
    })
    const holder = new Group()
    holder.add(model)
    if (spritePerson) {
      spritePerson.sprite.material.clippingPlanes = [FLOOR_CLIP]
      holder.add(spritePerson.sprite)
    }
    this.scene.add(holder)

    // 팀 색 발밑 링
    const ring = new Group()
    const r = new Mesh(this.ringGeo, this.teamRingMats[zone])
    const d = new Mesh(this.discGeo, this.teamDiscMats[zone])
    r.rotation.x = d.rotation.x = -Math.PI / 2
    ring.add(d, r)
    ring.position.y = 0.012
    this.scene.add(ring)

    const labelEl = document.createElement('div')
    labelEl.className = 'ao-stack'
    labelEl.style.setProperty('--team', TEAM_COLORS[zone])
    const tagEl = document.createElement('span')
    tagEl.className = 'ao-tag'
    const textEl = document.createElement('span')
    textEl.className = 'ao-text'
    // 세로 묶음(아래에서 위로): 머리 → 말풍선 → 이름표. 말풍선이 없으면 이름표가 머리 위로 내려온다
    // 이름표: 세션 색 점 + agentType(메인은 '메인 Claude')
    const nameEl = document.createElement('div')
    nameEl.className = 'ao-label'
    const dotEl = document.createElement('i')
    dotEl.className = 'ao-dot'
    dotEl.style.background = TEAM_COLORS[zone]
    const agentEl = document.createElement('b')
    agentEl.textContent = agentNameOf(type, isMain)
    nameEl.append(dotEl, agentEl)
    // 말풍선: 도구 칩 + 설명, 또는 응답 대기 점
    const bubbleEl = document.createElement('div')
    bubbleEl.className = 'ao-bubble'
    const bubbleIn = document.createElement('span')
    bubbleIn.className = 'ao-bubble-in'
    const dotsEl = document.createElement('span')
    dotsEl.className = 'ao-dots'
    dotsEl.innerHTML = '<i></i><i></i><i></i>'
    bubbleIn.append(tagEl, dotsEl, textEl) // 대기면 점만, 에이전트를 막 띄웠으면 칩 뒤에 점
    bubbleEl.append(bubbleIn)
    bubbleEl.style.display = 'none'
    labelEl.append(nameEl, bubbleEl)
    const label = new CSS2DObject(labelEl)
    label.center = new Vector2(0.5, 1)
    holder.add(label)

    return {
      holder,
      ring,
      mixer: new AnimationMixer(model),
      spritePerson,
      spriteTime: Math.random(),
      clips: def.clips,
      label,
      tagEl,
      textEl,
      labelEl,
      bubbleEl,
      dotsEl,
      nameTextEl: agentEl,
    }
  }

  private upsert(
    k: string,
    session: string,
    zone: number,
    type: string,
    title: string,
    status: Status,
    isMain: boolean,
  ) {
    let ch = this.chars.get(k)
    if (!ch) {
      const seat = this.seatFor(zone, type, isMain, title)
      const typeKey = isMain ? 'main' : type
      const variant = [...this.chars.values()].filter((c) => c.typeKey === typeKey).length
      const spots = LAYOUT.spots[roleZone(type, title, isMain)]
      ch = {
        key: k,
        session,
        zone,
        typeKey: isMain ? 'main' : type,
        title,
        isMain,
        status,
        act: actOf(status),
        seat,
        spot: seat ? null : spots[Math.floor(Math.random() * spots.length)],
        x: DOOR.x,
        z: DOOR.z,
        yaw: 0,
        targetYaw: 0,
        path: [],
        mode: 'stand',
        goal: 'seat',
        poi: null,
        sitAt: null,
        rest: null,
        tea: null,
        cup: null,
        coffeeFirst: false,
        idleTimer: rand(4, 9),
        standTimer: 0,
        leaving: false,
        entering: true,
        ridingDown: false,
        removed: false,
        delay: this.spawned++ * 0.9,
        playing: null,
        actions: {},
        shownText: '',
        shownTag: '',
        spawning: false,
        ...this.makeChar(zone, type, isMain, variant),
      }
      ch.holder.visible = false
      ch.ring.visible = false
      ch.labelEl.addEventListener('click', () => this.onSelect?.(k))
      ch.labelEl.classList.toggle('is-selected', k === this.selected)
      this.chars.set(k, ch)
      this.route(ch, seat ? 'seat' : 'spot')
      this.play(ch, 'walk')
    }
    // Move once when late metadata resolves an unknown role; tool changes do not move workers.
    if (!isMain && roleZone(ch.typeKey, ch.title) === 5 && roleZone(type, title) !== 5) {
      ch.seat = this.seatFor(zone, type, false, title, k)
      ch.spot = ch.seat ? null : LAYOUT.spots[roleZone(type, title)][0]
      if (!ch.leaving) this.route(ch, ch.seat ? 'seat' : 'spot')
    }
    if (!isMain && type !== ch.typeKey) {
      ch.typeKey = type
      ch.nameTextEl.textContent = agentNameOf(type, false)
    }
    ch.status = status
    ch.act = actOf(status)
    ch.title = title
    if (ch.leaving && ch.goal === 'door') {
      ch.ridingDown = false
      ch.entering = Math.hypot(ch.x - DOOR.x, ch.z - DOOR.z) < 0.73
      if (ch.entering) {
        ch.x = DOOR.x
        ch.z = DOOR.z
      }
      this.route(ch, ch.seat ? 'seat' : 'spot')
    }
    ch.leaving = false
  }

  /** 화면 언어가 바뀌면(i18n setLocale 뒤) 이름표·구역 표식을 새 언어로 다시 쓴다. 말풍선 칩은 매 프레임 따라간다 */
  refreshLocale() {
    for (const ch of this.chars.values()) ch.nameTextEl.textContent = agentNameOf(ch.typeKey, ch.isMain)
    if (this.assets) this.sync(this.lastSessions)
  }

  /** 구역 표식에 프로젝트 이름을 보일지(HUD 스위치) */
  setShowProject(on: boolean) {
    this.showProject = on
    if (this.assets) this.sync(this.lastSessions)
  }

  /**
   * 종류별 옷 색. 메인·AGENT_LOOKS 에 고정한 종류는 그 색이고, 나머지는 처음 나왔을 때 pickClothesColor 로 골라
   * 이 화면이 열려 있는 동안 기억한다(같은 종류는 늘 같은 색, 다른 종류끼리는 겹치지 않게).
   */
  private clothesColorOf(type: string, isMain: boolean) {
    if (isMain) return AGENT_LOOKS.main.color
    const fixed = AGENT_LOOKS[type]?.color
    if (fixed) return fixed
    let c = this.typeColors.get(type)
    if (!c) this.typeColors.set(type, (c = pickClothesColor(type, new Set(this.typeColors.values()))))
    return c
  }

  /** 캐릭터가 있는 구역의 팀 색 */
  teamOf(key: string): string | null {
    const ch = this.chars.get(key)
    return ch ? TEAM_COLORS[ch.zone] : null
  }

  /** 고른 캐릭터의 이름표를 강조한다 */
  select(key: string | null) {
    this.selected = key
    for (const ch of this.chars.values()) ch.labelEl.classList.toggle('is-selected', ch.key === key)
  }

  /** 화면 좌표(client)에서 가장 가까운 캐릭터. 몸 가운데를 화면에 투영해 반경 안에 있는 것만 고른다 */
  private charAt(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect()
    const p = new Vector3()
    let best: string | null = null
    let bestD = 40 // px
    for (const ch of this.chars.values()) {
      if (!ch.holder.visible || ch.removed) continue
      p.set(ch.x, ch.holder.position.y + CHAR_HEIGHT / 2, ch.z).project(this.camera)
      const x = rect.left + ((p.x + 1) / 2) * rect.width
      const y = rect.top + ((1 - p.y) / 2) * rect.height
      const d = Math.hypot(x - clientX, y - clientY)
      if (d < bestD) {
        bestD = d
        best = ch.key
      }
    }
    return best
  }

  // ───────────────────────── 이동 ─────────────────────────

  private dest(ch: Char, goal: Goal): P2 & { yaw?: number; via?: P2 } {
    if (goal === 'door') return { x: DOOR.x, z: DOOR.z }
    if (goal === 'seat' && ch.seat) {
      return {
        x: ch.seat.x,
        z: ch.seat.z,
        yaw: ch.seat.yaw,
        via: { x: ch.seat.cx, z: ch.seat.cz },
      }
    }
    if ((goal === 'poi' || goal === 'coffee') && ch.poi) {
      return { x: ch.poi.x, z: ch.poi.z, yaw: ch.poi.yaw }
    }
    if (goal === 'lounge' && ch.rest) {
      if (ch.rest.kind !== 'sit') {
        return { x: ch.rest.poi.x, z: ch.rest.poi.z, yaw: ch.rest.poi.yaw }
      }
      const t = ch.rest.seat
      return { x: t.x, z: t.z, yaw: t.yaw, via: { x: t.cx, z: t.cz } }
    }
    if (goal === 'tea' && ch.tea) {
      const t = ch.tea
      return { x: t.x, z: t.z, yaw: t.yaw, via: { x: t.cx, z: t.cz } }
    }
    if (ch.spot) return { x: ch.spot.x, z: ch.spot.z, yaw: Math.PI }
    return { x: ch.x, z: ch.z }
  }

  /** 현재 위치에서 목표까지 길을 잡는다. 이미 도착해 있으면 바로 도착 처리 */
  private route(ch: Char, goal: Goal) {
    ch.goal = goal
    if (goal !== 'coffee' && goal !== 'lounge') ch.rest = null
    if (goal !== 'tea') ch.tea = null
    const to = this.dest(ch, goal)
    // 앉아 있던 사람은 먼저 의자(소파) 앞으로 빠져나온 뒤 길을 잡는다
    const out = ch.mode === 'sit' && ch.sitAt ? { x: ch.sitAt.cx, z: ch.sitAt.cz } : null
    const origin = out ?? { x: ch.x, z: ch.z }
    const path = findPath(origin, to.via ?? to, LAYOUT.blocked)
    if (path && (path.length || out || to.via)) {
      if (to.via) {
        // 의자 칸 중심까지 길을 잡고, 마지막에 앉는 자리로 들어간다
        if (path.length) path[path.length - 1] = to.via
        else path.push(to.via)
        path.push({ x: to.x, z: to.z })
      } else if (path.length) path[path.length - 1] = { x: to.x, z: to.z }
      if (out) path.unshift(out)
      ch.path = path
      ch.mode = 'walk'
    } else {
      ch.path = []
      if (!path) {
        // 길이 없으면 곧장 그 자리로(막힌 배치 실수가 화면을 멈추지 않게)
        ch.x = to.x
        ch.z = to.z
      }
      this.arrive(ch)
    }
  }

  private arrive(ch: Char) {
    const to = this.dest(ch, ch.goal)
    if (ch.goal === 'door') {
      ch.ridingDown = true
      ch.entering = false
      ch.mode = 'stand'
    } else if (ch.goal === 'seat') {
      ch.mode = 'sit'
      ch.sitAt = ch.seat ? deskSit(ch.seat) : null
      ch.targetYaw = ch.seat?.yaw ?? SEAT_YAW
      ch.idleTimer = rand(4, 9)
    } else if (ch.goal === 'lounge' && ch.rest?.kind === 'sit') {
      ch.mode = 'sit'
      ch.sitAt = { ...ch.rest.seat, sofa: true }
      ch.targetYaw = ch.rest.seat.yaw
    } else if (ch.goal === 'tea' && ch.tea) {
      // 티테이블 의자에 잠깐 앉았다가(stepSit 이 standTimer 로 잰다) 자리로 돌아간다
      ch.mode = 'sit'
      ch.sitAt = { ...ch.tea, sofa: true }
      ch.targetYaw = ch.tea.yaw
      ch.standTimer = rand(6, 12)
    } else if (ch.goal === 'coffee') {
      ch.mode = 'stand'
      ch.targetYaw = to.yaw ?? ch.yaw
      ch.standTimer = rand(2, 3.5)
    } else if (ch.goal === 'lounge') {
      ch.mode = 'stand'
      ch.targetYaw = to.yaw ?? ch.yaw
      ch.standTimer = 1e9
    } else if (ch.goal === 'poi') {
      ch.mode = 'stand'
      ch.targetYaw = to.yaw ?? ch.yaw
      ch.standTimer = rand(2.5, 5)
    } else {
      ch.mode = 'stand'
      ch.targetYaw = to.yaw ?? ch.yaw
      ch.standTimer = 1e9
    }
  }

  /** 메인이 답변을 마치고 사용자 응답을 오래 기다리는 중인가(AskUserQuestion 대기는 tool 이 있어 제외) */
  private isResting(ch: Char) {
    if (!ch.isMain || MAIN_STAYS_SEATED) return false
    const now = this.serverNow()
    return now !== null && shouldRest(ch.status, now)
  }

  private wantedGoal(ch: Char): Goal {
    if (ch.leaving) return 'door'
    if (!ch.seat) return 'spot'
    if (this.isResting(ch)) return ch.goal === 'coffee' ? 'coffee' : 'lounge'
    if (ch.goal === 'poi' && ch.act === 'idle') return 'poi'
    if (ch.goal === 'tea' && ch.act === 'idle') return 'tea'
    return 'seat'
  }

  /** 서 있는 채 커피를 든 상태: 커피 머신에 잠깐 들렀거나(coffee), 앉을 자리가 없어 커피 자리에서 쉬는 중(lounge + coffee 자리) */
  private isDrinking(ch: Char) {
    if (ch.mode !== 'stand') return false
    return ch.goal === 'coffee' || (ch.goal === 'lounge' && ch.rest?.kind === 'coffee')
  }

  /** 다른 캐릭터가 서 있거나 가는 중인 POI(커피 들름·배회 목적지·휴게 공간에서 서거나 커피 마시는 자리) */
  private occupiedPois(self: Char): (Poi | null)[] {
    const out: (Poi | null)[] = []
    for (const c of this.chars.values()) {
      if (c === self) continue
      if (c.goal === 'poi' || c.goal === 'coffee') out.push(c.poi)
      if (c.rest && c.rest.kind !== 'sit') out.push(c.rest.poi)
    }
    return out
  }

  /** 목적지를 want 로 바꾼다. 쉬러 가는 길이면 자리를 고르고(소파 우선) 커피 머신 들름 여부를 정한다 */
  private go(ch: Char, want: Goal) {
    if (want !== 'lounge' || ch.goal === 'coffee') {
      this.route(ch, want)
      return
    }
    if (!ch.rest) {
      const taken = new Set<string>()
      for (const c of this.chars.values()) if (c !== ch && c.rest) taken.add(c.rest.id)
      ch.rest = pickRestSpot(taken)
      ch.coffeeFirst = Math.random() < 0.5
    }
    // 소파·의자에 앉을 사람이 가는 길에 들르는 커피 머신. 다른 사람이 쉬는 자리로 잡았거나 서 있거나 가는 중인 자리는 피한다.
    // 빈 커피 자리가 없으면 들르지 않고 바로 쉬는 자리로 간다
    const free = freePois(LAYOUT.coffeePois, this.occupiedPois(ch))
    if (ch.coffeeFirst && ch.rest.kind === 'sit' && free.length) {
      ch.coffeeFirst = false
      ch.poi = free[Math.floor(Math.random() * free.length)]
      this.route(ch, 'coffee')
    } else this.route(ch, 'lounge')
  }

  private update(dt: number) {
    this.updateElevator(dt)
    for (const ch of this.chars.values()) {
      if (ch.entering && ch.leaving && !ch.holder.visible) {
        ch.removed = true
        continue
      }
      if (ch.delay > 0) {
        ch.delay -= dt
        continue
      }
      if (ch.entering && this.elevator?.motion.state === 'lowering') {
        ch.holder.visible = ch.ring.visible = false
        continue
      }
      if (ch.entering && !ch.holder.visible && !arrivalCanAppear(DOOR,
        [...this.chars.values()].map(other => ({ x: other.x, z: other.z, entering: other.entering, visible: other.holder.visible, removed: other.removed })))) continue
      if (!ch.holder.visible) {
        ch.holder.visible = true
        ch.ring.visible = true
      }
      if (ch.removed) continue
      if (ch.ridingDown) { this.applyPose(ch, dt); continue }
      if (ch.mode === 'walk') this.stepWalk(ch, dt)
      else if (ch.mode === 'sit') this.stepSit(ch, dt)
      else this.stepStand(ch, dt)
      this.applyPose(ch, dt)
    }
    let seatsFreed = false
    for (const ch of [...this.chars.values()]) {
      if (ch.removed) {
        seatsFreed ||= ch.seat !== null
        this.disposeChar(ch)
      }
    }
    if (seatsFreed) this.reassignWaitingSeats()
    // 세션이 끝났거나 비켜 주는 중이고 캐릭터가 모두 나간 구역은 비운다. 비면 기다리는 세션을 바로 들인다
    let freed = false
    for (let z = 0; z < ZONE_COUNT; z++) {
      const id = this.zones[z]
      if (
        id &&
        (!this.live.has(id) || this.evicting.has(id)) &&
        ![...this.chars.values()].some((c) => c.session === id)
      ) {
        this.zones[z] = null
        this.evicting.delete(id)
        freed = true
      }
      const used = [...this.chars.values()].some(c => !c.removed && (c.seat?.zone ?? roleZone(c.typeKey, c.title, c.isMain)) === z)
      const projects = this.showProject ? [...new Set([...this.chars.values()]
        .filter(c => !c.removed && c.seat?.zone === z)
        .map(c => this.lastSessions.find(s => s.id === c.session)?.project).filter(Boolean))] : []
      const label = [roleLabel(z, getLocale()), ...projects.slice(0, 1), ...(projects.length > 1 ? [`+${projects.length - 1}`] : [])].join(' · ')
      const el = this.zoneLabels[z].el
      if (el.textContent !== label) el.textContent = label
      const title = projects.join(' · ')
      if (el.title !== title) el.title = title
      this.zoneLabels[z].el.style.display = ''
      const mat = this.zoneMats[z]
      mat.color.set(TEAM_FLOORS[z])
      mat.opacity = used ? 0.9 : 0.65
      this.chairMats.get(z)?.color.set('#a6afb4')
    }
    if (freed) this.sync(this.lastSessions)
  }

  private disposeChar(ch: Char) {
    ch.mixer.stopAllAction()
    ch.spritePerson?.dispose()
    this.holdCup(ch, false)
    this.scene.remove(ch.holder, ch.ring)
    ch.labelEl.remove()
    // 사람형 모델의 전용 지오메트리와 재질을 해제한다.
    ch.holder.traverse((o) => {
      const mesh = o as Mesh
      if (mesh.isMesh) {
        mesh.geometry.dispose()
        ;(mesh.material as Material).dispose()
      }
      ;(o as SkinnedMesh).skeleton?.dispose()
    })
    this.chars.delete(ch.key)
  }

  private stepWalk(ch: Char, dt: number) {
    if (this.waitingForElevator(ch)) return
    if (ch.entering && ch.x > ELEVATOR.frontX + 0.35) ch.entering = false
    let remaining = WALK_SPEED * dt
    // Spend the whole frame's distance, including across grid boundaries.
    // Discarding the remainder made walking slow down at every waypoint.
    while (true) {
      const next = ch.path[0]
      if (!next) {
        this.arrive(ch)
        return
      }
      const dx = next.x - ch.x
      const dz = next.z - ch.z
      const dist = Math.hypot(dx, dz)
      if (dist > 1e-4) ch.targetYaw = Math.atan2(dx, dz)
      if (dist > remaining) {
        ch.x += (dx / dist) * remaining
        ch.z += (dz / dist) * remaining
        return
      }
      ch.x = next.x
      ch.z = next.z
      ch.path.shift()
      remaining -= dist
      if (!ch.path.length) {
        this.arrive(ch)
        return
      }
      // 칸 경계에서 목적지가 바뀌었는지 확인(배회 중 일이 생기면 자리로 돌아간다)
      const want = this.wantedGoal(ch)
      if (want !== ch.goal) {
        this.go(ch, want)
        return
      }
    }
  }

  private stepSit(ch: Char, dt: number) {
    const want = this.wantedGoal(ch)
    if (want !== ch.goal) {
      this.go(ch, want)
      return
    }
    if (ch.goal === 'tea') {
      // 티테이블에서 잠깐 쉬다가 자리로 돌아간다(일이 생기면 위에서 바로 돌아간다)
      ch.standTimer -= dt
      if (ch.standTimer <= 0) this.route(ch, ch.seat ? 'seat' : 'spot')
      return
    }
    // 한가하면 잠깐 돌아다닌다. 메인은 MAIN_STAYS_SEATED 면 자리를 지킨다
    if (ch.goal === 'seat' && ch.act === 'idle' && !(ch.isMain && MAIN_STAYS_SEATED)) {
      ch.idleTimer -= dt
      if (ch.idleTimer <= 0) {
        // 열에 넷은 빈 티테이블 의자에 앉으러 간다. 다른 캐릭터가 앉았거나 가는 중인 의자는 고르지 않는다
        const takenTea = new Set([...this.chars.values()].filter((c) => c !== ch && c.tea).map((c) => c.tea!.id))
        const freeTea = LAYOUT.teaSeats.filter((t) => !takenTea.has(t.id))
        if (freeTea.length && Math.random() < 0.4) {
          ch.tea = freeTea[Math.floor(Math.random() * freeTea.length)]
          this.route(ch, 'tea')
          return
        }
        // 다른 캐릭터가 서 있거나 가는 중인 자리는 피한다. 빈 자리가 없으면 잠시 뒤 다시 고른다
        const free = freePois(LAYOUT.pois, this.occupiedPois(ch))
        if (free.length) {
          ch.poi = free[Math.floor(Math.random() * free.length)]
          this.route(ch, 'poi')
        } else ch.idleTimer = rand(2.5, 5)
      }
    }
  }

  private stepStand(ch: Char, dt: number) {
    ch.standTimer -= dt
    if (ch.leaving) {
      if (ch.goal !== 'door') this.route(ch, 'door')
      return
    }
    if (ch.goal === 'coffee') {
      // 커피 머신에 잠깐 들렀다가 휴게 공간으로(그 사이 일이 생기면 자리로)
      const want = this.wantedGoal(ch)
      if (want === 'coffee' && ch.standTimer <= 0) this.route(ch, 'lounge')
      else if (want !== 'coffee') this.go(ch, want)
      return
    }
    if (ch.goal === 'poi') {
      // 배회 중 잠깐 쉬다가(또는 일이 생기면) 자리로 돌아간다
      if (ch.standTimer <= 0 || ch.act !== 'idle') this.route(ch, ch.seat ? 'seat' : 'spot')
      return
    }
    const want = this.wantedGoal(ch)
    if (want !== ch.goal) this.go(ch, want)
  }

  // ───────────────────────── 표시 ─────────────────────────

  private play(ch: Char, name: ClipName) {
    if (ch.playing === name) return
    let next = ch.actions[name]
    if (!next) {
      next = ch.mixer.clipAction(ch.clips[name])
      next.setLoop(LoopRepeat, Infinity)
      ch.actions[name] = next
    }
    const prev = ch.playing ? ch.actions[ch.playing] : null
    next.reset()
    if (name === 'walk') next.timeScale = 2.2
    // 응답 대기 고개 젓기(emote-no)는 원래 속도가 빨라 8분의 1 남짓으로 늦춘다
    if (name === 'wait') next.timeScale = 0.12
    next.time = Math.random() * 0.4
    next.fadeIn(0.25).play()
    prev?.fadeOut(0.25)
    ch.playing = name
  }

  private clipFor(ch: Char): ClipName {
    if (this.waitingForElevator(ch)) return 'idle'
    if (ch.mode === 'walk') return 'walk'
    if (ch.mode === 'stand') return this.isDrinking(ch) ? 'coffee' : 'idle'
    if (ch.sitAt?.sofa) return 'sit'
    if (ch.act === 'type' && (ch.seat?.zone === 0 || classifyRole(ch.typeKey, ch.title) === 'review')) return 'read'
    if (ch.act === 'type') return 'work'
    if (ch.act === 'read') return 'read'
    if (ch.act === 'wait') return 'wait'
    return 'sit'
  }

  /** 커피 마시는 동안만 오른손 본에 컵을 붙이고, 그 밖에는 뗀다 */
  private holdCup(ch: Char, on: boolean) {
    if (on === (ch.cup !== null)) return
    if (!on) {
      ch.cup?.removeFromParent()
      ch.cup = null
      return
    }
    const hand = ch.holder.getObjectByName('hand-right')
    if (!hand) return
    const cup = new Mesh(this.cupGeo, this.cupMat)
    cup.castShadow = true
    cup.position.set(0, -0.015, 0.025)
    hand.add(cup)
    ch.cup = cup
  }

  private applyPose(ch: Char, dt: number) {
    this.play(ch, this.clipFor(ch))
    this.holdCup(ch, this.isDrinking(ch) && ch.playing === 'coffee')
    ch.mixer.update(dt)
    ch.yaw = turnToward(ch.yaw, ch.targetYaw, 9 * dt)
    const sitting = ch.mode === 'sit'
    const y = ch.holder.position.y
    const lift = ch.sitAt ? liftOf(ch.sitAt.seatTop) : 0
    const insidePod = Math.hypot(ch.x - ELEVATOR.x, ch.z - ELEVATOR.z) < 0.73
    const riding = (ch.entering || ch.ridingDown || ch.goal === 'door') && insidePod && this.elevator !== null
    const targetY = riding ? this.elevator!.motion.height + 0.065 : sitting ? lift : 0
    ch.holder.position.set(ch.x, riding ? targetY : y + (targetY - y) * Math.min(1, dt * 10), ch.z)
    ch.holder.rotation.y = ch.yaw
    if (ch.spritePerson) {
      ch.spriteTime += dt
      ch.spritePerson.update(ch.yaw, this.clipFor(ch), ch.spriteTime, ch.sitAt?.seatTop ?? null, ch.holder.position.y)
    }
    ch.ring.position.set(ch.x, 0.012, ch.z)

    // 이름표·말풍선: 머리 위. holder 의 자식이라 holder 높이(보간 중 포함)를 빼서 월드 높이를 고정한다
    const worldHead = sitting
      ? lift + CHAR_SCALE * (MODEL_HEAD_TOP - SIT_ROOT_DROP) + 0.28
      : CHAR_HEIGHT + 0.28
    const head = worldHead - ch.holder.position.y
    ch.label.position.set(0, head, 0)
    const insideLift = ch.x < ELEVATOR.frontX && ch.x > ELEVATOR.x - 0.7 && Math.abs(ch.z - ELEVATOR.z) < 0.7
    ch.labelEl.style.opacity = insideLift ? '0' : '1'
    ch.ring.visible = !insideLift

    // 말풍선: 일하는 중이면 도구 칩 + 설명, 응답 대기면 점만(칩 없음), act 가 idle(배회·자리에서 한가함)이면 없음. 단 응답 없음(멈춘 서브)은 빨간 칩을 띄운다. 휴게 공간(소파·의자·커피 자리)에서 쉬는 메인은 status 가 waiting 이라 act 가 wait 이므로 "…" 가 뜨는 것이 의도다
    const waiting = ch.act === 'wait'
    const stalled = isStalled(ch.status)
    const working = ch.act === 'type' || ch.act === 'read' || stalled
    ch.bubbleEl.style.display = waiting || working ? '' : 'none'
    ch.labelEl.classList.toggle('is-wait', waiting)
    ch.dotsEl.style.display = waiting || (working && ch.spawning) ? '' : 'none'
    ch.tagEl.style.display = working ? '' : 'none'
    const same = ch.title === agentNameOf(ch.typeKey, ch.isMain)
    ch.textEl.style.display = working && !same ? '' : 'none'
    const tag = toolText(ch.status)
    if (tag !== ch.shownTag) {
      ch.shownTag = tag
      ch.tagEl.textContent = tag
    }
    ch.tagEl.dataset.kind = stalled
      ? 'stall'
      : !ch.status.tool
        ? 'plain'
        : ch.status.tool === 'Bash'
          ? 'bash'
          : ch.act
    if (ch.title !== ch.shownText) {
      ch.shownText = ch.title
      ch.textEl.textContent = ch.title
      ch.labelEl.title = ch.title
    }
  }

  /**
   * 사람이 앉아 있는 자리만 디자인 화면·터미널을 켜고, 빈자리는 파란 화면으로 둔다.
   * 일하는 중이면 터미널을 스크롤한다(Bash 는 빠르게, 읽기 도구는 천천히). 대기 중이면 멈춘다.
   */
  private updateScreens(dt: number) {
    // Keep the first occupant, matching the previous per-seat find operation.
    const occupants = new Map<Seat, Char>()
    for (const ch of this.chars.values()) {
      if (ch.seat && ch.mode === 'sit' && ch.goal === 'seat' && !occupants.has(ch.seat)) {
        occupants.set(ch.seat, ch)
      }
    }
    for (const seat of LAYOUT.seats) {
      const screen = this.screens.get(seat.id)
      if (!screen) continue
      // 자기 책상에 앉아 있을 때만(티테이블·소파에 앉아 있으면 빈자리로 본다)
      const occ = occupants.get(seat)
      for (const p of screen.planes) p.visible = !!occ
      const term = screen.term
      const speed = !occ || !term
        ? 0
        : occ.status.tool === 'Bash' && occ.act === 'type'
          ? TERM_SPEED.bash
          : occ.act === 'type'
            ? TERM_SPEED.type
            : occ.act === 'read'
              ? TERM_SPEED.read
              : 0
      if (!speed || !term) continue
      const before = Math.floor(screen.scroll)
      screen.scroll += dt * speed
      const lines = Math.floor(screen.scroll)
      if (lines === before) continue
      // 줄 단위로 끊어 옮겨 터미널처럼 한 줄씩 올라가게 한다
      const step = (lines % TERM_LINES) / TERM_LINES
      term.offset.y = (((1 - term.repeat.y - step) % 1) + 1) % 1
    }
  }
}

