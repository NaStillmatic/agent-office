<template>
  <div ref="pageEl" class="office-page">
    <header class="office-toolbar">
      <div class="office-hud">
        <span class="hud-chip title">{{ m.appTitle }}</span>
        <span class="hud-chip" :class="connected ? 'on' : 'off'">
          {{ connected ? m.connected : m.disconnected }}
        </span>
        <span v-if="liveCount" class="hud-chip">{{ m.sessionsChip(busyCount, liveCount - busyCount) }}</span>
        <span v-if="liveCount > ZONE_COUNT" class="hud-chip warn">{{ m.zonesLimit(ZONE_COUNT) }}</span>
        <span class="hud-chip dim">{{ m.localOnly }}</span>
      </div>

      <div class="hud-actions">
        <select v-model="locale" class="hud-lang" :title="m.language" :aria-label="m.language">
          <option v-for="l in LOCALES" :key="l" :value="l">{{ LOCALE_NAMES[l] }}</option>
        </select>
        <button
          type="button"
          role="switch"
          class="hud-switch"
          :aria-checked="showProject"
          :title="m.projectSwitchTitle"
          @click="showProject = !showProject"
        >
          <span class="track"><i /></span>{{ m.projectSwitch }}
        </button>
        <button
          type="button"
          class="hud-fs"
          :title="isFullscreen ? m.exitFullscreenTitle : m.fullscreen"
          @click="toggleFullscreen"
        >
          {{ isFullscreen ? m.exitFullscreen : m.fullscreen }}
        </button>
      </div>
    </header>

    <div ref="stageEl" class="office-stage">
      <canvas ref="canvasEl" class="office-canvas" />
      <div ref="layerEl" class="office-layer" />
    </div>

    <aside v-if="picked" class="office-card" :style="{ '--team': picked.team }">
      <button type="button" class="card-close" :title="m.close" @click="pick(null)">×</button>
      <div class="card-name">{{ picked.name }}</div>
      <div v-if="picked.description" class="card-desc">{{ picked.description }}</div>
      <dl>
        <template v-if="picked.type">
          <dt>{{ m.card.type }}</dt>
          <dd>{{ picked.type }}</dd>
        </template>
        <dt>{{ m.card.state }}</dt>
        <dd :data-state="picked.stateKey">{{ picked.stateText }}</dd>
        <dt>{{ m.card.tool }}</dt>
        <dd :title="picked.tool ?? ''">{{ picked.tool ? toolLabel(picked.tool) : '—' }}</dd>
        <dt>{{ m.card.lastActivity }}</dt>
        <dd>{{ picked.ago }}</dd>
        <template v-if="picked.waitingOn.length">
          <dt>{{ m.card.delegated }}</dt>
          <dd>
            <div v-for="(w, i) in picked.waitingOn" :key="i">{{ w }}</div>
          </dd>
        </template>
        <dt>{{ m.card.session }}</dt>
        <dd>{{ picked.session }}</dd>
      </dl>
    </aside>
    <div v-if="!liveCount" class="office-note">
      <template v-if="!connected">
        {{ m.noStream[0] }}<code>npm run dev</code>{{ m.noStream[1] }}
      </template>
      <template v-else>{{ m.noSessions }}</template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ZONE_COUNT } from './agent-office/layout'
import { OfficeScene, agentLabel, isBusy, toolLabel, type SessionInfo, type UsageInfo } from './agent-office/scene'
import {
  HTML_LANG,
  LOCALES,
  LOCALE_NAMES,
  MESSAGES,
  detectLocale,
  isLocale,
  setLocale,
  type Locale,
} from './i18n'

interface Snapshot {
  now: number
  sessions: SessionInfo[]
  /** Claude Code 사용량(세션 5시간·주간 7일). 벽 TV 에 그린다. 없으면 TV 에 '—' 를 그린다 */
  usage?: UsageInfo | null
}

const snapshot = ref<Snapshot | null>(null)
const connected = ref(false)
const isFullscreen = ref(false)
const pageEl = ref<HTMLElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
const layerEl = ref<HTMLElement | null>(null)
let es: EventSource | null = null
let scene: OfficeScene | null = null
let observer: ResizeObserver | null = null

const liveSessions = computed(() =>
  (snapshot.value?.sessions ?? []).filter(
    (s) => s.main.state !== 'ended' || s.agents.some((a) => a.state !== 'ended'),
  ),
)
const liveCount = computed(() => liveSessions.value.length)
const busyCount = computed(() => liveSessions.value.filter(isBusy).length)

// ── 화면 언어. 처음엔 브라우저 언어를 따르고(지원하지 않으면 영어), 고른 언어는 이 브라우저에 기억한다 ──
const LOCALE_KEY = 'agent-office:locale'
function loadLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_KEY)
    if (isLocale(saved)) return saved
  } catch {
    // 저장소를 못 쓰면 브라우저 언어만 본다
  }
  return detectLocale(navigator.languages?.length ? navigator.languages : [navigator.language])
}
const locale = ref<Locale>(loadLocale())
setLocale(locale.value)
const m = computed(() => MESSAGES[locale.value])
function applyDocumentLocale(l: Locale) {
  document.documentElement.lang = HTML_LANG[l]
  document.title = MESSAGES[l].appTitle
}
watch(locale, (l) => {
  setLocale(l)
  applyDocumentLocale(l)
  try {
    localStorage.setItem(LOCALE_KEY, l)
  } catch {
    // 저장소를 못 쓰는 환경이면 이번 화면에서만 적용한다
  }
  scene?.refreshLocale()
})

// ── 프로젝트명 표시 스위치. 보는 사람 취향이라 이 브라우저에만 기억한다(저장소를 못 쓰면 켜진 채로) ──
const SHOW_PROJECT_KEY = 'agent-office:show-project'
function loadShowProject() {
  try {
    return localStorage.getItem(SHOW_PROJECT_KEY) !== '0'
  } catch {
    return true
  }
}
const showProject = ref(loadShowProject())
watch(showProject, (on) => {
  try {
    localStorage.setItem(SHOW_PROJECT_KEY, on ? '1' : '0')
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 모드 등)이면 이번 화면에서만 적용한다
  }
  scene?.setShowProject(on)
})

// ── 캐릭터 상세 카드 ──
const pickedKey = ref<string | null>(null)
const pickedTeam = ref('')
/** 스냅샷을 받은 순간의 로컬 시각. 카드의 '몇 초 전'을 서버 시각 기준으로 잇는다 */
const receivedAt = ref(0)
const tickNow = ref(Date.now())
let cardTimer: ReturnType<typeof setInterval> | null = null

function pick(key: string | null) {
  pickedKey.value = key
  pickedTeam.value = (key && scene?.teamOf(key)) || '#6c72a8'
  scene?.select(key)
}


const picked = computed(() => {
  const key = pickedKey.value
  const snap = snapshot.value
  if (!key || !snap) return null
  const cut = key.indexOf(':')
  const s = snap.sessions.find((x) => x.id === key.slice(0, cut))
  if (!s) return null
  const who = key.slice(cut + 1)
  const a = who === 'main' ? null : s.agents.find((x) => x.id === who)
  if (who !== 'main' && !a) return null
  const st = a ?? s.main
  const stalled = st.state === 'idle' && st.tool !== null
  const serverNow = snap.now + (tickNow.value - receivedAt.value)
  return {
    name: a ? agentLabel(a.agentType) : m.value.mainName,
    /** 이름표가 줄인 이름이면 원래 agentType 을 따로 보여 준다(플러그인 에이전트 등) */
    type: a && a.agentType && agentLabel(a.agentType) !== a.agentType ? a.agentType : '',
    description: a?.description ?? '',
    stateKey: stalled ? 'stall' : st.state,
    stateText: stalled ? m.value.state.stalled : m.value.state[st.state],
    tool: st.tool,
    ago: m.value.ago(Math.max(0, Math.round((serverNow - st.lastAt) / 1000))),
    // 같은 종류가 여럿일 수 있어 한 명씩 이름과 설명을 함께 적는다
    waitingOn: a
      ? []
      : s.agents
          .filter((x) => x.state === 'working')
          .map((x) => agentLabel(x.agentType) + (x.description ? ` — ${x.description}` : '')),
    session: showProject.value ? `${s.project} · ${s.id.slice(0, 8)}` : s.id.slice(0, 8),
    team: pickedTeam.value,
  }
})
// 고른 캐릭터가 사라지면(퇴장·구역 밖) 카드를 닫는다
watch(picked, (v) => {
  if (!v && pickedKey.value) pick(null)
})
watch(pickedKey, (k) => {
  if (k && !cardTimer) cardTimer = setInterval(() => (tickNow.value = Date.now()), 1000)
  if (!k && cardTimer) {
    clearInterval(cardTimer)
    cardTimer = null
  }
})
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && pickedKey.value) pick(null)
}

watch(snapshot, (v) => {
  scene?.sync(v?.sessions ?? [], v?.now)
  scene?.setUsage(v?.usage ?? null)
})

/** 화면을 꽉 채우도록 렌더 크기를 맞춘다 */
function fitSize() {
  const el = stageEl.value
  if (!el || !scene) return
  scene.resize(el.clientWidth, el.clientHeight)
}

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void pageEl.value?.requestFullscreen?.()
}

function onFullscreenChange() {
  isFullscreen.value = document.fullscreenElement === pageEl.value
  fitSize()
}

function connect() {
  if (es) return
  es = new EventSource('/__agent-office/events')
  es.onopen = () => (connected.value = true)
  es.onmessage = (e) => {
    try {
      snapshot.value = JSON.parse(e.data)
      receivedAt.value = tickNow.value = Date.now()
      connected.value = true
    } catch {
      // 알 수 없는 페이로드는 무시
    }
  }
  es.onerror = () => {
    connected.value = false
  }
}

function disconnect() {
  es?.close()
  es = null
  connected.value = false
}

onMounted(() => {
  if (!canvasEl.value || !layerEl.value) return
  scene = new OfficeScene(canvasEl.value, layerEl.value)
  scene.onSelect = pick
  scene.setUsage(snapshot.value?.usage ?? null)
  applyDocumentLocale(locale.value)
  scene.setShowProject(showProject.value)
  scene.sync(snapshot.value?.sessions ?? [], snapshot.value?.now)
  fitSize()
  if (stageEl.value) {
    observer = new ResizeObserver(fitSize)
    observer.observe(stageEl.value)
  }
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('visibilitychange', onVisibilityChange)
  document.addEventListener('keydown', onKey)
  onVisibilityChange()
})

// 브라우저 탭이 가려져 있는 동안은 연결과 그리기 루프를 모두 멈춘다
function onVisibilityChange() {
  if (document.hidden) {
    disconnect()
    scene?.stop()
  } else {
    connect()
    scene?.start()
    fitSize()
  }
}

onBeforeUnmount(() => {
  disconnect()
  observer?.disconnect()
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  document.removeEventListener('keydown', onKey)
  if (cardTimer) clearInterval(cardTimer)
  scene?.destroy()
  scene = null
})
</script>

<style scoped>
.office-page {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: #e8eceb;
}
.office-stage {
  position: relative;
  flex: 1;
  min-height: 0;
}
.office-canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}
.office-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

/* One shared toolbar contains the status and actions above the scene. */
.office-toolbar {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  flex: none;
  gap: 8px 18px;
  min-height: 52px;
  padding: 8px 18px;
  background: rgba(255, 255, 255, 0.94);
  border-bottom: 1px solid #dce2e2;
  backdrop-filter: blur(16px);
  z-index: 40;
}
.office-hud {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: 10px;
}
.hud-chip {
  flex: none;
  color: #4e5a60;
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
}
.hud-chip.title { font-size: 14px; font-weight: 650; color: #263237; letter-spacing: -0.02em; }
.hud-chip.on,
.hud-chip.off { display: inline-flex; align-items: center; gap: 5px; }
.hud-chip.on { color: #32705a; }
.hud-chip.off { color: #a73d3d; }
.hud-chip.on::before,
.hud-chip.off::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.hud-chip.warn { color: #8a6223; }
.hud-chip.dim { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: #7d878d; font-size: 11px; }
.hud-actions { display: flex; align-items: center; flex: none; gap: 6px; }
.hud-lang,
.hud-switch,
.hud-fs {
  box-sizing: border-box;
  min-height: 32px;
  padding: 5px 11px;
  background: #f6f8f8;
  border: 1px solid #e0e5e5;
  border-radius: 18px;
  color: #414d53;
  font: inherit;
  font-size: 12px;
  line-height: 20px;
  cursor: pointer;
}
.hud-lang:hover,
.hud-switch:hover,
.hud-fs:hover { background: #edf1f1; }
.hud-lang:focus-visible,
.hud-switch:focus-visible,
.hud-fs:focus-visible { outline: 2px solid #547e9c; outline-offset: 2px; }
.hud-switch,
.hud-fs { display: inline-flex; align-items: center; gap: 6px; }
.hud-switch .track {
  position: relative;
  width: 24px;
  height: 14px;
  border-radius: 7px;
  background: #a8b1b6;
  transition: background 0.15s;
}
.hud-switch .track i {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px #0002;
  transition: transform 0.15s;
}
.hud-switch[aria-checked='true'] .track { background: #648677; }
.hud-switch[aria-checked='true'] .track i { transform: translateX(10px); }
@media (max-width: 820px) {
  .office-toolbar { padding: 8px 12px; gap: 7px; }
  .office-hud { flex-basis: 100%; flex-wrap: wrap; gap: 4px 10px; }
  .hud-actions { margin-left: auto; }
  .hud-chip.dim { display: none; }
}
.office-card {
  position: absolute;
  left: 12px;
  bottom: 12px;
  width: min(calc(100% - 24px), 300px);
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px);
  border-radius: 14px;
  box-shadow: 0 8px 28px #25343e12;
  border: 1px solid #d7dddf;
  border-left-width: 5px;
  color: #303b42;
  font-size: 12px;
  line-height: 1.5;
  z-index: 45;
}
.card-close {
  position: absolute;
  top: 4px;
  right: 6px;
  padding: 0 4px;
  background: none;
  border: 0;
  color: #6d7880;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.card-close:hover {
  color: #1d252a;
}
.card-name {
  padding-right: 18px;
  font-weight: 700;
  font-size: 13px;
}
.card-desc {
  margin-top: 2px;
  color: #59646c;
  overflow-wrap: anywhere;
}
.office-card dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 10px;
  margin: 8px 0 0;
}
.office-card dt {
  color: #6d7880;
}
.office-card dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.office-card dd[data-state='working'] {
  color: #26704a;
}
.office-card dd[data-state='waiting'] {
  color: #8a6223;
}
.office-card dd[data-state='stall'] {
  color: #a73d3d;
}
.office-note {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  width: min(80%, 520px);
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.88);
  border-radius: 12px;
  border: 1px solid #d7dddf;
  color: #303b42;
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
  z-index: 40;
}
.office-note code {
  color: #8a6223;
}

/* 이름표·말풍선·세션 표식은 장면 코드(CSS2DRenderer)가 만든 DOM 이다. 위치(transform)는 렌더러가 잡는다 */
.office-layer :deep(.ao-stack) {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  pointer-events: none;
  transition: opacity 0.2s;
}
.office-layer :deep(.ao-stack:hover) {
  z-index: 99999 !important;
}
/* 이름표·말풍선을 누르면 상세 카드를 연다 */
.office-layer :deep(.ao-label),
.office-layer :deep(.ao-bubble) {
  cursor: pointer;
}
.office-layer :deep(.ao-stack.is-selected .ao-label) {
  outline: 2px solid #fff;
  outline-offset: 1px;
}
.office-layer :deep(.ao-label) {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 5px 1px 4px;
  background: rgba(255, 255, 255, 0.93);
  border: 1px solid color-mix(in srgb, var(--team, #888) 40%, #d7dddf);
  border-radius: 4px;
  color: #303b42;
  font-size: 10px;
  font-weight: 700;
  line-height: 13px;
  white-space: nowrap;
  pointer-events: auto;
}
.office-layer :deep(.ao-dot) {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.55);
}
.office-layer :deep(.ao-tag) {
  padding: 0 4px;
  border-radius: 2px;
  font-weight: 700;
  color: #1b1e2e;
  background: #c9ccdf;
}
.office-layer :deep(.ao-tag[data-kind='type']) {
  background: #f0c56a;
}
.office-layer :deep(.ao-tag[data-kind='read']) {
  background: #7fb8ff;
}
.office-layer :deep(.ao-tag[data-kind='bash']) {
  background: #7fe0a0;
}
.office-layer :deep(.ao-tag[data-kind='stall']) {
  background: #f08a8a;
}
.office-layer :deep(.ao-text) {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #1b1e2e;
}
.office-layer :deep(.ao-stack:hover .ao-text) {
  max-width: 420px;
}
.office-layer :deep(.ao-zone) {
  padding: 0 6px;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 5px;
  border-left: 3px solid var(--team, #888);
  color: #303b42;
  font-size: 10px;
  line-height: 14px;
  white-space: nowrap;
}
.office-layer :deep(.ao-bubble) {
  font-size: 10px;
  line-height: 13px;
  pointer-events: auto;
}
.office-layer :deep(.ao-bubble-in) {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  background: #fff;
  border: 1px solid #b6c0c5;
  border-radius: 10px;
  white-space: nowrap;
}
/* 응답 대기: 말풍선과 이름표가 한 덩어리로 튄다. .ao-stack 의 transform 은 CSS2DRenderer 가 위치를 잡는 데 쓰므로
   묶음 대신 두 자식에 같은 애니메이션을 건다(is-wait 가 한 번에 붙어 박자가 맞는다) */
.office-layer :deep(.ao-stack.is-wait > .ao-label),
.office-layer :deep(.ao-stack.is-wait > .ao-bubble) {
  animation: ao-bounce 0.6s ease-in-out infinite;
}
/* 꼬리: 말풍선 아래 가운데의 작은 마름모 */
.office-layer :deep(.ao-bubble-in::after) {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -6px;
  width: 7px;
  height: 7px;
  background: #fff;
  border-right: 1px solid #b6c0c5;
  border-bottom: 1px solid #b6c0c5;
  transform: translateX(-50%) rotate(45deg);
}
.office-layer :deep(.ao-dots) {
  display: flex;
  align-items: center;
  gap: 3px;
}
.office-layer :deep(.ao-dots i) {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #e8a317;
}
@keyframes ao-bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-7px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .office-layer :deep(.ao-stack.is-wait > .ao-label),
  .office-layer :deep(.ao-stack.is-wait > .ao-bubble) { animation: none; }
}
</style>
