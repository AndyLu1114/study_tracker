import { describe, expect, it } from 'vitest'
import { dayStartMs } from './dates'
import { breakdown, checkInLevel, currentStreak, periodSeries, recentDays } from './stats'
import type { StudyLog } from './types'

const MIN = 60_000
const at = (ymd: string, h: number, m = 0) => dayStartMs(ymd) + (h * 60 + m) * MIN
const log = (id: string, tagId: string | null, start: number, mins: number): StudyLog => ({
  id,
  tagId,
  planId: null,
  note: '',
  source: 'manual',
  createdAt: 0,
  segments: [{ start, end: start + mins * MIN }]
})

describe('checkInLevel', () => {
  it('uses the fixed thresholds', () => {
    expect([0, 1, 29, 30, 59, 60, 179, 180, 400].map((m) => checkInLevel(m * MIN))).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4])
  })
})

describe('breakdown', () => {
  it('splits a session across midnight', () => {
    const logs = [log('a', 't1', at('2026-10-05', 23, 30), 60)]
    expect(breakdown(logs, dayStartMs('2026-10-05'), dayStartMs('2026-10-06')).totalMs).toBe(30 * MIN)
    expect(breakdown(logs, dayStartMs('2026-10-06'), dayStartMs('2026-10-07')).totalMs).toBe(30 * MIN)
  })

  it('groups by tag, largest first, and filters', () => {
    const logs = [log('a', 't1', at('2026-10-06', 9), 30), log('b', 't2', at('2026-10-06', 10), 90), log('c', 't1', at('2026-10-06', 14), 15)]
    const b = breakdown(logs, dayStartMs('2026-10-06'), dayStartMs('2026-10-07'))
    expect(b.totalMs).toBe(135 * MIN)
    expect(b.slices.map((s) => [s.tagId, s.ms / MIN, s.sessions])).toEqual([
      ['t2', 90, 1],
      ['t1', 45, 2]
    ])
    expect(breakdown(logs, 0, Infinity, 't1').totalMs).toBe(45 * MIN)
  })
})

describe('recentDays & streak', () => {
  it('returns 14 days ending today with levels', () => {
    const logs = [log('a', null, at('2026-10-06', 8), 200), log('b', null, at('2026-10-05', 8), 10)]
    const days = recentDays(logs, '2026-10-06')
    expect(days).toHaveLength(14)
    expect(days[0].date).toBe('2026-09-23')
    expect(days.slice(-2).map((d) => d.level)).toEqual([1, 4])
    expect(currentStreak(logs, '2026-10-06')).toBe(2)
    expect(currentStreak(logs, '2026-10-07')).toBe(2)
    expect(currentStreak(logs, '2026-10-08')).toBe(0)
  })
})

describe('periodSeries', () => {
  it('builds Monday-based weeks and calendar months', () => {
    const logs = [log('a', null, at('2026-10-05', 8), 60), log('b', null, at('2026-09-30', 8), 30)]
    const weeks = periodSeries(logs, 'week', '2026-10-06', 3)
    expect(weeks.map((w) => [w.start, w.breakdown.totalMs / MIN])).toEqual([
      ['2026-09-21', 0],
      ['2026-09-28', 30],
      ['2026-10-05', 60]
    ])
    const months = periodSeries(logs, 'month', '2026-10-06', 2)
    expect(months.map((m) => [m.start, m.breakdown.totalMs / MIN])).toEqual([
      ['2026-09-01', 30],
      ['2026-10-01', 60]
    ])
  })
})
