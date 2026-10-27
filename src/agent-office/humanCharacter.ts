import {
  AnimationClip, Bone, Skeleton, SkinnedMesh, Uint16BufferAttribute, BufferGeometry, Float32BufferAttribute, CatmullRomCurve3, TubeGeometry, Vector3, Euler, Group, Mesh, MeshStandardMaterial, Quaternion,
  QuaternionKeyframeTrack, SphereGeometry, VectorKeyframeTrack,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { CharacterModel } from './assets'

export const HUMAN_HEAD_TOP = 0.82
export const HUMAN_SIT_BOTTOM = 0.0975

export interface HumanCharacterOptions {
  outfit?: 'hoodie' | 'shirt'
  gender?: 'male' | 'female'
  cap?: boolean
  glasses?: boolean
}

/** Small articulated office workers. All geometry belongs to this instance. */
export function createHumanCharacter(variant: number, shirtColor: string, options: HumanCharacterOptions = {}) {
  const hoodie = options.outfit !== 'shirt'
  const female = options.gender ? options.gender === 'female' : variant >= 6
  const glasses = options.glasses ?? false
  const model = new Group()
  model.userData.proceduralHuman = true
  model.userData.appearance = { outfit: hoodie ? 'hoodie' : 'shirt', gender: female ? 'female' : 'male', cap: options.cap ?? false, glasses }
  const skin = new MeshStandardMaterial({ color: ['#e6b994', '#be8968', '#e2ad8b', '#8f6049'][variant % 4], roughness: 0.85 })
  const hair = new MeshStandardMaterial({ color: ['#302923', '#543c2e', '#252a31', '#816046'][variant % 4], roughness: 0.95 })
  const shirt = new MeshStandardMaterial({ color: shirtColor, roughness: 0.95 })
  const pants = new MeshStandardMaterial({ color: hoodie ? ['#526c8a', '#4c6480', '#607993'][variant % 3] : '#394552', roughness: 1 })
  const white = new MeshStandardMaterial({ color: '#eee9df', roughness: 0.9 })
  const dark = new MeshStandardMaterial({ color: '#282b30', roughness: 0.7 })
  const joint = (parent: Group, name: string, x: number, y: number, z = 0) => {
    const g = new Group()
    g.name = name
    g.position.set(x, y, z)
    parent.add(g)
    return g
  }
  const box = (parent: Group, mat: MeshStandardMaterial, size: number[], pos: number[], radius = 0.015) => {
    const m = new Mesh(new RoundedBoxGeometry(size[0]!, size[1]!, size[2]!, 2, radius), mat)
    m.position.set(pos[0]!, pos[1]!, pos[2]!)
    parent.add(m)
    return m
  }
  const oval = (parent: Group, mat: MeshStandardMaterial, size: number[], pos: number[]) => {
    const m = new Mesh(new SphereGeometry(1, 24, 16), mat)
    m.scale.set(size[0]!, size[1]!, size[2]!)
    m.position.set(pos[0]!, pos[1]!, pos[2]!)
    parent.add(m)
    return m
  }
  // Elliptical cross-sections sculpt continuous silhouettes instead of stacked boxes.
  const sculpt = (parent: Group, mat: MeshStandardMaterial, rings: number[][], pos: number[]) => {
    const vertices: number[] = [], indices: number[] = []
    const segments = 24
    for (const [y, rx, rz, offset = 0] of rings) {
      for (let i = 0; i <= segments; i++) {
        const angle = i / segments * Math.PI * 2
        vertices.push(Math.cos(angle) * rx!, y!, Math.sin(angle) * rz! + offset)
      }
    }
    for (let j = 0; j < rings.length - 1; j++) {
      for (let i = 0; i < segments; i++) {
        const a = j * (segments + 1) + i, b = a + segments + 1
        indices.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }
    // Close sleeve/trouser ends so bent joints never expose hollow tubes.
    for (const end of [0, rings.length - 1]) {
      const ring = rings[end]!
      const center = vertices.length / 3
      vertices.push(0, ring[0]!, ring[3] ?? 0)
      for (let i = 0; i < segments; i++) {
        const a = end * (segments + 1) + i
        if (end === 0) indices.push(a, a + 1, center)
        else indices.push(a + 1, a, center)
      }
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    const mesh = new Mesh(geometry, mat)
    mesh.position.set(pos[0]!, pos[1]!, pos[2]!)
    parent.add(mesh)
    return mesh
  }
  const line = (parent: Group, mat: MeshStandardMaterial, points: number[][], radius: number) => {
    const curve = new CatmullRomCurve3(points.map(p => new Vector3(p[0], p[1], p[2])))
    const mesh = new Mesh(new TubeGeometry(curve, 12, radius, 5, false), mat)
    parent.add(mesh)
    return mesh
  }
  // Continuous cloth spans a hinge and blends between two bones near the joint.
  const skinLimb = (parent: Group, hinge: Group, material: MeshStandardMaterial, rings: number[][]) => {
    const shell = sculpt(parent, material, rings, [0, 0, 0])
    const geometry = shell.geometry
    parent.remove(shell)
    const upper = new Bone(), lower = new Bone()
    upper.name = parent.name + '-deform'
    lower.name = hinge.name + '-deform'
    parent.add(upper)
    hinge.add(lower)
    const indices: number[] = [], weights: number[] = []
    const positions = geometry.getAttribute('position')
    for (let i = 0; i < positions.count; i++) {
      const blend = Math.max(0, Math.min(1, (hinge.position.y + 0.035 - positions.getY(i)) / 0.07))
      indices.push(0, 1, 0, 0)
      weights.push(1 - blend, blend, 0, 0)
    }
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(indices, 4))
    geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4))
    const mesh = new SkinnedMesh(geometry, material)
    parent.add(mesh)
    model.updateMatrixWorld(true)
    mesh.bind(new Skeleton([upper, lower]), mesh.matrixWorld)
    mesh.frustumCulled = false
    return mesh
  }
  const root = joint(model, 'root', 0, 0)
  const torso = joint(root, 'torso', 0, 0.29)
  sculpt(torso, shirt, hoodie ? [
    [-0.018, 0.001, 0.001], [-0.016, 0.088, 0.062], [0.005, 0.099, 0.068],
    [0.04, 0.109, 0.075], [0.08, 0.107, 0.074], [0.13, 0.106, 0.071],
    [0.18, 0.112, 0.066], [0.204, 0.105, 0.057], [0.222, 0.064, 0.041],
    [0.228, 0.032, 0.030], [0.229, 0.001, 0.001],
  ] : [
    [-0.012, 0.001, 0.001], [-0.008, 0.084, 0.058], [0.025, 0.090, 0.060],
    [0.10, 0.087, 0.060], [0.17, 0.107, 0.062], [0.195, 0.108, 0.055],
    [0.213, 0.075, 0.045], [0.222, 0.038, 0.033], [0.223, 0.001, 0.001],
  ], [0, 0, 0])
  sculpt(torso, skin, [[0.19, 0.027, 0.026], [0.24, 0.030, 0.029], [0.28, 0.033, 0.030]], [0, 0, 0])
  const seam = new MeshStandardMaterial({ color: shirt.color.clone().multiplyScalar(0.78), roughness: 1 })
  const trim = new MeshStandardMaterial({ color: '#d8d2c5', roughness: 0.9 })
  if (hoodie) {
    const hood = joint(torso, 'hood', 0, 0)
    // A lowered hood wraps around the nape, with an inset lining and open neck.
    oval(hood, shirt, [0.086, 0.069, 0.043], [0, 0.178, -0.067])
    oval(hood, seam, [0.057, 0.024, 0.031], [0, 0.226, -0.053])
    line(hood, shirt, [[-0.058, 0.221, -0.039], [-0.066, 0.227, 0.007], [-0.039, 0.212, 0.049], [0, 0.201, 0.061], [0.039, 0.212, 0.049], [0.066, 0.227, 0.007], [0.058, 0.221, -0.039]], 0.012)
    box(torso, white, [0.028, 0.018, 0.006], [0, 0.219, 0.034], 0.004)
    const pocket = joint(torso, 'hoodie-pocket', 0, 0)
    sculpt(pocket, shirt, [[0.023, 0.053, 0.006], [0.035, 0.070, 0.012], [0.063, 0.068, 0.014], [0.087, 0.049, 0.009], [0.09, 0.043, 0.003]], [0, 0, 0.066])
    for (const side of [-1, 1]) {
      line(pocket, seam, [[side * 0.049, 0.083, 0.077], [side * 0.065, 0.060, 0.080], [side * 0.067, 0.037, 0.077]], 0.0018)
      line(torso, trim, [[side * 0.035, 0.212, 0.059], [side * 0.039, 0.164, 0.074], [side * 0.036, 0.123, 0.077]], 0.0025)
      box(torso, trim, [0.006, 0.012, 0.006], [side * 0.036, 0.119, 0.078], 0.002)
    }
    sculpt(torso, seam, [[-0.016, 0.089, 0.063], [0.002, 0.096, 0.066], [0.013, 0.096, 0.066]], [0, 0, 0])
  } else {
    box(torso, white, [0.030, 0.038, 0.008], [0, 0.198, 0.052], 0.003)
    for (const side of [-1, 1]) {
      const collar = box(torso, shirt, [0.041, 0.044, 0.012], [side * 0.029, 0.196, 0.056], 0.006)
      collar.rotation.z = side * 0.42
    }
    for (const y of [0.055, 0.095, 0.135]) oval(torso, dark, [0.003, 0.003, 0.002], [0.006, y, 0.064])
    line(torso, seam, [[-0.071, 0.138, 0.054], [-0.067, 0.106, 0.059], [-0.043, 0.106, 0.064], [-0.039, 0.138, 0.060]], 0.0015)
  }
  const head = joint(torso, 'head', 0, 0.275)
  sculpt(head, skin, [
    [-0.022, 0.001, 0.001, 0.012], [-0.015, 0.037, 0.040, 0.012],
    [0.005, 0.067, 0.060, 0.009], [0.035, 0.092, 0.078, 0.005],
    [0.075, 0.103, 0.086], [0.115, 0.099, 0.083],
    [0.15, 0.086, 0.074], [0.177, 0.052, 0.045], [0.188, 0.001, 0.001],
  ], [0, 0, 0])
  // Sculpted cap follows the scalp, with a higher hairline at the forehead.
  const hairVertices: number[] = [], hairIndices: number[] = []
  for (let row = 0; row <= 12; row++) {
    for (let col = 0; col <= 32; col++) {
      const phi = col / 32 * Math.PI * 2
      const front = Math.max(0, Math.sin(phi))
      const theta = row / 12 * (1.95 - front * 0.72)
      hairVertices.push(0.108 * Math.sin(theta) * Math.cos(phi), 0.083 + 0.120 * Math.cos(theta), -0.006 + 0.095 * Math.sin(theta) * Math.sin(phi))
      if (row < 12 && col < 32) {
        const a = row * 33 + col, b = a + 33
        hairIndices.push(a, a + 1, b, b, a + 1, b + 1)
      }
    }
  }
  const hairGeometry = new BufferGeometry()
  hairGeometry.setAttribute('position', new Float32BufferAttribute(hairVertices, 3))
  hairGeometry.setIndex(hairIndices)
  hairGeometry.computeVertexNormals()
  head.add(new Mesh(hairGeometry, hair))
  const hairHighlight = new MeshStandardMaterial({ color: hair.color.clone().multiplyScalar(1.24), roughness: 0.85 })
  if (!options.cap) {
    for (let i = 0; i < 5; i++) {
      const lock = oval(head, hair, [0.063 - i * 0.005, 0.024, 0.030], [-0.050 + i * 0.025, 0.145 + Math.sin(i * 0.6) * 0.027, 0.063 - i * 0.004])
      lock.rotation.z = -0.52 + i * 0.08
      line(head, hairHighlight, [[-0.080 + i * 0.018, 0.145, 0.066], [-0.038 + i * 0.018, 0.179, 0.065], [0.008 + i * 0.015, 0.181, 0.025]], 0.0018)
    }
  }
  if (female) {
    const ponytail = joint(head, 'ponytail', 0, 0)
    oval(ponytail, hair, [0.039, 0.046, 0.040], [0, 0.05, -0.096])
    sculpt(ponytail, hair, [[-0.13, 0.007, 0.009, -0.13], [-0.105, 0.027, 0.024, -0.14], [-0.065, 0.036, 0.029, -0.145], [-0.015, 0.034, 0.028, -0.13], [0.04, 0.028, 0.026, -0.11], [0.075, 0.008, 0.008, -0.10]], [0, 0, 0])
    for (const side of [-1, 1]) line(head, hair, [[side * 0.082, 0.12, 0.047], [side * 0.099, 0.055, 0.032], [side * 0.084, -0.006, 0.031]], 0.009)
  }
  if (options.cap) {
    const cap = joint(head, 'snapback', 0, 0)
    const fabric = new MeshStandardMaterial({ color: '#424d66', roughness: 0.95 })
    const stitching = new MeshStandardMaterial({ color: '#69758c', roughness: 1 })
    sculpt(cap, fabric, [[0.115, 0.110, 0.100], [0.145, 0.111, 0.101], [0.185, 0.098, 0.091], [0.217, 0.063, 0.061], [0.232, 0.001, 0.001]], [0, 0, -0.005])
    // Flat, rounded bill rather than a curved baseball brim; no brand marks.
    box(cap, fabric, [0.205, 0.009, 0.128], [0, 0.118, 0.116], 0.025)
    oval(cap, fabric, [0.011, 0.006, 0.011], [0, 0.231, -0.005])
    for (let panel = 0; panel < 6; panel++) {
      const angle = panel / 6 * Math.PI * 2
      line(cap, stitching, [[0.109 * Math.cos(angle), 0.125, -0.005 + 0.100 * Math.sin(angle)], [0.098 * Math.cos(angle), 0.183, -0.005 + 0.091 * Math.sin(angle)], [0.061 * Math.cos(angle), 0.217, -0.005 + 0.059 * Math.sin(angle)], [0, 0.233, -0.005]], 0.001)
    }
  }
  const iris = new MeshStandardMaterial({ color: '#544031', roughness: 0.65 })
  const lip = new MeshStandardMaterial({ color: '#a66c60', roughness: 0.85 })
  for (const side of [-1, 1]) {
    oval(head, skin, [0.016, 0.026, 0.018], [side * 0.101, 0.066, 0])
    oval(head, white, [0.018, 0.014, 0.006], [side * 0.037, 0.086, 0.081])
    oval(head, iris, [0.010, 0.012, 0.004], [side * 0.035, 0.086, 0.086])
    oval(head, dark, [0.006, 0.009, 0.002], [side * 0.035, 0.086, 0.089])
    oval(head, white, [0.0025, 0.0025, 0.001], [side * 0.035 - 0.002, 0.090, 0.091])
    line(head, hair, [[side * 0.020, 0.109, 0.083], [side * 0.037, 0.114, 0.083], [side * 0.055, 0.108, 0.077]], 0.004)
    if (glasses) {
      const cx = side * 0.037
      line(head, dark, [[cx - 0.024, 0.095, 0.091], [cx - 0.022, 0.067, 0.091], [cx + 0.021, 0.067, 0.091], [cx + 0.024, 0.095, 0.091], [cx - 0.024, 0.095, 0.091]], 0.0025)
      line(head, dark, [[side * 0.060, 0.091, 0.090], [side * 0.102, 0.085, 0]], 0.0025)
    }
  }
  if (glasses) line(head, dark, [[-0.013, 0.090, 0.092], [0, 0.094, 0.094], [0.013, 0.090, 0.092]], 0.002)
  oval(head, skin, [0.012, 0.020, 0.018], [0, 0.061, 0.083])
  line(head, lip, [[-0.017, 0.028, 0.078], [0, 0.024, 0.080], [0.017, 0.028, 0.078]], 0.002)
  for (const side of [-1, 1]) {
    const suffix = side > 0 ? 'left' : 'right'
    const arm = joint(torso, `arm-${suffix}`, side * 0.122, 0.185)
    const forearm = joint(arm, `forearm-${suffix}`, 0, -0.12)
    if (hoodie) {
      skinLimb(arm, forearm, shirt, [
        [-0.212, 0.024, 0.025], [-0.193, 0.031, 0.032], [-0.17, 0.038, 0.038],
        [-0.14, 0.039, 0.041], [-0.10, 0.040, 0.042], [-0.055, 0.042, 0.044],
        [-0.015, 0.042, 0.043], [0.01, 0.037, 0.037], [0.025, 0.024, 0.023], [0.031, 0.001, 0.001],
      ])
      sculpt(forearm, seam, [[-0.095, 0.024, 0.026], [-0.077, 0.027, 0.028]], [0, 0, 0])
    } else {
      sculpt(arm, shirt, [[-0.13, 0.030, 0.033], [-0.06, 0.04, 0.042], [0.005, 0.039, 0.038], [0.025, 0.001, 0.001]], [0, 0, 0])
      sculpt(forearm, skin, [[-0.095, 0.019, 0.020], [-0.04, 0.027, 0.027], [0.015, 0.027, 0.028]], [0, 0, 0])
    }
    oval(forearm, skin, [0.023, 0.030, 0.018], [0, -0.102, 0])
    oval(forearm, skin, [0.012, 0.019, 0.013], [-side * 0.019, -0.095, 0.012])
    joint(forearm, `hand-${suffix}`, 0, -0.095)
    const leg = joint(root, `leg-${suffix}`, side * 0.056, 0.29)
    const shin = joint(leg, `shin-${suffix}`, 0, -0.135)
    skinLimb(leg, shin, pants, [
      [-0.255, 0.028, 0.031], [-0.23, 0.030, 0.033], [-0.20, 0.033, 0.035],
      [-0.17, 0.034, 0.036], [-0.14, 0.035, 0.037], [-0.11, 0.037, 0.038],
      [-0.075, 0.039, 0.040], [-0.04, 0.042, 0.0425], [0.012, 0.045, 0.0425], [0.028, 0.001, 0.001],
    ])
    joint(leg, `seat-contact-${suffix}`, 0, 0, -0.0425)
    const sneaker = joint(shin, 'sneaker-' + suffix, 0, 0)
    box(sneaker, white, [0.077, 0.018, 0.131], [0, -0.144, 0.025], 0.008)
    box(sneaker, trim, [0.073, 0.035, 0.120], [0, -0.124, 0.023], 0.014)
    box(sneaker, white, [0.043, 0.008, 0.046], [0, -0.103, 0.027], 0.006)
    for (let lace = 0; lace < 3; lace++) line(sneaker, white, [[-0.018, -0.098, 0.012 + lace * 0.012], [0, -0.095, 0.015 + lace * 0.012], [0.018, -0.098, 0.012 + lace * 0.012]], 0.0018)
    if (hoodie) {
      const denimSeam = new MeshStandardMaterial({ color: '#8293a2', roughness: 1 })
      line(leg, denimSeam, [[side * 0.039, 0, 0.013], [side * 0.039, -0.06, 0.011], [side * 0.032, -0.13, 0.008]], 0.001)
      line(shin, denimSeam, [[side * 0.033, 0, 0.006], [side * 0.030, -0.06, 0.006], [side * 0.027, -0.11, 0.006]], 0.001)
    }
  }
  // Merge pieces that move together, keeping the detailed face inexpensive to draw.
  model.traverse(parent => {
    const groups = new Map<MeshStandardMaterial, Mesh[]>()
    for (const child of parent.children) {
      if (!(child instanceof Mesh) || child instanceof SkinnedMesh) continue
      const material = child.material as MeshStandardMaterial
      const group = groups.get(material) ?? []
      group.push(child)
      groups.set(material, group)
    }
    for (const [material, pieces] of groups) {
      if (pieces.length < 2) continue
      const geometries = pieces.map(piece => {
        piece.updateMatrix()
        const geometry = piece.geometry.index ? piece.geometry.toNonIndexed() : piece.geometry.clone()
        geometry.deleteAttribute('uv')
        geometry.applyMatrix4(piece.matrix)
        return geometry
      })
      const merged = mergeGeometries(geometries)
      geometries.forEach(g => g.dispose())
      if (!merged) continue
      for (const piece of pieces) {
        parent.remove(piece)
        piece.geometry.dispose()
      }
      parent.add(new Mesh(merged, material))
    }
  })
  const clips = {} as CharacterModel['clips']
  for (const name of ['idle', 'walk', 'sit', 'work', 'read', 'wait', 'coffee'] as const) {
    const seated = ['sit', 'work', 'read', 'wait'].includes(name)
    const duration = name === 'walk' ? 0.8 : 3.2
    const times = Array.from({ length: 33 }, (_, i) => i * duration / 32)
    const tracks: (QuaternionKeyframeTrack | VectorKeyframeTrack)[] = []
    const rotation = (bone: string, angles: (phase: number) => [number, number, number]) => {
      const q = new Quaternion()
      const e = new Euler()
      const values = times.flatMap(t => q.setFromEuler(e.set(...angles(t / duration * Math.PI * 2))).toArray())
      tracks.push(new QuaternionKeyframeTrack(`${bone}.quaternion`, times, values))
    }
    tracks.push(new VectorKeyframeTrack('root.position', times, times.flatMap(t => [0, seated ? -0.15 : name === 'walk' ? 0.006 * (1 - Math.cos(t / duration * Math.PI * 4)) : 0, 0])))
    rotation('torso', p => [name === 'work' ? 0.08 : 0.015 * Math.sin(p), 0, 0])
    if (female) rotation('ponytail', p => [0.035 * Math.sin(p), 0, name === 'walk' ? 0.09 * Math.sin(p) : 0.02 * Math.sin(p)])
    rotation('head', p => [name === 'read' ? 0.14 : 0.025 * Math.sin(p), name === 'wait' ? 0.10 * Math.sin(p) : 0, 0])
    for (const side of [-1, 1]) {
      const suffix = side > 0 ? 'left' : 'right'
      rotation(`leg-${suffix}`, p => [seated ? -Math.PI / 2 : name === 'walk' ? side * 0.55 * Math.sin(p) : 0, 0, 0])
      rotation(`shin-${suffix}`, p => [seated ? Math.PI / 2 : name === 'walk' ? Math.max(0, side * Math.sin(p)) * 0.65 : 0, 0, 0])
      rotation(`arm-${suffix}`, p => [seated ? -0.5 : name === 'coffee' && side < 0 ? -0.9 : name === 'walk' ? -side * 0.45 * Math.sin(p) : -0.08, 0, side * 0.07])
      rotation(`forearm-${suffix}`, p => [name === 'work' ? -0.95 + 0.06 * Math.sin(p * 8 + side) : name === 'read' ? -1.2 : name === 'coffee' && side < 0 ? -1.65 + 0.18 * Math.sin(p) : seated ? -0.6 : -0.08, 0, 0])
    }
    clips[name] = new AnimationClip(name, duration, tracks)
  }
  return { root: model, clips }
}
