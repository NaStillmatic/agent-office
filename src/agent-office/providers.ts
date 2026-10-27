export type Provider = 'claude' | 'codex'
export type ProviderFilter = 'all' | Provider
export const PROVIDER_FILTERS: ProviderFilter[] = ['all', 'claude', 'codex']
export function isProviderFilter(value: unknown): value is ProviderFilter {
  return PROVIDER_FILTERS.includes(value as ProviderFilter)
}
export function filterSessions<T extends { provider?: Provider }>(sessions: readonly T[], filter: ProviderFilter): T[] {
  return sessions.filter(s => filter === 'all' || s.provider === filter)
}
export function visibleProviders(filter: ProviderFilter): Provider[] {
  return filter === 'all' ? ['claude', 'codex'] : [filter]
}
