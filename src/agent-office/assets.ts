/**
 * AI 작업 사무실 에셋 로더. Kenney Furniture Kit · Mini Characters(CC0) 의 GLB 를 읽는다.
 * 모델은 `./assets/` 아래에 두고 import.meta.glob(?url)로 참조한다 — public/ 이 아니라 운영 dist 에 복사되지 않는다.
 */
import {
  AnimationClip,
  Box3,
  Euler,
  Group,
  LoadingManager,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const urls = import.meta.glob('./assets/**/*.{glb,png}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

export interface FurnitureModel {
  /** 바닥 중심이 원점, 밑면이 y=0 이 되도록 감싼 원본 */
  root: Object3D
  /** 정규화 뒤 크기(w, h, d) */
  size: Vector3
  /** 원래 모델 좌표에서 경계 상자의 가운데. 벽처럼 원래 좌표(벽면 z=0)에 맞춰 놓아야 할 때 쓴다 */
  center: Vector3
}

export interface CharacterModel {
  root: Object3D
  /** 공용 색상표(colormap.png) 원본. 옷 색을 바꾼 변형 텍스처를 만들 때 쓴다 */
  colormap: CanvasImageSource & { width: number; height: number }
  /** 윗옷 색 칸(색상표를 16열 x 4행으로 나눈 칸 번호). TOP_CELL 이 정하고, 없으면 몸통 메시가 가장 많이 쓰는 칸(피부 칸 제외)이다 */
  clothesCell: { col: number; row: number }
  clips: Record<'idle' | 'walk' | 'sit' | 'work' | 'read' | 'wait' | 'coffee', AnimationClip>
}

export interface OfficeAssets {
  furniture: Map<string, FurnitureModel>
  characters: CharacterModel[]
  characterNames: string[]
}

/** 사무실에서 쓰는 캐릭터 (Mini Characters 중 female-a 는 양손에 총을 들고 있어 뺐다) */
export const CHARACTER_NAMES = [
  'character-male-a',
  'character-male-b',
  'character-male-c',
  'character-male-d',
  'character-male-e',
  'character-male-f',
  'character-female-b',
  'character-female-c',
  'character-female-d',
  'character-female-e',
  'character-female-f',
]

/**
 * 모델마다 "윗옷" 색 칸(색상표 16열 x 4행의 칸 번호, 홀수 열은 짝 칸과 한 쌍으로 칠한다).
 * 몸통 메시가 가장 많이 쓰는 칸(dominantClothesCell)은 바지·신발 칸일 때가 있어(male-c·male-e·male-f·female-b·female-f)
 * 옷 색을 바꿔도 앉은 모습에서 거의 안 보인다. 그래서 몸통(torso)·팔 정점이 쓰는 칸과 정면 렌더를 대조해 윗옷 칸을 골랐다.
 * 여기 없는 모델은 dominantClothesCell 로 대신한다.
 */
const TOP_CELL: Record<string, { col: number; row: number }> = {
  'character-male-a': { col: 2, row: 2 },
  'character-male-b': { col: 8, row: 2 },
  'character-male-c': { col: 10, row: 2 },
  'character-male-d': { col: 0, row: 3 },
  'character-male-e': { col: 4, row: 2 },
  'character-male-f': { col: 2, row: 2 },
  'character-female-b': { col: 4, row: 2 },
  'character-female-c': { col: 10, row: 2 },
  'character-female-d': { col: 2, row: 3 },
  'character-female-e': { col: 8, row: 3 },
  'character-female-f': { col: 4, row: 2 },
}

function find(path: string): string {
  const url = urls[`./assets/${path}`]
  if (!url) throw new Error(`에셋이 없습니다: ${path}`)
  return url
}

/**
 * 앉아서 일하는 동작은 Mini Characters 에 없다(클립: idle, walk, sit, interact-*, emote-* 등).
 * 그래서 `sit`(하체·뿌리 위치)에 상체 클립의 몸통·머리·팔 트랙을 얹어 합친다.
 * 읽기 = interact-left, 응답 대기 = emote-no(고개 젓기). 타이핑은 typeClip 이 따로 만든다.
 */
function mixClip(name: string, all: AnimationClip[], upper: string): AnimationClip {
  const sit = all.find((c) => c.name === 'sit')!
  const top = all.find((c) => c.name === upper)!
  const lower = sit.tracks.filter((t) => /^(root|leg-left|leg-right)\./.test(t.name))
  const body = top.tracks.filter((t) => /^(torso|head|arm-left|arm-right)\./.test(t.name))
  return new AnimationClip(
    name,
    top.duration,
    [...lower, ...body].map((t) => t.clone()),
  )
}

/**
 * 손마다 키를 누르는 박자(1 = 누름, 한 칸 = TYPE_STEP 초). 두 손이 엇갈리게 두드리다가
 * 끝 무렵 잠깐 손을 들고 멈춘다(생각하는 틈). 마지막 칸 뒤에 첫 칸이 이어져 반복된다.
 */
const TYPE_STEP = 0.09
const TYPE_LEFT = '1010010110100100101101001000000'
const TYPE_RIGHT = '0101101001011010010010110100000'

/**
 * 타이핑. interact-right 는 한 손으로 무언가를 집는 동작이라 키보드 치는 느낌이 나지 않아 직접 만든다.
 * 하체는 `sit` 그대로. 팔 뼈는 바인드 자세에서 옆(왼팔 +x, 오른팔 -x)을 가리키고 앞은 +z 이므로,
 * 양팔을 앞쪽 아래(책상 위 키보드)로 뻗은 방향을 기준으로 누르는 칸마다 손을 내렸다 올린다.
 * 손 위치를 좌우로 조금씩 옮겨 여러 키를 치는 것처럼 보이게 하고, 몸통은 살짝 앞으로 숙인다.
 */
function typeClip(all: AnimationClip[]): AnimationClip {
  const sit = all.find((c) => c.name === 'sit')!
  const lower = sit.tracks
    .filter((t) => /^(root|leg-left|leg-right)\./.test(t.name))
    .map((t) => t.clone())
  const n = TYPE_LEFT.length
  const times = Array.from({ length: n + 1 }, (_, i) => i * TYPE_STEP)
  const q = new Quaternion()
  const dir = new Vector3()
  const arm = (side: 1 | -1, pattern: string) => {
    const rest = new Vector3(side, 0, 0)
    const values: number[] = []
    for (let i = 0; i <= n; i++) {
      const k = i % n
      const down = pattern[k] === '1' ? 1 : 0
      const sway = 0.06 * Math.sin((k / n) * Math.PI * 2 * 3 + (side > 0 ? 0 : 1.3))
      dir.set(side * (0.16 + sway), -0.3 - 0.4 * down, 0.9).normalize()
      values.push(...q.setFromUnitVectors(rest, dir).toArray())
    }
    return new QuaternionKeyframeTrack(`arm-${side > 0 ? 'left' : 'right'}.quaternion`, times, values)
  }
  // 몸통: 앞으로 7° 숙이고 누를 때마다 조금 들썩인다(뒤에서 보는 카메라라 팔보다 몸이 먼저 보인다). 머리: 화면을 보며 천천히 까딱인다
  const e = new Euler()
  const torso: number[] = []
  const head: number[] = []
  for (let i = 0; i <= n; i++) {
    const k = i % n
    const hit = TYPE_LEFT[k] === '1' || TYPE_RIGHT[k] === '1' ? 1 : 0
    torso.push(...q.setFromEuler(e.set((7 + 2.5 * hit) * (Math.PI / 180), 0, 0)).toArray())
    const nod = 3 * Math.sin((k / n) * Math.PI * 2)
    head.push(...q.setFromEuler(e.set((-4 + nod) * (Math.PI / 180), 0, 0)).toArray())
  }
  return new AnimationClip('work', n * TYPE_STEP, [
    ...lower,
    arm(1, TYPE_LEFT),
    arm(-1, TYPE_RIGHT),
    new QuaternionKeyframeTrack('torso.quaternion', times, torso),
    new QuaternionKeyframeTrack('head.quaternion', times, head),
  ])
}

/** 트랙을 times 방향으로 n 번 이어 붙인다(마지막 키가 첫 키와 같은 순환 클립용) */
function tile(t: AnimationClip['tracks'][number], period: number, n: number) {
  const size = t.getValueSize()
  const times: number[] = []
  const values: number[] = []
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < t.times.length - (k < n - 1 ? 1 : 0); i++) {
      times.push(t.times[i] + k * period)
      for (let j = 0; j < size; j++) values.push(t.values[i * size + j])
    }
  }
  return new QuaternionKeyframeTrack(t.name, times, values)
}

/**
 * 커피 마시는 자세. 서 있는 `idle` 에 오른팔만 바꾼다. 평소엔 `holding-right`(컵을 든 팔)이고,
 * 가끔 `pick-up` 이 팔을 가장 높이 들어 올린 프레임(입 높이)까지 올렸다 내린다.
 */
const SIP_FRAME = 5
function coffeeClip(all: AnimationClip[]): AnimationClip {
  const idle = all.find((c) => c.name === 'idle')!
  const hold = all.find((c) => c.name === 'holding-right')!
  const pick = all.find((c) => c.name === 'pick-up')!
  const armOf = (c: AnimationClip) => c.tracks.find((t) => t.name === 'arm-right.quaternion')!
  const h = Array.from(armOf(hold).values.slice(0, 4))
  const p = Array.from(armOf(pick).values.slice(SIP_FRAME * 4, SIP_FRAME * 4 + 4))
  const loops = 4
  const total = idle.duration * loops
  const keys: [number, number[]][] = [
    [0, h],
    [2, h],
    [2.5, p],
    [3.5, p],
    [4, h],
    [total, h],
  ]
  const arm = new QuaternionKeyframeTrack(
    'arm-right.quaternion',
    keys.map((k) => k[0]),
    keys.flatMap((k) => k[1]),
  )
  const rest = idle.tracks
    .filter((t) => /^(torso|head|arm-left)\./.test(t.name))
    .map((t) => tile(t, idle.duration, loops))
  return new AnimationClip('coffee', total, [...rest, arm])
}

function normalize(src: Object3D): FurnitureModel {
  const box = new Box3().setFromObject(src)
  const size = box.getSize(new Vector3())
  const center = box.getCenter(new Vector3())
  src.position.set(-center.x, -box.min.y, -center.z)
  const root = new Group()
  root.add(src)
  return { root, size, center }
}

/**
 * 색상표는 16열 x 4행 칸으로 나뉜 단색(+그라데이션) 견본이다. 몸통 메시가 가장 많이 쓰는 칸 중
 * 피부 견본(2행 0~1열, 3행 10~15열)을 뺀 것이 옷 색이다.
 */
function dominantClothesCell(mesh: Mesh) {
  const uv = mesh.geometry.getAttribute('uv')
  const count = new Map<string, number>()
  for (let i = 0; i < uv.count; i++) {
    const col = Math.min(15, Math.floor(uv.getX(i) * 16))
    const row = Math.min(3, Math.floor(uv.getY(i) * 4))
    const skin = (row === 2 && col <= 1) || (row === 3 && col >= 10)
    if (skin) continue
    const k = `${col},${row}`
    count.set(k, (count.get(k) ?? 0) + 1)
  }
  let best = '0,3'
  let max = -1
  for (const [k, n] of count) {
    if (n > max) {
      max = n
      best = k
    }
  }
  const [col, row] = best.split(',').map(Number)
  return { col, row }
}

let cached: Promise<OfficeAssets> | null = null

export function loadOfficeAssets(models: string[]): Promise<OfficeAssets> {
  if (cached) return cached
  // 캐릭터 GLB 는 'Textures/colormap.png' 를 상대경로로 참조한다. 번들된 URL 로 바꿔 준다
  const colormapUrl = find('characters/colormap.png')
  const manager = new LoadingManager()
  manager.setURLModifier((url) => (url.endsWith('Textures/colormap.png') ? colormapUrl : url))
  const loader = new GLTFLoader(manager)
  const load = (url: string) => loader.loadAsync(url)
  cached = (async () => {
    const furniture = new Map<string, FurnitureModel>()
    const [furnitureGltfs, charGltfs] = await Promise.all([
      Promise.all(models.map((m) => load(find(`furniture/${m}.glb`)))),
      Promise.all(CHARACTER_NAMES.map((n) => load(find(`characters/${n}.glb`)))),
    ])
    models.forEach((m, i) => furniture.set(m, normalize(furnitureGltfs[i].scene)))
    const characters: CharacterModel[] = charGltfs.map((g, idx) => {
      const a = g.animations
      let colormap: CharacterModel['colormap'] | null = null
      let clothesCell = { col: 0, row: 3 }
      g.scene.traverse((o) => {
        const mesh = o as Mesh
        if (!mesh.isMesh) return
        const mat = mesh.material as MeshStandardMaterial
        if (!colormap && mat.map?.image) colormap = mat.map.image as CharacterModel['colormap']
        if (mesh.name === 'body-mesh') {
          clothesCell = TOP_CELL[CHARACTER_NAMES[idx]] ?? dominantClothesCell(mesh)
        }
      })
      const clip = (n: string) => a.find((c) => c.name === n)!
      return {
        root: g.scene,
        colormap: colormap!,
        clothesCell,
        clips: {
          idle: clip('idle'),
          walk: clip('walk'),
          sit: clip('sit'),
          coffee: coffeeClip(a),
          work: typeClip(a),
          read: mixClip('read', a, 'interact-left'),
          wait: mixClip('wait', a, 'emote-no'),
        },
      }
    })
    return { furniture, characters, characterNames: CHARACTER_NAMES }
  })()
  cached.catch(() => (cached = null))
  return cached
}

/** 장면을 닫을 때 호출: 다음에 다시 열면 모델을 새로 읽는다(해제된 GPU 자원을 재사용하지 않도록) */
export function releaseOfficeAssets() {
  cached = null
}
