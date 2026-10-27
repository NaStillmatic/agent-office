/** Numeric usage metadata shared by the server snapshot and the top bar. */
export interface UsageWindow {
  pct: number
  resetsAt: number | null
}
export interface UsageInfo {
  session: UsageWindow | null
  weekly: UsageWindow | null
  fetchedAt: number | null
}
export function usagePercent(value: UsageWindow | null | undefined): number | null {
  return value && Number.isFinite(value.pct) ? Math.max(0, Math.min(100, Math.round(value.pct))) : null
}
/** An expired quota is unknown until a fresh record arrives, not zero. */
export function currentUsagePercent(value: UsageWindow | null | undefined, now: number): number | null {
  if (value?.resetsAt != null && Number.isFinite(value.resetsAt) && value.resetsAt <= now) return null
  return usagePercent(value)
}
export function resetMinutes(value: UsageWindow | null | undefined, now: number): number | null {
  if (!value?.resetsAt || !Number.isFinite(value.resetsAt)) return null
  const minutes = Math.ceil((value.resetsAt - now) / 60_000)
  return minutes > 0 ? minutes : null
}

export interface CodexUsageInfo {
  windows: (UsageWindow & { minutes: number })[]
  fetchedAt: number
}
