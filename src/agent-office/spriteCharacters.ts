import { Color, LinearFilter, SRGBColorSpace, Sprite, SpriteMaterial, Texture, TextureLoader } from 'three'
import maleAtlasUrl from './assets/sprites/developer-male-atlas.png'
import femaleAtlasUrl from './assets/sprites/developer-female-atlas.png'
import malePassingUrl from './assets/sprites/developer-male-passing.png'
import femalePassingUrl from './assets/sprites/developer-female-passing.png'
import maleCapAtlasUrl from './assets/sprites/developer-male-cap-atlas.png'
import femaleCapAtlasUrl from './assets/sprites/developer-female-cap-atlas.png'
import maleCapPassingUrl from './assets/sprites/developer-male-cap-passing.png'
import femaleCapPassingUrl from './assets/sprites/developer-female-cap-passing.png'
import maleCoffeeUrl from './assets/sprites/developer-male-coffee.png'
import femaleCoffeeUrl from './assets/sprites/developer-female-coffee.png'
import maleCapCoffeeUrl from './assets/sprites/developer-male-cap-coffee.png'
import femaleCapCoffeeUrl from './assets/sprites/developer-female-cap-coffee.png'

import maleTypingUrl from './assets/sprites/developer-male-typing.png'
import femaleTypingUrl from './assets/sprites/developer-female-typing.png'
import maleCapTypingUrl from './assets/sprites/developer-male-cap-typing.png'
import femaleCapTypingUrl from './assets/sprites/developer-female-cap-typing.png'

import baristaWorkUrl from './assets/sprites/barista-work.png'
import maleStepUrl from './assets/sprites/developer-male-step.png'
import femaleStepUrl from './assets/sprites/developer-female-step.png'
import maleCapStepUrl from './assets/sprites/developer-male-cap-step.png'
import femaleCapStepUrl from './assets/sprites/developer-female-cap-step.png'


export type SpriteAction = 'idle' | 'walk' | 'sit' | 'work' | 'read' | 'wait' | 'coffee'
type Gender = 'male' | 'female'
type Rect = readonly [number, number, number, number]
type Sheet = { width: number; height: number; frames: readonly (readonly Rect[])[]; url: string }
type SheetSet = { atlas: Sheet; passing: Sheet; step: Sheet; coffee: Sheet; typing: Sheet }

// Actual pixel bounds, not a regular grid: the artwork has uneven gutters.
const sheets: Record<Gender, SheetSet> = {
  male: {
    atlas: { width: 1448, height: 1086, url: maleAtlasUrl, frames: [
      [[134, 12, 288, 396], [476, 12, 648, 396], [817, 15, 976, 396], [1167, 15, 1339, 396]],
      [[106, 402, 289, 753], [463, 406, 668, 753], [811, 404, 992, 753], [1166, 404, 1378, 753]],
      [[101, 754, 316, 1079], [472, 757, 670, 1076], [841, 758, 1030, 1072], [1177, 758, 1383, 1077]],
    ] },
    step: { width: 2172, height: 724, url: maleStepUrl, frames: [[[113, 38, 488, 701], [646, 34, 1078, 699], [1226, 38, 1582, 701], [1730, 34, 2164, 699]]] },
    typing: { width: 2046, height: 768, url: maleTypingUrl, frames: [[[56, 82, 485, 735], [588, 80, 990, 728], [1129, 86, 1512, 726], [1663, 81, 2046, 731]]] },
    coffee: { width: 2172, height: 724, url: maleCoffeeUrl, frames: [[[230, 15, 507, 712], [740, 15, 1000, 712], [1206, 18, 1488, 711], [1692, 15, 1950, 712]]] },
    passing: { width: 2172, height: 724, url: malePassingUrl, frames: [
      [[149, 17, 481, 709], [698, 17, 1000, 711], [1192, 19, 1503, 709], [1738, 17, 2033, 711]],
    ] },
  },
  female: {
    atlas: { width: 1024, height: 1536, url: femaleAtlasUrl, frames: [
      [[58, 31, 247, 542], [299, 36, 489, 542], [564, 40, 738, 538], [797, 37, 981, 544]],
      [[29, 557, 244, 1055], [274, 570, 538, 1055], [565, 569, 759, 1055], [770, 569, 1024, 1051]],
      [[32, 1071, 267, 1507], [276, 1073, 522, 1497], [542, 1077, 767, 1478], [778, 1073, 1019, 1505]],
    ] },
    step: { width: 2172, height: 724, url: femaleStepUrl, frames: [[[127, 11, 521, 719], [617, 14, 1088, 710], [1198, 14, 1558, 717], [1653, 14, 2124, 712]]] },
    typing: { width: 1999, height: 787, url: femaleTypingUrl, frames: [[[47, 24, 471, 780], [509, 22, 980, 779], [1044, 22, 1475, 770], [1513, 22, 1981, 780]]] },
    coffee: { width: 2172, height: 724, url: femaleCoffeeUrl, frames: [[[239, 7, 504, 721], [702, 6, 981, 722], [1210, 12, 1475, 716], [1654, 9, 1947, 722]]] },
    passing: { width: 1774, height: 887, url: femalePassingUrl, frames: [
      [[81, 22, 398, 862], [496, 24, 869, 860], [975, 28, 1300, 858], [1402, 26, 1721, 860]],
    ] },
  },
}

const capSheets: Record<Gender, SheetSet> = {
  male: {
    atlas: { width: 1448, height: 1086, url: maleCapAtlasUrl, frames: [
      [[136, 6, 302, 396], [489, 8, 668, 396], [842, 12, 1007, 396], [1202, 5, 1382, 396]],
      [[107, 400, 297, 753], [476, 401, 690, 753], [835, 402, 1025, 753], [1201, 400, 1422, 753]],
      [[99, 753, 323, 1081], [485, 753, 692, 1078], [866, 757, 1062, 1073], [1215, 753, 1428, 1079]],
    ] },
    passing: { width: 2172, height: 724, url: maleCapPassingUrl, frames: [[[146, 7, 481, 709], [694, 10, 1000, 712], [1187, 13, 1501, 710], [1731, 11, 2030, 712]]] },
    step: { width: 2172, height: 724, url: maleCapStepUrl, frames: [[[97, 22, 499, 699], [632, 20, 1059, 699], [1211, 26, 1575, 698], [1731, 15, 2146, 700]]] },
    typing: { width: 2172, height: 724, url: maleCapTypingUrl, frames: [[[47, 29, 519, 710], [635, 30, 1088, 704], [1204, 30, 1624, 706], [1773, 29, 2172, 704]]] },
    coffee: { width: 2172, height: 724, url: maleCapCoffeeUrl, frames: [[[205, 7, 499, 711], [721, 8, 1003, 711], [1174, 9, 1487, 709], [1691, 8, 1999, 711]]] },
  },
  female: {
    atlas: { width: 1024, height: 1536, url: femaleCapAtlasUrl, frames: [
      [[58, 17, 254, 542], [299, 29, 492, 542], [564, 28, 739, 539], [798, 29, 986, 542]],
      [[29, 547, 244, 1055], [275, 555, 538, 1055], [566, 558, 760, 1055], [770, 558, 1024, 1052]],
      [[31, 1057, 267, 1507], [275, 1057, 522, 1497], [543, 1070, 767, 1478], [780, 1058, 1019, 1506]],
    ] },
    passing: { width: 1774, height: 887, url: femaleCapPassingUrl, frames: [[[79, 25, 401, 862], [498, 23, 873, 861], [971, 26, 1303, 859], [1405, 28, 1757, 861]]] },
    step: { width: 2172, height: 724, url: femaleCapStepUrl, frames: [[[52, 6, 472, 717], [602, 7, 1070, 714], [1208, 8, 1554, 719], [1683, 7, 2150, 713]]] },
    typing: { width: 2172, height: 724, url: femaleCapTypingUrl, frames: [[[96, 16, 527, 715], [617, 13, 1068, 714], [1169, 20, 1580, 694], [1643, 14, 2092, 714]]] },
    coffee: { width: 2172, height: 724, url: femaleCapCoffeeUrl, frames: [[[235, 9, 494, 713], [705, 8, 970, 714], [1218, 10, 1464, 706], [1701, 9, 1963, 714]]] },
  },
}

/** The fixed office camera sits at a 45-degree azimuth. */
export function spriteDirection(yaw: number): { column: number; mirrored: boolean } {
  const relative = yaw - Math.PI / 4
  const facing = Math.cos(relative)
  const mirrored = Math.sin(relative) < 0
  return { column: facing > 0.5 ? 0 : facing < -0.5 ? 2 : 1, mirrored }
}

export function spriteFrame(yaw: number, action: SpriteAction, seconds: number) {
  const direction = spriteDirection(yaw)
  const seated = action === 'sit' || action === 'work' || action === 'read' || action === 'wait'
  const walkPhase = action === 'walk' ? Math.floor(seconds * 4.5) % 4 : 0
  const passing = action === 'walk' && walkPhase % 2 === 1
  const stepping = action === 'walk' && walkPhase === 2
  const typing = action === 'work' && Math.floor(seconds * 4) % 2 === 1
  return { ...direction, row: seated ? 2 : action === 'walk' ? 1 : 0, seated, passing, stepping, coffee: action === 'coffee', typing }
}

const sourceTextures = new Map<string, Texture>()
function textureFor(url: string) {
  let texture = sourceTextures.get(url)
  if (!texture) {
    texture = new TextureLoader().load(url)
    texture.colorSpace = SRGBColorSpace
    texture.magFilter = LinearFilter
    texture.minFilter = LinearFilter
    texture.generateMipmaps = false
    sourceTextures.set(url, texture)
  }
  return texture
}

function imageReady(texture: Texture): boolean {
  const image = texture.image as HTMLImageElement | undefined
  return !!image?.complete && image.naturalWidth > 0
}

export interface SpritePerson {
  sprite: Sprite
  update(yaw: number, action: SpriteAction, seconds: number, seatTop: number | null, holderY: number): void
  dispose(): void
}

export function createSpritePerson(gender: Gender, cap = false, clothingColor = gender === 'female' ? '#879c86' : '#75849d'): SpritePerson {
  const pair = cap ? capSheets[gender] : sheets[gender]
  const atlas = textureFor(pair.atlas.url).clone()
  const passing = textureFor(pair.passing.url).clone()
  let step: Texture | null = null
  let coffee: Texture | null = null
  let typing: Texture | null = null
  atlas.needsUpdate = true
  passing.needsUpdate = true
  const material = new SpriteMaterial({ map: atlas, color: new Color('#ffffff'), transparent: true, alphaTest: 0.08, depthWrite: true, toneMapped: false })
  // Recolor the blue/green hoodie only; retain skin, hair, denim and highlights.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.hoodieColor = { value: new Color(clothingColor) }
    shader.uniforms.hoodieIsFemale = { value: gender === 'female' ? 1 : 0 }
    shader.vertexShader = shader.vertexShader.replace('void main() {', 'varying vec2 hoodieLocalUv;\nvoid main() {\n hoodieLocalUv = uv;')
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying vec2 hoodieLocalUv;\nuniform vec3 hoodieColor;\nuniform float hoodieIsFemale;\nvoid main() {')
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 src = diffuseColor.rgb;
        float blue = smoothstep(0.006, 0.035, src.b - src.g) * smoothstep(0.006, 0.035, src.b - src.r);
        float green = smoothstep(0.006, 0.035, src.g - src.b) * smoothstep(-0.015, 0.02, src.g - src.r);
        float garment = smoothstep(0.36, 0.43, hoodieLocalUv.y) * (1.0 - smoothstep(0.80, 0.86, hoodieLocalUv.y));
        float shade = dot(src, vec3(0.2126, 0.7152, 0.0722));
        float targetShade = max(dot(hoodieColor, vec3(0.2126, 0.7152, 0.0722)), 0.10);
        vec3 recolored = clamp(hoodieColor * (shade / targetShade), 0.0, 1.0);
        float mask = mix(blue, green, hoodieIsFemale) * garment * smoothstep(0.018, 0.05, shade);
        diffuseColor.rgb = mix(src, recolored, mask * 0.85);
      `)
  }
  material.customProgramCacheKey = () => 'sprite-hoodie-recolor-v1'
  const sprite = new Sprite(material)
  sprite.userData.clothingColor = clothingColor
  sprite.center.set(0.5, 0)
  sprite.frustumCulled = false
  let lastFrame = ''
  return {
    sprite,
    update(yaw, action, seconds, seatTop, holderY) {
      const frame = spriteFrame(yaw, action, seconds)
      let sheet = frame.typing ? pair.typing : frame.coffee ? pair.coffee : frame.passing ? pair.passing : frame.stepping ? pair.step : pair.atlas
      if (frame.stepping && !step) {
        step = textureFor(pair.step.url).clone()
        step.needsUpdate = true
      }
      if (frame.typing && !typing) {
        typing = textureFor(pair.typing.url).clone()
        typing.needsUpdate = true
      }
      if (frame.coffee && !coffee) {
        coffee = textureFor(pair.coffee.url).clone()
        coffee.needsUpdate = true
      }
      let map = frame.typing ? typing! : frame.coffee ? coffee! : frame.passing ? passing : frame.stepping ? step! : atlas
      let row = frame.typing || frame.passing || frame.stepping || frame.coffee ? 0 : frame.row
      if (!imageReady(map)) {
        sheet = pair.atlas
        map = atlas
        row = frame.row
      }
      sprite.visible = imageReady(map)
      const rect = sheet.frames[row][frame.column]
      const [left, top, right, bottom] = rect
      const frameKey = `${sheet.url}:${row}:${frame.column}:${frame.mirrored}`
      const height = frame.seated ? 0.76 : 0.92
      if (frameKey !== lastFrame) {
        const u = (right - left) / sheet.width
        map.repeat.set(frame.mirrored ? -u : u, (bottom - top) / sheet.height)
        map.offset.set(frame.mirrored ? right / sheet.width : left / sheet.width, 1 - bottom / sheet.height)
        material.map = map
        sprite.scale.set(height * (right - left) / (bottom - top), height, 1)
        lastFrame = frameKey
      }
      // Seated artwork includes bent legs; line its hips up with the seat.
      const bottomY = frame.seated && seatTop !== null ? seatTop - height * 0.42 - holderY : 0
      const bob = action === 'walk' ? 0.006 * Math.abs(Math.sin(seconds * Math.PI * 4.5)) : 0
      sprite.position.set(0, bottomY + bob, 0)
    },
    dispose() {
      atlas.dispose()
      passing.dispose()
      step?.dispose()
      coffee?.dispose()
      typing?.dispose()
      material.dispose()
    },
  }
}

/** Three anchored frames: pitcher, machine control, and pouring. */
export function baristaFrame(seconds: number) {
  return Math.floor(Math.max(0, seconds) / 1.15) % 3
}

export function createBaristaSprite(): SpritePerson {
  const texture = textureFor(baristaWorkUrl).clone()
  texture.needsUpdate = true
  const material = new SpriteMaterial({ map: texture, color: new Color('#ffffff'), transparent: true, alphaTest: 0.08, depthWrite: true, toneMapped: false })
  const sprite = new Sprite(material)
  sprite.center.set(0.5, 0)
  sprite.frustumCulled = false
  sprite.visible = false
  const frames = [
    { rect: [220, 16, 468, 876], anchor: 333 },
    { rect: [628, 15, 1025, 876], anchor: 886 },
    { rect: [1295, 16, 1579, 876], anchor: 1441 },
  ]
  let lastFrame = -1
  return {
    sprite,
    update(_yaw, _action, seconds) {
      sprite.visible = imageReady(texture)
      const frame = baristaFrame(seconds)
      if (frame === lastFrame) return
      const { rect, anchor } = frames[frame]
      const [left, top, right, bottom] = rect
      texture.repeat.set((right - left) / 1774, (bottom - top) / 887)
      texture.offset.set(left / 1774, 1 - bottom / 887)
      sprite.center.set((anchor - left) / (right - left), 0)
      sprite.scale.set(0.92 * (right - left) / (bottom - top), 0.92, 1)
      lastFrame = frame
    },
    dispose() { texture.dispose(); material.dispose() },
  }
}
