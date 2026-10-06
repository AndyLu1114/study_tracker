import { describe, expect, it } from 'vitest'
import { daysUntil, planRemainingMs, summarizeGoals, timeTargetReached } from './goals'
import { applyOp, emptyData } from './store'
import type { AppData, Goal, Plan, StudyLog } from './types'

const HOUR = 3_600_000

const goal = (patch: Partial<Goal> = {}): Goal => ({
  id: 'g',
  title: 'Study LLMs',
  description: '',
  tagId: null,
  startDate: '2026-10-01',
  endDate: null,
  targetHours: null,
  completedAt: null,
  checkpoints: [
    { id: 'c1', title: 'Transformer architecture', tagId: null, done: true, doneAt: 1 },
    { id: 'c2', title: 'llama.cpp', tagId: null, done: false, doneAt: null }
  ],
  createdAt: 0,
  ...patch
})
const plan = (id: string, checkpointId: string | null): Plan => ({
  id, title: id, date: '2026-10-06', startTime: '09:00', durationMin: 120, tagId: null,
  goalId: 'g', checkpointId, description: '', createdAt: 0
})
const log = (id: string, planId: string | null, start: number, hours: number): StudyLog => ({
  id, segments: [{ start, end: start + hours * HOUR }], source: 'manual', tagId: null, planId,
  goalId: null, checkpointId: null, note: '', createdAt: 0
})
const data = (g: Goal): AppData => ({
  ...emptyData(),
  goals: [g],
  plans: [plan('p1', 'c1'), plan('p2', null)],
  logs: [log('a', 'p1', 0, 2), log('b', 'p2', 10 * HOUR, 1), log('x', null, 20 * HOUR, 5)]
})

describe('summarizeGoals', () => {
  it('counts time through linked plans, per checkpoint', () => {
    const s = summarizeGoals(data(goal()), '2026-10-06').get('g')!
    expect(s.studiedMs).toBe(3 * HOUR)
    expect(s.byCheckpoint.get('c1')).toBe(2 * HOUR)
    expect(s.byCheckpoint.get(null)).toBe(1 * HOUR)
    expect(s.progress).toBe(0.5)
    expect(s.status).toBe('current')
  })

  it('completes itself when the target hours are reached', () => {
    const s = summarizeGoals(data(goal({ targetHours: 2.5 })), '2026-10-06').get('g')!
    expect(s.completed).toBe(true)
    expect(s.autoCompleted).toBe(true)
    expect(s.completedAt).toBe(10 * HOUR + 0.5 * HOUR)
    expect(s.status).toBe('past')
    const notYet = summarizeGoals(data(goal({ targetHours: 10 })), '2026-10-06').get('g')!
    expect(notYet.completed).toBe(false)
    expect(notYet.progress).toBeCloseTo(0.3)
  })

  it('splits current, upcoming and past', () => {
    expect(summarizeGoals(data(goal({ startDate: '2026-10-07' })), '2026-10-06').get('g')!.status).toBe('upcoming')
    expect(summarizeGoals(data(goal({ completedAt: 5 })), '2026-10-06').get('g')!.status).toBe('past')
  })

  it('keeps counting a session after its plan is deleted', () => {
    const d = applyOp(data(goal()), { type: 'deletePlan', id: 'p1' })
    expect(d.logs.find((l) => l.id === 'a')).toMatchObject({ planId: null, goalId: 'g', checkpointId: 'c1' })
    expect(summarizeGoals(d, '2026-10-06').get('g')!.byCheckpoint.get('c1')).toBe(2 * HOUR)
  })
})

describe('goal store ops', () => {
  it('drops links to a removed checkpoint, and everything on goal delete', () => {
    let d = data(goal())
    d = applyOp(d, { type: 'upsertGoal', goal: goal({ checkpoints: [goal().checkpoints[1]] }) })
    expect(d.plans.find((p) => p.id === 'p1')).toMatchObject({ goalId: 'g', checkpointId: null })
    d = applyOp(d, { type: 'deleteGoal', id: 'g' })
    expect(d.goals).toHaveLength(0)
    expect(d.plans.every((p) => p.goalId === null && p.checkpointId === null)).toBe(true)
  })
})

describe('helpers', () => {
  it('timeTargetReached, daysUntil, planRemainingMs', () => {
    expect(timeTargetReached([log('a', null, 0, 1), log('b', null, 5 * HOUR, 1)], 1.5 * HOUR)).toBe(5.5 * HOUR)
    expect(timeTargetReached([log('a', null, 0, 1)], 2 * HOUR)).toBeNull()
    expect(daysUntil('2026-10-06', '2026-10-20')).toBe(14)
    expect(daysUntil('2026-10-06', '2026-10-01')).toBe(-5)
    expect(planRemainingMs(plan('p', null), 75 * 60_000)).toBe(45 * 60_000)
    expect(planRemainingMs(plan('p', null), 3 * HOUR)).toBe(0)
  })
})
