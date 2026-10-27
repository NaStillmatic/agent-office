import { BoxGeometry, Group, Matrix4, Mesh, MeshBasicMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { instanceStaticMeshes } from '../staticMeshes'

describe('고정 가구 인스턴싱', () => {
  it('회전·비균일 크기·부모 위치를 유지하며 반복 부품을 묶는다', () => {
    const root = new Group()
    root.position.set(2, 0, 3)
    const parent = new Group()
    parent.position.set(4, 1, 2)
    parent.rotation.y = Math.PI / 2
    parent.scale.set(1.4, 0.8, 1.1)
    root.add(parent)
    const geometry = new BoxGeometry()
    const material = new MeshBasicMaterial()
    const meshes = [new Mesh(geometry, material), new Mesh(geometry, material)]
    for (const [i, mesh] of meshes.entries()) {
      mesh.position.set(i + 1, 0.3, 0.5)
      mesh.castShadow = mesh.receiveShadow = true
      parent.add(mesh)
    }
    root.updateMatrixWorld(true)
    const expected = meshes.map((mesh) => mesh.matrixWorld.clone())
    const [batch] = instanceStaticMeshes(root, meshes)
    root.updateMatrixWorld(true)
    expect(batch.count).toBe(2)
    expect(batch.castShadow && batch.receiveShadow).toBe(true)
    for (const [i, mesh] of meshes.entries()) {
      const actual = new Matrix4()
      batch.getMatrixAt(i, actual)
      actual.premultiply(batch.matrixWorld)
      actual.elements.forEach((value, j) => expect(value).toBeCloseTo(expected[i].elements[j], 5))
      expect(mesh.parent).toBeNull()
    }
  })

  it('표시를 전환하는 화면과 투명 부품은 개별 메시로 유지한다', () => {
    const root = new Group()
    const geometry = new BoxGeometry()
    const opaque = new MeshBasicMaterial()
    const transparent = new MeshBasicMaterial({ transparent: true, opacity: 0.5 })
    const screen = new Mesh(geometry, opaque)
    const content = new Mesh(geometry, opaque)
    content.visible = false
    screen.add(content)
    const glass = new Mesh(geometry, transparent)
    const glass2 = new Mesh(geometry, transparent)
    root.add(screen, glass, glass2)
    expect(instanceStaticMeshes(root, [screen, content, glass, glass2])).toEqual([])
    expect(content.parent).toBe(screen)
    content.visible = true
    expect(content.visible).toBe(true)
    expect(glass.parent).toBe(root)
  })

  it('재질이나 그림자 설정이 다른 부품을 섞지 않는다', () => {
    const root = new Group()
    const geometry = new BoxGeometry()
    const material = new MeshBasicMaterial()
    const a = new Mesh(geometry, material)
    const b = new Mesh(geometry, material)
    const c = new Mesh(geometry, material.clone())
    b.castShadow = true
    root.add(a, b, c)
    expect(instanceStaticMeshes(root, [a, b, c])).toEqual([])
    expect(root.children).toHaveLength(3)
  })
})
