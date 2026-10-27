import { describe, expect, it, vi } from 'vitest'
import { Texture, TextureLoader } from 'three'
import { baristaFrame, createSpritePerson, spriteDirection, spriteFrame } from '../spriteCharacters'

describe('2D character frames', () => {
  it('selects front, back and mirrored side views relative to the fixed camera', () => {
    expect(spriteDirection(Math.PI / 4)).toEqual({ column: 0, mirrored: false })
    expect(spriteDirection(5 * Math.PI / 4).column).toBe(2)
    expect(spriteDirection(3 * Math.PI / 4)).toEqual({ column: 1, mirrored: false })
    expect(spriteDirection(-Math.PI / 4)).toEqual({ column: 1, mirrored: true })
  })

  it('cycles the barista through pitcher, machine and pouring poses', () => {
    expect([0, 1.2, 2.4, 3.5].map(baristaFrame)).toEqual([0, 1, 2, 0])
  })

  it('uses seated frames for work and alternates walking with a passing pose', () => {
    expect(spriteFrame(0, 'work', 0).seated).toBe(true)
    expect(spriteFrame(0, 'work', 0).row).toBe(2)
    expect(spriteFrame(0, 'work', 0).typing).toBe(false)
    expect(spriteFrame(0, 'work', 0.26).typing).toBe(true)
    expect(spriteFrame(0, 'read', 0.26).typing).toBe(false)
    expect(spriteFrame(0, 'walk', 0).passing).toBe(false)
    expect(spriteFrame(0, 'walk', 0.23).passing).toBe(true)
    expect(spriteFrame(0, 'walk', 0.46).passing).toBe(false)
    expect(spriteFrame(0, 'walk', 0.46).stepping).toBe(true)
    expect(spriteFrame(0, 'idle', 0).row).toBe(0)
    expect(spriteFrame(0, 'coffee', 0).coffee).toBe(true)
  })

  it('keeps the last loaded atlas visible until a new pose texture has loaded', () => {
    const images: { complete: boolean; naturalWidth: number }[] = []
    const load = vi.spyOn(TextureLoader.prototype, 'load').mockImplementation(() => {
      const image = { complete: false, naturalWidth: 0 }
      images.push(image)
      return new Texture(image as unknown as HTMLImageElement)
    })
    try {
      const person = createSpritePerson('male')
      person.update(0, 'idle', 0, null, 0)
      expect(person.sprite.visible).toBe(false)
      images[0].complete = true
      images[0].naturalWidth = 1448
      person.update(0, 'idle', 0, null, 0)
      expect(person.sprite.visible).toBe(true)
      const atlas = person.sprite.material.map
      person.update(0, 'walk', 0.23, null, 0)
      expect(person.sprite.material.map).toBe(atlas)
      images[1].complete = true
      images[1].naturalWidth = 2172
      person.update(0, 'walk', 0.23, null, 0)
      expect(person.sprite.material.map).not.toBe(atlas)
      person.update(0, 'work', 0.26, 0.3, 0.1)
      expect(person.sprite.material.map).toBe(atlas)
      images[2].complete = true
      images[2].naturalWidth = 2046
      person.update(0, 'work', 0.26, 0.3, 0.1)
      expect(person.sprite.material.map).not.toBe(atlas)
      person.dispose()
    } finally {
      load.mockRestore()
    }
  })

})
