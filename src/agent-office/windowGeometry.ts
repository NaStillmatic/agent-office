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
