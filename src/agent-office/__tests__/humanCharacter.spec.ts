import { describe, expect, it } from 'vitest'
import { AnimationMixer, Box3, Vector3, SkinnedMesh } from 'three'
import { createHumanCharacter, HUMAN_HEAD_TOP, HUMAN_SIT_BOTTOM } from '../humanCharacter'

describe('human office character', () => {
  it('keeps standing feet on the floor and the head below the label anchor', () => {
    for (let variant = 0; variant < 11; variant++) {
      const { root } = createHumanCharacter(variant, '#607d8b')
      const bounds = new Box3().setFromObject(root)
      expect(bounds.min.y).toBeCloseTo(0.002, 3)
      expect(bounds.max.y).toBeLessThanOrEqual(HUMAN_HEAD_TOP + 0.001)
      expect(root.getObjectByName('hand-right')).toBeDefined()
    }
  })

  it('binds every animation track and seats the thigh at the shared seat offset', () => {
    const { root, clips } = createHumanCharacter(0, '#607d8b')
    for (const clip of Object.values(clips)) {
      for (const track of clip.tracks) expect(root.getObjectByName(track.name.split('.')[0]!)).toBeDefined()
    }
    const mixer = new AnimationMixer(root)
    mixer.clipAction(clips.sit).play()
    mixer.update(0.1)
    root.updateMatrixWorld(true)
    const contact = root.getObjectByName('seat-contact-left')!.getWorldPosition(new Vector3())
    expect(contact.y).toBeCloseTo(HUMAN_SIT_BOTTOM, 3)
    // Moving the hands during typing must leave the seated hips in place.
    mixer.stopAllAction()
    mixer.clipAction(clips.work).play()
    mixer.update(0.2)
    expect(root.getObjectByName('root')!.position.y).toBeCloseTo(-0.15)
  })

  it('animates both hoodie variants with optional hats without losing bone bindings', () => {
    for (const gender of ['male', 'female'] as const) {
      for (const cap of [false, true]) {
        const { root, clips } = createHumanCharacter(0, '#75849d', { gender, cap })
        expect(Boolean(root.getObjectByName('snapback'))).toBe(cap)
        expect(Boolean(root.getObjectByName('ponytail'))).toBe(gender === 'female')
        expect(root.getObjectByName('hood')).toBeDefined()
        expect(new Box3().setFromObject(root).max.y).toBeLessThanOrEqual(HUMAN_HEAD_TOP)
        const mixer = new AnimationMixer(root)
        for (const clip of Object.values(clips)) {
          mixer.stopAllAction()
          mixer.clipAction(clip).play()
          mixer.update(clip.duration / 3)
          root.updateMatrixWorld(true)
          let skins = 0
          root.traverse(object => {
            if (!(object instanceof SkinnedMesh)) return
            skins++
            object.skeleton.update()
            const weights = object.geometry.getAttribute('skinWeight')
            for (let i = 0; i < weights.count; i++) expect(weights.getX(i) + weights.getY(i)).toBeCloseTo(1)
            object.computeBoundingBox()
            expect(Number.isFinite(object.boundingBox!.min.y)).toBe(true)
          })
          expect(skins).toBe(4)
        }
      }
    }
  })

})
