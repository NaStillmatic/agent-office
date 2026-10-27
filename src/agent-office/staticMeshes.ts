import { InstancedMesh, Matrix4, type Mesh, type Object3D, type Material } from 'three'

/** Batch only explicitly static, opaque leaf meshes with shared resources. */
export function instanceStaticMeshes(root: Object3D, meshes: Mesh[]) {
  root.updateMatrixWorld(true)
  const inverse = new Matrix4().copy(root.matrixWorld).invert()
  const matrix = new Matrix4()
  const groups = new Map<string, Mesh[]>()
  for (const mesh of meshes) {
    if (!mesh.visible || mesh.children.length || Array.isArray(mesh.material) || mesh.material.transparent) continue
    const key = `${mesh.geometry.uuid}:${mesh.material.uuid}:${mesh.castShadow}:${mesh.receiveShadow}`
    const group = groups.get(key)
    if (group) group.push(mesh)
    else groups.set(key, [mesh])
  }
  const batches: InstancedMesh[] = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const first = group[0]
    const batch = new InstancedMesh(first.geometry, first.material as Material, group.length)
    batch.castShadow = first.castShadow
    batch.receiveShadow = first.receiveShadow
    for (const [index, mesh] of group.entries()) {
      matrix.multiplyMatrices(inverse, mesh.matrixWorld)
      batch.setMatrixAt(index, matrix)
    }
    batch.instanceMatrix.needsUpdate = true
    batch.computeBoundingSphere()
    root.add(batch)
    for (const mesh of group) mesh.removeFromParent()
    batches.push(batch)
  }
  return batches
}
