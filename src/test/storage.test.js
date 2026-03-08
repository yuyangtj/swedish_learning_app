import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getStreak, recordReview } from '../lib/storage.js'

const FIXED_DATE = '2026-01-15'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(FIXED_DATE + 'T12:00:00'))
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getStreak()', () => {
  it('returns zero streak when nothing stored', () => {
    const s = getStreak()
    expect(s.count).toBe(0)
    expect(s.lastDate).toBeNull()
  })
})

describe('recordReview()', () => {
  it('starts streak at 1 on first review', () => {
    const s = recordReview()
    expect(s.count).toBe(1)
    expect(s.lastDate).toBe(FIXED_DATE)
  })

  it('does not increment twice in same day', () => {
    recordReview()
    const s = recordReview()
    expect(s.count).toBe(1)
  })

  it('increments streak when reviewed yesterday', () => {
    // Simulate reviewed yesterday
    localStorage.setItem('sv_streak', JSON.stringify({ count: 3, lastDate: '2026-01-14' }))
    const s = recordReview()
    expect(s.count).toBe(4)
    expect(s.lastDate).toBe(FIXED_DATE)
  })

  it('resets streak to 1 when a day is missed', () => {
    // Last review was 2 days ago
    localStorage.setItem('sv_streak', JSON.stringify({ count: 5, lastDate: '2026-01-13' }))
    const s = recordReview()
    expect(s.count).toBe(1)
    expect(s.lastDate).toBe(FIXED_DATE)
  })
})
