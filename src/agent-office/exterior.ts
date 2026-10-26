import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, ShaderMaterial, SRGBColorSpace, Vector2, Vector3, type Camera } from 'three'
import { D, W, WALL_SY } from './layout'
import { nightness, skyAt } from './windowView'

const DAY_URL = new URL('./assets/scenery/seoul-day-pixel-detail.png', import.meta.url).href
const NIGHT_URL = new URL('./assets/scenery/seoul-night-pixel-detail.png', import.meta.url).href

/** A corner-window panorama sampled from a shared eye point inside the office. */
export function createSeoulPixelBackdrop(maxAnisotropy = 1) {
  const canvas = document.createElement('canvas')
  canvas.width = 3840
  canvas.height = 1280
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  // Keep the source detail and filter the panorama at oblique window angles.
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.anisotropy = Math.min(16, maxAnisotropy)
  texture.generateMipmaps = true
  const material = new ShaderMaterial({
    uniforms: {
      panorama: { value: texture },
      panoramaTexel: { value: new Vector2(1 / canvas.width, 1 / canvas.height) },
      elapsed: { value: 0 },
      nightAmount: { value: 0 },
      viewOrigin: { value: new Vector3(W / 2, 1.08, D / 2) },
      cornerAzimuth: { value: Math.atan2(D / 2, W / 2) },
      flatProjection: { value: new Vector2(0, 1) },
      cornerBend: { value: 0.035 },
      riverAnchor: { value: 0.6 },
      verticalBounds: { value: new Vector2(0, 1) },
    },
    vertexShader: `
      varying vec3 worldPosition;
      varying vec2 glassUV;
      varying vec4 clipPosition;
      void main() {
        glassUV = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        worldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
        clipPosition = gl_Position;
      }
    `,
    fragmentShader: `
      uniform sampler2D panorama;
      uniform vec2 panoramaTexel;
      uniform float elapsed;
      uniform float nightAmount;
      uniform vec3 viewOrigin;
      uniform float cornerAzimuth;
      uniform vec2 flatProjection;
      uniform float cornerBend;
      uniform float riverAnchor;
      uniform vec2 verticalBounds;
      varying vec3 worldPosition;
      varying vec2 glassUV;
      varying vec4 clipPosition;
      // Gently translate each boat and its immediate water patch; the panorama stays fixed.
      vec2 floatingBoat(vec2 uv, vec2 center, float phase) {
        vec2 local = uv - center;
        float mask = 1.0 - smoothstep(0.62, 1.0, length(local / vec2(0.026, 0.023)));
        float bob = sin(elapsed * 0.65 + phase) * 0.0032 + sin(elapsed * 1.1 + phase) * 0.0006;
        float roll = sin(elapsed * 0.47 + phase) * 0.012;
        return uv + vec2(0.0, (bob + local.x * roll) * mask);
      }
      vec3 crispPanorama(vec2 uv) {
        // A small mip bias preserves window detail at oblique angles. Gentle
        // local contrast offsets the softness of enlarging the source image.
        vec3 center = texture2D(panorama, uv, -0.5).rgb;
        vec3 neighbors = (
          texture2D(panorama, uv + vec2(panoramaTexel.x, 0.0), -0.5).rgb
          + texture2D(panorama, uv - vec2(panoramaTexel.x, 0.0), -0.5).rgb
          + texture2D(panorama, uv + vec2(0.0, panoramaTexel.y), -0.5).rgb
          + texture2D(panorama, uv - vec2(0.0, panoramaTexel.y), -0.5).rgb
        ) * 0.25;
        return clamp(center + (center - neighbors) * 0.2, 0.0, 1.0);
      }
      void main() {
        vec3 direction = worldPosition - viewOrigin;
        float azimuth = atan(-direction.z, -direction.x);
        float elevation = atan(direction.y, length(direction.xz));
        float screenY = clipPosition.y / clipPosition.w;
        float levelView = 0.47 + (screenY - flatProjection.x) * flatProjection.y;
        float cornerView = 0.47 + elevation * 2.0;
        // Distant scenery has a nearly level horizon, with only a restrained corner cue.
        float scenicY = mix(levelView, cornerView, cornerBend);
        // Balance each window's near bank, river and far city without stretching a thin image strip.
        float normalizedY = clamp((scenicY - verticalBounds.x) / (verticalBounds.y - verticalBounds.x), 0.0, 1.0);
        float viewY = mix(normalizedY, glassUV.y, 0.04);
        float normalizedAnchor = (riverAnchor - verticalBounds.x) / (verticalBounds.y - verticalBounds.x);
        float riverCenter = mix(normalizedAnchor, 0.0, 0.04);
        float nearBank = riverCenter - 0.12;
        float farBank = riverCenter + 0.12;
        float panoramaY = viewY < nearBank
          ? mix(0.02, 0.33, clamp(viewY / nearBank, 0.0, 1.0))
          : viewY < farBank
            ? mix(0.33, 0.48, (viewY - nearBank) / (farBank - nearBank))
            : mix(0.48, 0.93, clamp((viewY - farBank) / (1.0 - farBank), 0.0, 1.0));
        // Align the middle of the horizontal river panorama with the window junction.
        vec2 uv = vec2(0.515 + (azimuth - cornerAzimuth) / 3.8, panoramaY);
        vec2 sampleUV = floatingBoat(uv, vec2(0.276, 0.395), 0.0);
        sampleUV = floatingBoat(sampleUV, vec2(0.738, 0.385), 2.1);
        vec3 color = crispPanorama(sampleUV);
        // Sparse river glints animate on the GPU without uploading the large panorama each frame.
        vec2 cell = floor(uv * vec2(32.0, 85.0));
        vec2 point = fract(uv * vec2(32.0, 85.0));
        float seed = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
        float glint = step(0.91, seed) * (1.0 - smoothstep(0.08, 0.16, abs(point.y - 0.5)))
          * (1.0 - smoothstep(0.1, 0.4, abs(point.x - 0.5)))
          * max(0.0, sin(elapsed * 0.42 + seed * 24.0));
        glint *= smoothstep(0.33, 0.35, uv.y) * (1.0 - smoothstep(0.44, 0.47, uv.y));
        color = mix(color, mix(vec3(0.88, 0.94, 0.96), vec3(0.94, 0.83, 0.62), nightAmount), glint * 0.06);
        float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
        // Atmospheric perspective separates the far skyline from the nearer rooftops.
        float distanceHaze = smoothstep(0.12, 0.78, uv.y);
        color = mix(color, vec3(luminance), mix(0.18, 0.38, distanceHaze));
        color = mix(color, vec3(0.74, 0.80, 0.83), mix(0.045, 0.18, distanceHaze));
        float diagonal = glassUV.x + glassUV.y * 0.2;
        float sheen = smoothstep(0.45, 0.49, diagonal) - smoothstep(0.53, 0.58, diagonal);
        gl_FragColor = vec4(mix(color, vec3(0.85, 0.92, 0.96), sheen * 0.025), 1.0);
        #include <colorspace_fragment>
      }
    `,
    toneMapped: false,
  })
  const day = new Image()
  const night = new Image()
  let hour = 12
  let disposed = false

  const drawImage = (image: HTMLImageElement, alpha: number) => {
    if (!image.complete || !image.naturalWidth || alpha <= 0) return false
    const context = canvas.getContext('2d')!
    context.globalAlpha = alpha
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return true
  }
  const animate = (time: number) => {
    if (!disposed) material.uniforms.elapsed.value = time
  }
  const draw = () => {
    if (disposed) return
    const context = canvas.getContext('2d')!
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.globalAlpha = 1
    const sky = skyAt(hour)
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height)
    gradient.addColorStop(0, sky.top)
    gradient.addColorStop(1, sky.bottom)
    context.fillStyle = gradient
    context.fillRect(0, 0, canvas.width, canvas.height)
    drawImage(day, 1)
    drawImage(night, nightness(hour))
    context.globalAlpha = 1
    texture.needsUpdate = true
  }
  day.onload = night.onload = draw
  day.src = DAY_URL
  night.src = NIGHT_URL

  return {
    material,
    syncCamera(camera: Camera) {
      const horizon = new Vector3(0, 1.08, 0).project(camera)
      const above = new Vector3(0, 2.08, 0).project(camera)
      const texturePerMeter = 2 / Math.hypot(W / 2, D / 2)
      const scale = texturePerMeter / Math.max(0.0001, above.y - horizon.y)
      material.uniforms.flatProjection.value.set(horizon.y, scale)
      const blend = material.uniforms.cornerBend.value as number
      let min = Infinity, max = -Infinity
      for (const [x, z] of [[0, 0], [W, 0], [0, D]]) {
        for (const y of [0, 1.29 * WALL_SY]) {
          const projected = new Vector3(x, y, z).project(camera)
          const level = 0.47 + (projected.y - horizon.y) * scale
          const corner = 0.47 + Math.atan2(y - 1.08, Math.hypot(x - W / 2, z - D / 2)) * 2
          const value = level * (1 - blend) + corner * blend
          min = Math.min(min, value)
          max = Math.max(max, value)
        }
      }
      // Anchor mid-river at the corner base and allocate less of each window to near-bank land.
      const anchorY = 0
      const anchor = new Vector3(0, anchorY, 0).project(camera)
      const level = 0.47 + (anchor.y - horizon.y) * scale
      const corner = 0.47 + Math.atan2(anchorY - 1.08, Math.hypot(W / 2, D / 2)) * 2
      material.uniforms.riverAnchor.value = level * (1 - blend) + corner * blend
      // Fit the complete near-bank → river → far-bank scene without stretching the last image row.
      material.uniforms.verticalBounds.value.set(min, max)
    },
    update(nextHour: number) { hour = nextHour; material.uniforms.nightAmount.value = nightness(hour); draw() },
    animate,
    dispose() {
      disposed = true
      day.onload = night.onload = null
      material.dispose()
      texture.dispose()
    },
  }
}
