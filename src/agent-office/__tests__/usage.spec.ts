import { describe, expect, it } from 'vitest'
import { currentUsagePercent, resetMinutes, usagePercent } from '../usage'

describe('top bar usage', () => {
  it('distinguishes unknown data from a genuine zero', () => {
    expect(usagePercent(null)).toBeNull()
    expect(usagePercent({ pct: 0, resetsAt: null })).toBe(0)
    expect(usagePercent({ pct: NaN, resetsAt: null })).toBeNull()
  })
  it('clamps numeric usage to the progress bar range', () => {
    expect(usagePercent({ pct: 120, resetsAt: null })).toBe(100)
    expect(usagePercent({ pct: -2, resetsAt: null })).toBe(0)
    expect(usagePercent({ pct: 32.4, resetsAt: null })).toBe(32)
  })
  it('shows a reset countdown only for future resets', () => {
    expect(resetMinutes({ pct: 32, resetsAt: 121000 }, 1000)).toBe(2)
    expect(resetMinutes({ pct: 32, resetsAt: 500 }, 1000)).toBeNull()
    expect(resetMinutes(null, 1000)).toBeNull()
  })
  it('hides expired Claude usage until a fresh quota arrives', () => {
    expect(currentUsagePercent({ pct: 80, resetsAt: 1001 }, 1000)).toBe(80)
    expect(currentUsagePercent({ pct: 80, resetsAt: 1000 }, 1000)).toBeNull()
    expect(currentUsagePercent({ pct: 0, resetsAt: null }, 1000)).toBe(0)
    expect(currentUsagePercent({ pct: 3, resetsAt: 2000 }, 1000)).toBe(3)
  })
})
