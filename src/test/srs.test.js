import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  today, initSrs, nextSrs, isDue, sortBySrs, srsLabel, levelLabel,
  SRS_INTERVALS, SRS_MAX_LEVEL
} from '../lib/srs.js'

const FIXED_DATE = '2026-01-15'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(FIXED_DATE + 'T12:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('today()', () => {
  it('returns current date as YYYY-MM-DD', () => {
    expect(today()).toBe(FIXED_DATE)
  })
})

describe('initSrs()', () => {
  it('sets level 0 and due date to today', () => {
    const srs = initSrs()
    expect(srs.srsLevel).toBe(0)
    expect(srs.srsDueDate).toBe(FIXED_DATE)
    expect(srs.srsLastReview).toBeNull()
  })
})

describe('nextSrs()', () => {
  it('increments level on "know"', () => {
    const word = { srsLevel: 0, srsDueDate: FIXED_DATE }
    const next = nextSrs(word, 'know')
    expect(next.srsLevel).toBe(1)
    expect(next.srsDueDate).toBe('2026-01-17') // +2 days (level 1 interval)
    expect(next.srsLastReview).toBeTruthy()
  })

  it('caps level at SRS_MAX_LEVEL on "know"', () => {
    const word = { srsLevel: SRS_MAX_LEVEL, srsDueDate: FIXED_DATE }
    const next = nextSrs(word, 'know')
    expect(next.srsLevel).toBe(SRS_MAX_LEVEL)
  })

  it('resets to level 0 and due tomorrow on "hard"', () => {
    const word = { srsLevel: 3, srsDueDate: FIXED_DATE }
    const next = nextSrs(word, 'hard')
    expect(next.srsLevel).toBe(0)
    expect(next.srsDueDate).toBe('2026-01-16') // +1 day
  })
})

describe('isDue()', () => {
  it('returns true for today', () => {
    expect(isDue({ srsDueDate: FIXED_DATE })).toBe(true)
  })

  it('returns true for past dates', () => {
    expect(isDue({ srsDueDate: '2026-01-01' })).toBe(true)
  })

  it('returns false for future dates', () => {
    expect(isDue({ srsDueDate: '2026-01-20' })).toBe(false)
  })

  it('returns true for words without srsDueDate (legacy)', () => {
    expect(isDue({})).toBe(true)
  })
})

describe('sortBySrs()', () => {
  it('sorts by due date ascending', () => {
    const words = [
      { srsDueDate: '2026-01-20' },
      { srsDueDate: '2026-01-10' },
      { srsDueDate: '2026-01-15' },
    ]
    const sorted = sortBySrs(words)
    expect(sorted[0].srsDueDate).toBe('2026-01-10')
    expect(sorted[1].srsDueDate).toBe('2026-01-15')
    expect(sorted[2].srsDueDate).toBe('2026-01-20')
  })
})

describe('srsLabel()', () => {
  it('returns "Due today" for today', () => {
    expect(srsLabel({ srsDueDate: FIXED_DATE })).toBe('Due today')
  })

  it('returns "Due tomorrow" for tomorrow', () => {
    expect(srsLabel({ srsDueDate: '2026-01-16' })).toBe('Due tomorrow')
  })

  it('returns overdue label for past dates', () => {
    expect(srsLabel({ srsDueDate: '2026-01-10' })).toBe('5d overdue')
  })

  it('returns "New" for words without srsDueDate', () => {
    expect(srsLabel({})).toBe('New')
  })
})

describe('levelLabel()', () => {
  it('returns correct labels for all levels', () => {
    expect(levelLabel(0)).toBe('Day 1')
    expect(levelLabel(5)).toBe('Day 90')
  })

  it('handles NaN gracefully', () => {
    expect(levelLabel(NaN)).toBe('Day 1')
  })
})
