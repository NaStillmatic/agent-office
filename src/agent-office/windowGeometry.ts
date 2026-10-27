import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'

/** A quarter-circle with tangents matching the x=0 and z=0 window walls. */
export function windowArc(radius: number, segments = 48) {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const angle = Math.PI + Math.PI / 2 * i / segments
    return new Vector3(radius + radius * Math.cos(angle), 0, radius + radius * Math.sin(angle))
  })
}

export function curvedWindowGeometry(radius: number, height: number) {
  const points = windowArc(radius)
  const positions: number[] = [], uvs: number[] = [], indices: number[] = []
  points.forEach((p, i) => {
    positions.push(p.x, 0, p.z, p.x, height, p.z)
    uvs.push(i / (points.length - 1), 0, i / (points.length - 1), 1)
    if (i < points.length - 1) {
      const a = i * 2
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Rectangular curved trim whose end profiles match the straight window rails. */
export function curvedTrimGeometry(radius: number, bottom: number, top: number, outer: number, inner: number) {
  const points = windowArc(radius)
  const positions: number[] = []
  const point = (p: Vector3, offset: number, y: number) => {
    const nx = (radius - p.x) / radius
    const nz = (radius - p.z) / radius
    return [p.x + nx * offset, y, p.z + nz * offset]
  }
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    positions.push(...a, ...b, ...c, ...a, ...c, ...d)
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1]
    const ao = point(a, outer, bottom), ai = point(a, inner, bottom)
    const bo = point(b, outer, bottom), bi = point(b, inner, bottom)
    const A = point(a, outer, top), B = point(b, outer, top)
    const C = point(a, inner, top), D = point(b, inner, top)
    quad(A, C, D, B)
    quad(ao, bo, bi, ai)
    quad(ao, A, B, bo)
    quad(ai, bi, D, C)
    if (i === 0) quad(ao, ai, C, A)
    if (i === points.length - 2) quad(bo, B, D, bi)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}
