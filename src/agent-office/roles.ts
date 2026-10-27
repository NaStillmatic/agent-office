import type { Locale } from '../i18n'

export type OfficeRole = 'planning' | 'backend' | 'frontend' | 'review' | 'ops' | 'general'
export const ROLE_ORDER: OfficeRole[] = ['planning', 'backend', 'frontend', 'review', 'ops', 'general']
const names: Record<Locale, string[]> = {
  ko: ['기획 회의실', 'API · 백엔드', '디자인 스튜디오', '리뷰 · 검수', '리뷰 · 커밋 검수', '메인 · 공용'],
  en: ['Planning room', 'API · Backend', 'Design studio', 'Review · QA', 'Review · Release', 'Main · Shared'],
  ja: ['企画会議室', 'API・バックエンド', 'デザインスタジオ', 'レビュー・検証', 'レビュー・コミット検証', 'メイン・共用'],
  zh: ['规划会议室', 'API · 后端', '设计工作室', '审查 · 验证', '审查 · 提交验证', '主代理 · 公共区'],
}
export const roleLabel = (zone: number, locale: Locale) => names[locale][zone]

// Only existing short metadata is inspected; never request transcript bodies or tool inputs.
function matchRole(text: string): OfficeRole | null {
  const value = text.toLowerCase().replace(/[_:./-]+/g, ' ')
  if (/\b(commit|build|deploy|devops|ci|release)\b|커밋|빌드|배포/.test(value)) return 'ops'
  if (/\b(review\w*|qa|test\w*|verif\w*|final check)\b|리뷰|검수|최종.*확인|테스트/.test(value)) return 'review'
  if (/\b(plan\w*|architect\w*|strateg\w*|product manager)\b|기획|계획|플랜/.test(value)) return 'planning'
  if (/\b(frontend|front end|design\w*|ui|ux|css)\b|프론트|디자인|디자이너/.test(value)) return 'frontend'
  if (/\b(api|backend|back end|database|server|sql)\b|백엔드|서버|데이터베이스/.test(value)) return 'backend'
  return null
}
export function classifyRole(type: string, description = '', isMain = false): OfficeRole {
  if (isMain) return 'general'
  return matchRole(type) ?? matchRole(description) ?? 'general'
}
export const roleZone = (type: string, description = '', isMain = false) => {
  const role = classifyRole(type, description, isMain)
  return role === 'review' ? 4 : ROLE_ORDER.indexOf(role)
}

/** Monitor-facing row first; shared seats remain stable for each session slot. */
export const MONITOR_FIRST_SEATS = [3, 4, 5, 0, 1, 2] as const
export const sharedSeatForSlot = (slot: number) => MONITOR_FIRST_SEATS[slot] ?? slot
export const sharedSlotForSeat = (seat: number) => MONITOR_FIRST_SEATS.indexOf(seat as typeof MONITOR_FIRST_SEATS[number])

export function pickRoleSeat<T extends { id: string; zone: number; local: number }>(
  seats: readonly T[], taken: ReadonlySet<string>, zone: number, preferred = 3,
): T | null {
  const free = seats.filter(s => s.zone === zone && !taken.has(s.id))
  free.sort((a, b) => MONITOR_FIRST_SEATS.indexOf(a.local as typeof MONITOR_FIRST_SEATS[number]) - MONITOR_FIRST_SEATS.indexOf(b.local as typeof MONITOR_FIRST_SEATS[number]))
  return free.find(s => s.local === preferred) ?? free[0] ?? null
}
