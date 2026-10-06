import { describe, expect, it } from 'vitest'
import { applyOp, emptyData, nextTagColor, normalizeData } from './store'

describe('store', () => {
  it('unlinks plans and logs when a tag or plan is deleted', () => {
    let d = emptyData()
    d = applyOp(d, { type: 'upsertTag', tag: { id: 't', name: 'Math', color: 0 } })
    d = applyOp(d, {
      type: 'upsertPlan',
      plan: { id: 'p', title: 'Ch 1', date: '2026-10-06', startTime: '09:00', durationMin: 60, tagId: 't', goalId: null, checkpointId: null, description: '', createdAt: 0 }
    })
    d = applyOp(d, {
      type: 'upsertLog',
      log: { id: 'l', segments: [{ start: 0, end: 1 }], source: 'manual', tagId: 't', planId: 'p', goalId: null, checkpointId: null, note: '', createdAt: 0 }
    })
    const noTag = applyOp(d, { type: 'deleteTag', id: 't' })
    expect(noTag.plans[0].tagId).toBeNull()
    expect(noTag.logs[0].tagId).toBeNull()
    const noPlan = applyOp(d, { type: 'deletePlan', id: 'p' })
    expect(noPlan.logs).toHaveLength(1)
    expect(noPlan.logs[0].planId).toBeNull()
  })

  it('picks the first free palette slot', () => {
    expect(nextTagColor([{ id: 'a', name: 'a', color: 0 }, { id: 'b', name: 'b', color: 2 }])).toBe(1)
  })

  it('round-trips export data and repairs bad records', () => {
    const d = emptyData()
    expect(normalizeData(JSON.parse(JSON.stringify(d)))).toEqual(d)
    expect(() => normalizeData({ foo: 1 })).toThrow()
    const fixed = normalizeData({
      app: 'study-tracker',
      tags: [{ id: 't', name: 'x', color: 3 }],
      plans: [{ id: 'p', date: 'bad', startTime: '09:00' }],
      logs: [
        { id: 'l', segments: [{ start: 5, end: 1 }] },
        { id: 'm', segments: [{ start: 1, end: 5 }], tagId: 'missing' }
      ],
      settings: { language: 'zh-TW', pomodoro: { focusMin: -3 } }
    })
    expect(fixed.plans).toHaveLength(0)
    expect(fixed.logs.map((l) => [l.id, l.tagId])).toEqual([['m', null]])
    expect(fixed.settings.language).toBe('zh-TW')
    expect(fixed.settings.pomodoro.focusMin).toBe(25)
  })
})

describe('older data files', () => {
  it('loads a file saved before goals existed', () => {
    const d = normalizeData({
      app: 'study-tracker',
      tags: [],
      plans: [{ id: 'p', title: 'x', date: '2026-10-06', startTime: '09:00', durationMin: 30 }],
      logs: [{ id: 'l', segments: [{ start: 1, end: 5 }], planId: 'p' }],
      settings: {}
    })
    expect(d.goals).toEqual([])
    expect(d.plans[0]).toMatchObject({ goalId: null, checkpointId: null })
    expect(d.logs[0]).toMatchObject({ goalId: null, checkpointId: null })
    expect(d.settings.seenHelp).toBe(false)
  })
})
