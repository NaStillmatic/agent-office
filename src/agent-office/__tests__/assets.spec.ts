import { BoxGeometry, Mesh, MeshBasicMaterial } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'

const loader = vi.hoisted(() => ({ loadAsync: vi.fn() }))
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class { loadAsync = loader.loadAsync },
}))

import { loadOfficeAssets, releaseOfficeAssets } from '../assets'

describe('office asset loading', () => {
  afterEach(() => { releaseOfficeAssets(); loader.loadAsync.mockReset() })

  it('loads requested furniture without depending on legacy character GLBs', async () => {
    loader.loadAsync.mockResolvedValue({ scene: new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()) })
    const assets = await loadOfficeAssets(['desk', 'chairDesk'])
    expect([...assets.furniture.keys()]).toEqual(['desk', 'chairDesk'])
    expect(loader.loadAsync).toHaveBeenCalledTimes(2)
    expect(loader.loadAsync.mock.calls.map(([url]) => url)).toEqual([
      expect.stringContaining('desk'), expect.stringContaining('chairDesk'),
    ])
  })
})
