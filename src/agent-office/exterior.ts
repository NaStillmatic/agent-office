import {
  CanvasTexture, LinearFilter, LinearMipmapLinearFilter, ShaderMaterial,
  SRGBColorSpace, Vector2, Vector3, Vector4, type Camera, type WebGLRenderer,
} from 'three'
import { D, W, WALL_SY, WINDOW_RADIUS } from './layout'
import { windowArc } from './windowGeometry'
import { skyAt } from './windowView'

const URLS = [
  new URL('./assets/scenery/seoul-river-day.png', import.meta.url).href,
  new URL('./assets/scenery/seoul-river-sunset.png', import.meta.url).href,
  new URL('./assets/scenery/seoul-river-night.png', import.meta.url).href,
]

/** Day → sunset → night, including the reverse transition at dawn. */
export function panoramaWeights(hour: number): [number, number, number] {
  const h = ((hour % 24) + 24) % 24
  if (h <= 5 || h >= 20) return [0, 0, 1]
  if (h < 6.5) { const t = (h - 5) / 1.5; return [0, t, 1 - t] }
  if (h < 8) { const t = (h - 6.5) / 1.5; return [t, 1 - t, 0] }
  if (h <= 16) return [1, 0, 0]
  if (h < 18) { const t = (h - 16) / 2; return [1 - t, t, 0] }
  const t = (h - 18) / 2
  return [0, 1 - t, t]
}

/** One screen-space image across both windows, with no corner warp or aspect distortion. */
export function panoramaBounds(camera: Camera, viewportAspect: number, imageAspect = 3) {
  let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity
  for (const [x, z] of [[W, 0], [0, D], ...windowArc(WINDOW_RADIUS).map(p => [p.x, p.z])]) {
    for (const y of [0, 1.29 * WALL_SY]) {
      const p = new Vector3(x, y, z).project(camera)
      left = Math.min(left, p.x); right = Math.max(right, p.x)
      bottom = Math.min(bottom, p.y); top = Math.max(top, p.y)
    }
  }
  const width = right - left, height = top - bottom
  // Fit the complete river-and-bridges composition without targeting a landmark.
  const fittedWidth = Math.max(width, height * imageAspect / viewportAspect)
  const fittedHeight = fittedWidth * viewportAspect / imageAspect
  return new Vector4((left + right - fittedWidth) / 2, (bottom + top - fittedHeight) / 2, fittedWidth, fittedHeight)
}

export function createSeoulBackdrop(renderer: WebGLRenderer) {
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 683
  const context = canvas.getContext('2d')!
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  const material = new ShaderMaterial({
    uniforms: { panorama: { value: texture }, bounds: { value: new Vector4() } },
    vertexShader: `
      varying vec4 screenPosition;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        screenPosition = gl_Position;
      }
    `,
    fragmentShader: `
      uniform sampler2D panorama;
      uniform vec4 bounds;
      varying vec4 screenPosition;
      void main() {
        vec2 uv = (screenPosition.xy / screenPosition.w - bounds.xy) / bounds.zw;
        gl_FragColor = vec4(texture2D(panorama, uv).rgb, 1.0);
        #include <colorspace_fragment>
      }
    `,
    toneMapped: false,
  })
  const images = URLS.map(() => new Image())
  let hour = 12
  let disposed = false
  const draw = () => {
    if (disposed) return
    const sky = skyAt(hour)
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height)
    gradient.addColorStop(0, sky.top)
    gradient.addColorStop(1, sky.bottom)
    context.globalAlpha = 1
    context.fillStyle = gradient
    context.fillRect(0, 0, canvas.width, canvas.height)
    const weights = panoramaWeights(hour)
    let total = 0
    images.forEach((image, i) => {
      if (!image.complete || !image.naturalWidth || weights[i] === 0) return
      total += weights[i]
      context.globalAlpha = weights[i] / total
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
    })
    context.globalAlpha = 1
    texture.needsUpdate = true
  }
  images.forEach((image, i) => { image.onload = draw; image.src = URLS[i] })
  draw()
  const size = new Vector2()
  return {
    material,
    syncCamera(camera: Camera) {
      renderer.getDrawingBufferSize(size)
      material.uniforms.bounds.value.copy(panoramaBounds(camera, size.x / size.y, canvas.width / canvas.height))
    },
    // Upload only on time changes or asset loads, never in the animation loop.
    update(nextHour: number) { if (nextHour !== hour) { hour = nextHour; draw() } },
    dispose() {
      disposed = true
      images.forEach(image => { image.onload = null })
      texture.dispose()
      material.dispose()
    },
  }
}
