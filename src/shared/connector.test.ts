import { describe, expect, it } from 'vitest'
import { TOOLS, ToolError, type Port } from './connector'
import { dayStartMs } from './dates'
import { applyOp, emptyData, type StoreOp } from './store'
import type { AppData } from './types'

const NOW = new Date(2026, 9, 6, 15, 0).getTime() // Tue 2026-10-06 15:00 local

function memoryPort(initial: AppData = emptyData()): Port & { data: AppData; applied: StoreOp[][] } {
  const port = {
    data: initial,
    applied: [] as StoreOp[][],
    async read() {
      return port.data
    },
    async apply(ops: StoreOp[]) {
      port.applied.push(ops)
      port.data = ops.reduce(applyOp, port.data)
      return port.data
    }
  }
  return port
}

async function call(port: Port, name: string, input: Record<string, unknown> = {}): Promise<any> {
  const spec = TOOLS.find((t) => t.name === name)
  if (!spec) throw new Error(`no tool ${name}`)
  return spec.run(input as never, { port, now: () => NOW })
}

describe('connector tools', () => {
  it('creates a goal with checkpoints and new tags', async () => {
    const port = memoryPort()
    const res = await call(port, 'create_goal', {
      title: 'Study LLMs',
      tag: 'Machine Learning',
      end_date: '2026-11-03',
      checkpoints: [{ title: 'Transformer architecture' }, { title: 'llama.cpp', tag: 'C++' }]
    })
    expect(res.created).toMatchObject({ title: 'Study LLMs', status: 'current', tag: 'Machine Learning', start_date: '2026-10-06', days_left: 28 })
    expect(res.created.checkpoints.map((c: { title: string }) => c.title)).toEqual(['Transformer architecture', 'llama.cpp'])
    expect(port.data.tags.map((t) => t.name)).toEqual(['Machine Learning', 'C++'])
    // Existing tags are matched by name, not duplicated.
    await call(port, 'create_goal', { title: 'Other', tag: 'machine learning' })
    expect(port.data.tags).toHaveLength(2)
  })

  it('edits goals and checkpoints, and finds goals by title', async () => {
    const port = memoryPort()
    await call(port, 'create_goal', { title: 'Transformers', checkpoints: [{ title: 'Encoder' }, { title: 'Decoder' }] })
    await call(port, 'add_checkpoints', { goal: 'transformers', checkpoints: [{ title: 'Attention is all you need' }], position: 1 })
    await call(port, 'update_checkpoint', { goal: 'Transformers', checkpoint: 'Encoder', done: true })
    const res = await call(port, 'update_goal', { goal: 'Transformers', target_hours: 20, end_date: '2026-10-31' })
    expect(res.updated.checkpoints.map((c: { title: string; done: boolean }) => [c.title, c.done])).toEqual([
      ['Attention is all you need', false],
      ['Encoder', true],
      ['Decoder', false]
    ])
    expect(res.updated.target_hours).toBe(20)

    const g = port.data.goals[0]
    await call(port, 'reorder_checkpoints', { goal: g.id, order: ['Decoder', 'Encoder', 'Attention is all you need'] })
    expect(port.data.goals[0].checkpoints.map((c) => c.title)).toEqual(['Decoder', 'Encoder', 'Attention is all you need'])
    await expect(call(port, 'reorder_checkpoints', { goal: g.id, order: ['Decoder'] })).rejects.toThrow(ToolError)

    await call(port, 'update_goal', { goal: g.id, completed: true })
    expect(port.data.goals[0].completedAt).toBe(NOW)
    await call(port, 'update_goal', { goal: g.id, completed: false })
    expect(port.data.goals[0].completedAt).toBeNull()
  })

  it('creates, moves and deletes plans linked to a goal', async () => {
    const port = memoryPort()
    await call(port, 'create_goal', { title: 'LLMs', tag: 'ML', checkpoints: [{ title: 'llama.cpp', tag: 'C++' }] })
    const res = await call(port, 'create_plans', {
      plans: [
        { title: 'Build llama.cpp', date: '2026-10-07', start_time: '20:00', duration_minutes: 60, goal: 'LLMs', checkpoint: 'llama.cpp' },
        { title: 'Read paper', date: '2026-10-07', start_time: '20:30', duration_minutes: 45, goal: 'LLMs' }
      ]
    })
    expect(res.created[0]).toMatchObject({ end_time: '21:00', tag: 'C++', goal: { title: 'LLMs' }, checkpoint: { title: 'llama.cpp' } })
    expect(res.created[1].tag).toBe('ML')
    expect(res.warnings).toHaveLength(2)

    const id = res.created[1].id
    const moved = await call(port, 'update_plan', { plan_id: id, start_time: '21:00', goal: null })
    expect(moved.updated).toMatchObject({ start_time: '21:00', goal: null, checkpoint: null })
    expect(moved.warnings).toBeUndefined()

    const listed = await call(port, 'list_plans', { from: '2026-10-07', to: '2026-10-07' })
    expect(listed.plans.map((p: { title: string }) => p.title)).toEqual(['Build llama.cpp', 'Read paper'])
    await call(port, 'delete_plan', { plan_id: id })
    expect(port.data.plans).toHaveLength(1)
  })

  it('validates input', async () => {
    const port = memoryPort()
    await expect(call(port, 'create_goal', { title: 'x', start_date: '2026-02-30' })).rejects.toThrow('Invalid date')
    await expect(call(port, 'create_goal', { title: 'x', start_date: '2026-10-10', end_date: '2026-10-01' })).rejects.toThrow('before')
    await expect(call(port, 'get_goal', { goal: 'nope' })).rejects.toThrow('No goal found')
    await expect(call(port, 'update_plan', { plan_id: 'nope' })).rejects.toThrow('No plan')
  })

  it('never offers a way to change recorded study time or settings', () => {
    const names = TOOLS.map((t) => t.name)
    expect(names.some((n) => /log|session|setting|timer/.test(n))).toBe(false)
    for (const t of TOOLS.filter((t) => t.annotations.readOnlyHint)) expect(t.name).toMatch(/^(get|list)_/)
  })
})

describe('delete_duplicate_goal', () => {
  async function twoGoals(secondCheckpoints: string[]) {
    const port = memoryPort()
    const a = (await call(port, 'create_goal', { title: 'Transformers', checkpoints: [{ title: 'Encoder' }, { title: 'Decoder' }] })).created
    const b = (await call(port, 'create_goal', { title: 'transformers ', checkpoints: secondCheckpoints.map((title) => ({ title })) })).created
    return { port, a, b }
  }

  it('refuses goals that are not identical', async () => {
    const { port, a, b } = await twoGoals(['Encoder'])
    await expect(call(port, 'delete_duplicate_goal', { goal: b.id, keep: a.id })).rejects.toThrow('not identical')
    expect(port.data.goals).toHaveLength(2)
  })

  it('deletes an exact duplicate and moves its plans, sessions and ticks to the kept goal', async () => {
    const { port, a, b } = await twoGoals(['Encoder', 'Decoder'])
    await call(port, 'update_checkpoint', { goal: b.id, checkpoint: 'Decoder', done: true })
    const plan = (await call(port, 'create_plans', { plans: [{ title: 'Decoder', date: '2026-10-08', start_time: '19:00', duration_minutes: 60, goal: b.id, checkpoint: 'Decoder' }] })).created[0]
    // A session whose plan was deleted keeps its goal link on the session itself.
    const start = dayStartMs('2026-10-05') + 19 * 3_600_000
    port.data = applyOp(port.data, {
      type: 'upsertLog',
      log: { id: 'l1', segments: [{ start, end: start + 3_600_000 }], source: 'manual', tagId: null, planId: null, goalId: b.id, checkpointId: b.checkpoints[0].id, note: '', createdAt: 0 }
    })

    const res = await call(port, 'delete_duplicate_goal', { goal: b.id, keep: a.id })
    expect(res).toMatchObject({ deleted: b.id, moved_plans: 1, moved_sessions: 1 })
    expect(port.data.goals.map((g) => g.id)).toEqual([a.id])
    expect(port.data.plans.find((p) => p.id === plan.id)).toMatchObject({ goalId: a.id, checkpointId: a.checkpoints[1].id })
    expect(port.data.logs[0]).toMatchObject({ goalId: a.id, checkpointId: a.checkpoints[0].id })
    expect(port.data.goals[0].checkpoints.map((c) => c.done)).toEqual([false, true])
    expect(res.kept.studied_hours).toBe(1)
  })

  it('needs two different goal ids', async () => {
    const { port, a } = await twoGoals(['Encoder', 'Decoder'])
    await expect(call(port, 'delete_duplicate_goal', { goal: a.id, keep: a.id })).rejects.toThrow('same goal')
    await expect(call(port, 'delete_duplicate_goal', { goal: 'Transformers', keep: a.id })).rejects.toThrow('goal ids')
  })
})

describe('overview and stats', () => {
  it('summarizes today, goals and recent study time', async () => {
    const port = memoryPort()
    await call(port, 'create_goal', { title: 'LLMs', target_hours: 10 })
    await call(port, 'create_plans', { plans: [{ title: 'Today', date: '2026-10-06', start_time: '19:00', duration_minutes: 60 }] })
    const start = dayStartMs('2026-10-05') + 9 * 3_600_000
    port.data = applyOp(port.data, {
      type: 'upsertLog',
      log: { id: 'l', segments: [{ start, end: start + 90 * 60_000 }], source: 'stopwatch', tagId: null, planId: null, goalId: null, checkpointId: null, note: '', createdAt: 0 }
    })
    const o = await call(port, 'get_overview')
    expect(o).toMatchObject({ today: '2026-10-06', weekday: 'Tuesday', now: '15:00' })
    expect(o.today_plans).toHaveLength(1)
    expect(o.goals_in_progress[0].title).toBe('LLMs')
    expect(o.last_14_days.total_hours).toBe(1.5)
    const stats = await call(port, 'get_study_stats', { unit: 'day', periods: 2 })
    expect(stats.periods.map((p: { total_hours: number }) => p.total_hours)).toEqual([1.5, 0])
  })
})
