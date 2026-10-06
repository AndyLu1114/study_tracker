import { describe, expect, it } from 'vitest'
import { layoutDay } from './calendar'
import type { Plan } from './types'

const plan = (id: string, date: string, startTime: string, durationMin: number): Plan => ({
  id, title: id, date, startTime, durationMin, tagId: null, goalId: null, checkpointId: null, description: '', createdAt: 0
})

describe('layoutDay', () => {
  it('places overlapping plans side by side', () => {
    const blocks = layoutDay([plan('a', '2026-10-06', '09:00', 120), plan('b', '2026-10-06', '10:00', 60), plan('c', '2026-10-06', '13:00', 30)], '2026-10-06')
    expect(blocks.map((b) => [b.plan.id, b.column, b.columns])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 1]
    ])
  })

  it('carries a late plan over midnight', () => {
    const plans = [plan('late', '2026-10-06', '23:00', 120)]
    expect(layoutDay(plans, '2026-10-06').map((b) => [b.startMin, b.endMin, b.intoNextDay])).toEqual([[1380, 1440, true]])
    expect(layoutDay(plans, '2026-10-07').map((b) => [b.startMin, b.endMin, b.fromPrevDay])).toEqual([[0, 60, true]])
  })
})
