/** Furniture assets for the office scene. Character geometry is created separately. */
import { AnimationClip, Box3, Group, type Object3D, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const urls = import.meta.glob('./assets/furniture/*.glb', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

export interface FurnitureModel {
  root: Object3D
  size: Vector3
  center: Vector3
}

export interface CharacterModel {
  clips: Record<'idle' | 'walk' | 'sit' | 'work' | 'read' | 'wait' | 'coffee', AnimationClip>
}

export interface OfficeAssets {
  furniture: Map<string, FurnitureModel>
}

/** Stable names used to select character appearance. */
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

function find(path: string): string {
  const url = urls[`./assets/${path}`]
  if (!url) throw new Error(`에셋이 없습니다: ${path}`)
  return url
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

let cached: Promise<OfficeAssets> | null = null

export function loadOfficeAssets(models: string[]): Promise<OfficeAssets> {
  if (cached) return cached
  const loader = new GLTFLoader()
  cached = (async () => {
    const loaded = await Promise.all(models.map(model => loader.loadAsync(find(`furniture/${model}.glb`))))
    const furniture = new Map<string, FurnitureModel>()
    models.forEach((model, i) => furniture.set(model, normalize(loaded[i].scene)))
    return { furniture }
  })()
  cached.catch(() => (cached = null))
  return cached
}

/** Release the cache when the scene is destroyed. */
export function releaseOfficeAssets() {
  cached = null
}
