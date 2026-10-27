import { BoxGeometry, CanvasTexture, CylinderGeometry, ExtrudeGeometry, Shape, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, type Scene } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { ZONE_ORIGIN, LAYOUT } from './layout'
import { instanceStaticMeshes } from './staticMeshes'

/** Static role-specific furnishings. No extra lights or per-frame canvas uploads. */
export function addRoleFurniture(scene: Scene) {
  const root = new Group()
  const materials = new Map<string, MeshStandardMaterial>()
  const cube = new BoxGeometry(1, 1, 1)
  const mat = (color: string) => {
    if (!materials.has(color)) materials.set(color, new MeshStandardMaterial({ color, roughness: 0.72 }))
    return materials.get(color)!
  }
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string) => {
    const mesh = new Mesh(cube, mat(color))
    mesh.position.set(x, y, z)
    mesh.scale.set(w, h, d)
    mesh.castShadow = true
    mesh.receiveShadow = true
    root.add(mesh)
    return mesh
  }
  const board = (zone: number) => {
    const o = ZONE_ORIGIN[zone]
    box(o.x + 2.1, 1.08, o.z - 1.05, 3.3, 1.2, 0.10, '#52666b')
    for (const dx of [0.65, 3.55]) {
      box(o.x + dx, 0.28, o.z - 1.05, 0.035, 0.56, 0.035, '#d1dcdd')
      box(o.x + dx, 0.025, o.z - 1.05, 0.12, 0.05, 0.35, '#d1dcdd')
    }
    const canvas = document.createElement('canvas')
    canvas.width = 768
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#f5f3e9'
    ctx.fillRect(0, 0, 768, 256)
    ctx.fillStyle = '#405762'
    ctx.font = 'bold 24px sans-serif'
    ctx.fillText('SYSTEM PLAN', 28, 36)
    const node = (x: number, y: number, label: string, color: string) => {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.roundRect(x, y, 170, 52, 10)
      ctx.fill()
      ctx.fillStyle = '#304a55'
      ctx.font = 'bold 20px sans-serif'
      ctx.fillText(label, x + 18, y + 33)
    }
    const arrow = (x: number, y: number, tx: number, ty: number) => {
      ctx.strokeStyle = '#5d7782'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(tx, ty)
      ctx.stroke()
      const angle = Math.atan2(ty - y, tx - x)
      ctx.beginPath()
      ctx.moveTo(tx - 10 * Math.cos(angle - 0.5), ty - 10 * Math.sin(angle - 0.5))
      ctx.lineTo(tx, ty)
      ctx.lineTo(tx - 10 * Math.cos(angle + 0.5), ty - 10 * Math.sin(angle + 0.5))
      ctx.stroke()
    }
    for (const y of [90, 192]) { arrow(210, y, 298, y); arrow(468, y, 558, y) }
    arrow(383, 116, 383, 166)
    node(40, 64, 'IDEA / PLAN', '#e8c886')
    node(298, 64, 'API', '#a5c9bd')
    node(558, 64, 'INTERFACE', '#a8c3db')
    node(40, 166, 'DATA', '#c8bfdc')
    node(298, 166, 'VERIFY', '#a5c9bd')
    node(558, 166, 'RELEASE', '#e8c886')
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    const face = new Mesh(new PlaneGeometry(3.18, 1.08), new MeshStandardMaterial({ map: texture, roughness: 0.9 }))
    face.position.set(o.x + 2.1, 1.08, o.z - 0.992)
    root.add(face)
  }
  board(0)

  const meeting = ZONE_ORIGIN[0]
  const outline = new Shape()
  const radius = 0.55, end = 4.25 / 2 - radius
  outline.moveTo(-end, -radius)
  outline.lineTo(end, -radius)
  outline.absarc(end, 0, radius, -Math.PI / 2, Math.PI / 2, false)
  outline.lineTo(-end, radius)
  outline.absarc(-end, 0, radius, Math.PI / 2, Math.PI * 1.5, false)
  outline.closePath()
  const table = new Mesh(new ExtrudeGeometry(outline, { depth: 0.05, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 24 }), mat('#c6a478'))
  table.rotation.x = -Math.PI / 2
  table.position.set(meeting.x + 2.11, 0.32, meeting.z + 0.75)
  table.castShadow = true
  table.receiveShadow = true
  root.add(table)
  for (const dx of [1, 3.2]) box(meeting.x + dx, 0.16, meeting.z + 0.75, 0.08, 0.32, 0.75, '#f3f3ef')
  for (const side of [-1, 1]) {
    for (const dx of [0.65, 2.11, 3.57]) {
      const laptop = new Group()
      laptop.add(box(0, 0, 0, 0.36, 0.016, 0.24, '#d4dbdf'))
      laptop.add(box(0, 0.010, -0.025, 0.30, 0.006, 0.105, '#52616c'))
      laptop.add(box(0, 0.010, 0.075, 0.12, 0.006, 0.055, '#b5c1c9'))
      const lid = new Group()
      lid.add(box(0, 0.115, 0, 0.36, 0.23, 0.014, '#cbd3da'))
      lid.add(box(0, 0.115, 0.009, 0.325, 0.195, 0.004, '#283e50'))
      for (let line = 0; line < 3; line++) lid.add(box(-0.025, 0.065 + line * 0.045, 0.013, 0.20 - line * 0.035, 0.012, 0.002, '#a2c6d2'))
      lid.position.z = -0.105
      lid.rotation.x = -0.14
      laptop.add(lid)
      laptop.rotation.y = side > 0 ? 0 : Math.PI
      laptop.position.set(meeting.x + dx, 0.39, meeting.z + 0.75 + side * 0.32)
      root.add(laptop)
    }
  }
  // Exactly one compact, low silver computer at each desktop workstation.
  const desktopMiniGeo = new RoundedBoxGeometry(0.105, 0.041, 0.105, 4, 0.005)
  const desktopMiniMat = new MeshStandardMaterial({ color: '#d9dee0', metalness: 0.42, roughness: 0.48 })
  const desktopMiniFootGeo = new CylinderGeometry(0.035, 0.035, 0.003, 24)
  const desktopMiniFootMat = mat('#42494b')
  for (const pc of LAYOUT.miniComputers) {
    const unit = new Group()
    unit.position.set(pc.x, pc.y, pc.z)
    unit.rotation.y = pc.yaw
    unit.scale.setScalar(pc.scale)
    const chassis = new Mesh(desktopMiniGeo, desktopMiniMat)
    chassis.position.y = 0.0235
    chassis.castShadow = true
    chassis.receiveShadow = true
    unit.add(chassis)
    const foot = new Mesh(desktopMiniFootGeo, desktopMiniFootMat)
    foot.position.y = 0.0015
    unit.add(foot)
    for (const x of [-0.022, -0.006]) unit.add(box(x, 0.021, -0.053, 0.009, 0.003, 0.001, '#50595b'))
    unit.add(box(0.034, 0.018, -0.053, 0.002, 0.002, 0.001, '#e7f2ec'))
    root.add(unit)
  }
  for (const seat of LAYOUT.seats.filter(s => s.zone === 2 || s.zone === 4)) {
    const desk = LAYOUT.items.find(i => i.model === 'desk' && i.zone === seat.zone && Math.abs(i.x - seat.x) < 0.01 && Math.abs(i.z - seat.z) < 0.65)
    if (!desk) continue
    const top = 0.38 * (desk.s ?? 1)
    const front = -Math.cos(seat.yaw)
    if (seat.zone === 2) {
      // Left is relative to the seated worker, mirrored across the facing rows.
      const scale = desk.s ?? 1
      const left = Math.cos(seat.yaw)
      const tx = desk.x + left * 0.45 * scale
      const tz = desk.z + front * 0.13 * scale
      const tablet = box(tx, top + 0.035, tz, 0.30 * scale, 0.025, 0.22 * scale, '#344953')
      tablet.rotation.x = front * 0.16
      const screen = box(tx, top + 0.052, tz, 0.25 * scale, 0.006, 0.17 * scale, '#b3d7d7')
      screen.rotation.x = front * 0.16
      box(tx, top + 0.059, tz, 0.10 * scale, 0.008, 0.07 * scale, '#d88d94')
      box(desk.x + left * 0.265 * scale, top + 0.014, tz, 0.014, 0.014, 0.20 * scale, '#46575e')
      for (let c = 0; c < 4; c++) box(tx + left * (-0.09 + c * 0.06) * scale, top + 0.064, tz + front * 0.055 * scale, 0.035 * scale, 0.006, 0.025 * scale, ['#dd9a8f', '#e3c47c', '#96bda9', '#a3afd0'][c])
    } else {
      box(desk.x + 0.37, top + 0.015, desk.z + front * 0.10, 0.18, 0.025, 0.24, '#f1eedf')
      for (let line = 0; line < 4; line++) box(desk.x + 0.37, top + 0.031, desk.z + front * (0.02 + line * 0.05), 0.12, 0.005, 0.012, '#6b9c8d')
    }
  }
  scene.add(root)
  const meshes: Mesh[] = []
  root.traverse(o => { if (o instanceof Mesh) meshes.push(o) })
  instanceStaticMeshes(root, meshes)
}
