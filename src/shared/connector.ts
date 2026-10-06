// The actions the Claude connector offers. Each one reads the data through a
// port, and changes go back as store operations, so the running app (or the
// data file) applies them exactly like edits made in the UI.

import * as z from 'zod'
import { addDays, hmToMinutes, minutesToHm, parseYmd, todayYmd, toYmd } from './dates'
import { daysUntil, summarizeGoals, type GoalSummary } from './goals'
import { breakdown, currentStreak, msByPlan, periodSeries, recentDays } from './stats'
import { newId, nextTagColor, type StoreOp } from './store'
import type { AppData, Checkpoint, Goal, Plan, Tag } from './types'

export interface Port {
  read(): Promise<AppData>
  apply(ops: StoreOp[]): Promise<AppData>
}

/** An error meant for Claude to read and act on (bad id, invalid date, …). */
export class ToolError extends Error {}

const HOUR = 3_600_000
const hours = (ms: number): number => Math.round((ms / HOUR) * 10) / 10
const norm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase()
const YMD = /^\d{4}-\d{2}-\d{2}$/
const HM = /^([01]\d|2[0-3]):[0-5]\d$/

const date = z.string().regex(YMD, 'Use YYYY-MM-DD')
const time = z.string().regex(HM, 'Use 24-hour HH:mm')
const goalRef = z.string().min(1).describe('Goal id, or its exact title')
const checkpointRef = z.string().min(1).describe('Checkpoint id, or its exact title within the goal')
const tagName = z.string().min(1).max(40).describe('Tag name; a new tag is created if it does not exist yet')
const checkpointInput = z.object({ title: z.string().min(1).max(200), tag: tagName.optional() })

function validDate(ymd: string): string {
  const d = parseYmd(ymd)
  if (Number.isNaN(d.getTime()) || toYmd(d) !== ymd) throw new ToolError(`Invalid date: ${ymd}`)
  return ymd
}

// ---- Lookups ----

function findGoal(data: AppData, ref: string): Goal {
  const byId = data.goals.find((g) => g.id === ref)
  if (byId) return byId
  const byTitle = data.goals.filter((g) => norm(g.title) === norm(ref))
  if (byTitle.length === 1) return byTitle[0]
  if (byTitle.length > 1) throw new ToolError(`Several goals are titled "${ref}". Use the goal id from list_goals.`)
  throw new ToolError(`No goal found for "${ref}". Use list_goals to see goal ids.`)
}

function findCheckpoint(goal: Goal, ref: string): Checkpoint {
  const found = goal.checkpoints.find((c) => c.id === ref) ?? goal.checkpoints.filter((c) => norm(c.title) === norm(ref))[0]
  if (!found) throw new ToolError(`Goal "${goal.title}" has no checkpoint "${ref}". Use get_goal to see its checkpoints.`)
  return found
}

function findPlan(data: AppData, id: string): Plan {
  const plan = data.plans.find((p) => p.id === id)
  if (!plan) throw new ToolError(`No plan with id "${id}". Use list_plans to see plan ids.`)
  return plan
}

/** Tag id for a name, creating the tag (as an op) when it is new. `undefined` means "leave unchanged". */
function tagResolver(data: AppData, ops: StoreOp[]) {
  const tags: Tag[] = [...data.tags]
  return (name: string | null | undefined): string | null | undefined => {
    if (name === undefined || name === null) return name
    const existing = tags.find((t) => norm(t.name) === norm(name))
    if (existing) return existing.id
    const tag: Tag = { id: newId(), name: name.trim(), color: nextTagColor(tags) }
    tags.push(tag)
    ops.push({ type: 'upsertTag', tag })
    return tag.id
  }
}

// ---- Output shapes (what Claude sees) ----

const tagOf = (data: AppData, id: string | null): string | null => data.tags.find((t) => t.id === id)?.name ?? null

function goalJson(s: GoalSummary, data: AppData, today: string, detail = false) {
  const g = s.goal
  const daysLeft = g.endDate && !s.completed ? daysUntil(today, g.endDate) : null
  return {
    id: g.id,
    title: g.title,
    ...(g.description ? { description: g.description } : {}),
    status: s.status === 'past' ? 'completed' : s.status,
    tag: tagOf(data, g.tagId),
    start_date: g.startDate,
    end_date: g.endDate,
    ...(daysLeft !== null ? { days_left: daysLeft } : {}),
    target_hours: g.targetHours,
    studied_hours: hours(s.studiedMs),
    progress_percent: Math.round(s.progress * 100),
    ...(s.completed ? { completed_on: toYmd(new Date(s.completedAt!)), completed_by: s.autoCompleted ? 'target hours reached' : 'marked complete' } : {}),
    checkpoints: g.checkpoints.map((c) => ({
      id: c.id,
      title: c.title,
      done: c.done,
      ...(c.tagId ? { tag: tagOf(data, c.tagId) } : {}),
      ...(detail ? { studied_hours: hours(s.byCheckpoint.get(c.id) ?? 0) } : {}),
      ...(c.done && c.doneAt ? { done_on: toYmd(new Date(c.doneAt)) } : {})
    }))
  }
}

function planJson(p: Plan, data: AppData, studied: Map<string, number>) {
  const goal = p.goalId ? data.goals.find((g) => g.id === p.goalId) : undefined
  const cp = goal?.checkpoints.find((c) => c.id === p.checkpointId)
  return {
    id: p.id,
    title: p.title,
    date: p.date,
    start_time: p.startTime,
    end_time: minutesToHm(hmToMinutes(p.startTime) + p.durationMin),
    duration_minutes: p.durationMin,
    tag: tagOf(data, p.tagId),
    goal: goal ? { id: goal.id, title: goal.title } : null,
    checkpoint: cp ? { id: cp.id, title: cp.title } : null,
    ...(p.description ? { description: p.description } : {}),
    studied_minutes: Math.round((studied.get(p.id) ?? 0) / 60_000)
  }
}

const byStart = (a: Plan, b: Plan): number => (a.date + a.startTime).localeCompare(b.date + b.startTime)

/** Plans on the same day whose times overlap the given one. */
function overlaps(plans: Plan[], p: Pick<Plan, 'id' | 'date' | 'startTime' | 'durationMin'>): Plan[] {
  const a = hmToMinutes(p.startTime)
  return plans.filter((o) => o.id !== p.id && o.date === p.date && hmToMinutes(o.startTime) < a + p.durationMin && a < hmToMinutes(o.startTime) + o.durationMin)
}

// ---- The actions ----

export interface ToolSpec {
  name: string
  title: string
  description: string
  input: z.ZodRawShape
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean }
  run: (input: never, ctx: { port: Port; now: () => number }) => Promise<unknown>
}

function tool<S extends z.ZodRawShape>(spec: {
  name: string
  title: string
  description: string
  input: S
  annotations: ToolSpec['annotations']
  run: (input: z.infer<z.ZodObject<S>>, ctx: { port: Port; now: () => number }) => Promise<unknown>
}): ToolSpec {
  return spec as unknown as ToolSpec
}

export const TOOLS: ToolSpec[] = [
  tool({
    name: 'get_overview',
    title: 'Study overview',
    description:
      "Today's date and time, today's and the next two days' study plans, goals in progress, and study time over the last 14 days. A good first call.",
    input: {},
    annotations: { readOnlyHint: true },
    async run(_input, { port, now }) {
      const data = await port.read()
      const today = todayYmd(now())
      const studied = msByPlan(data.logs)
      const summaries = summarizeGoals(data, today)
      const days = recentDays(data.logs, today)
      const plansOn = (d: string): ReturnType<typeof planJson>[] =>
        data.plans.filter((p) => p.date === d).sort(byStart).map((p) => planJson(p, data, studied))
      return {
        today,
        weekday: parseYmd(today).toLocaleDateString('en-US', { weekday: 'long' }),
        now: minutesToHm(new Date(now()).getHours() * 60 + new Date(now()).getMinutes()),
        today_plans: plansOn(today),
        upcoming_plans: [...plansOn(addDays(today, 1)), ...plansOn(addDays(today, 2))],
        goals_in_progress: [...summaries.values()].filter((s) => s.status === 'current').map((s) => goalJson(s, data, today)),
        last_14_days: {
          total_hours: hours(days.reduce((sum, d) => sum + d.ms, 0)),
          streak_days: currentStreak(data.logs, today),
          by_day: days.map((d) => ({ date: d.date, minutes: Math.round(d.ms / 60_000) }))
        }
      }
    }
  }),

  tool({
    name: 'list_goals',
    title: 'List goals',
    description: 'Goals with their checkpoints and progress. Filter by status: current (in progress), upcoming (starts later), completed, or all.',
    input: { status: z.enum(['current', 'upcoming', 'completed', 'all']).optional().describe('Default: all') },
    annotations: { readOnlyHint: true },
    async run({ status = 'all' }, { port, now }) {
      const data = await port.read()
      const today = todayYmd(now())
      const want = status === 'completed' ? 'past' : status
      const goals = [...summarizeGoals(data, today).values()].filter((s) => want === 'all' || s.status === want)
      return { goals: goals.map((s) => goalJson(s, data, today)) }
    }
  }),

  tool({
    name: 'get_goal',
    title: 'Goal details',
    description: 'One goal in detail: checkpoints with study time on each, weekly study hours over the last 8 weeks, and upcoming plans linked to it.',
    input: { goal: goalRef },
    annotations: { readOnlyHint: true },
    async run({ goal }, { port, now }) {
      const data = await port.read()
      const today = todayYmd(now())
      const g = findGoal(data, goal)
      const s = summarizeGoals(data, today).get(g.id)!
      const studied = msByPlan(data.logs)
      const weeks = periodSeries(
        s.entries.map((e) => e.log),
        'week',
        today,
        8
      )
      return {
        ...goalJson(s, data, today, true),
        ...(s.byCheckpoint.get(null) ? { studied_hours_whole_goal: hours(s.byCheckpoint.get(null)!) } : {}),
        weekly_hours: weeks.map((w) => ({ week_of: w.start, hours: hours(w.breakdown.totalMs) })),
        upcoming_plans: data.plans
          .filter((p) => p.goalId === g.id && p.date >= today)
          .sort(byStart)
          .map((p) => planJson(p, data, studied))
      }
    }
  }),

  tool({
    name: 'list_plans',
    title: 'List study plans',
    description: 'Scheduled study plans between two dates (inclusive). Defaults to today through the next 6 days. At most 92 days.',
    input: { from: date.optional(), to: date.optional() },
    annotations: { readOnlyHint: true },
    async run({ from, to }, { port, now }) {
      const data = await port.read()
      const start = validDate(from ?? todayYmd(now()))
      const end = validDate(to ?? addDays(start, 6))
      if (end < start) throw new ToolError('"to" is before "from".')
      if (daysUntil(start, end) > 92) throw new ToolError('Ask for at most 92 days at a time.')
      const studied = msByPlan(data.logs)
      return {
        from: start,
        to: end,
        plans: data.plans
          .filter((p) => p.date >= start && p.date <= end)
          .sort(byStart)
          .map((p) => planJson(p, data, studied))
      }
    }
  }),

  tool({
    name: 'get_study_stats',
    title: 'Study statistics',
    description:
      'Recorded study time per day, week (Monday start) or month, split by tag, for the most recent periods. Study time comes from the timer and cannot be changed.',
    input: {
      unit: z.enum(['day', 'week', 'month']).optional().describe('Default: week'),
      periods: z.number().int().min(1).max(24).optional().describe('How many periods back, including the current one. Default 7'),
      tag: z.string().optional().describe('Only count this tag')
    },
    annotations: { readOnlyHint: true },
    async run({ unit = 'week', periods = 7, tag }, { port, now }) {
      const data = await port.read()
      let filter: string | null | undefined
      if (tag !== undefined) {
        filter = data.tags.find((t) => norm(t.name) === norm(tag))?.id
        if (!filter) throw new ToolError(`No tag named "${tag}". Use list_tags.`)
      }
      const series = periodSeries(data.logs, unit, todayYmd(now()), periods, filter)
      return {
        unit,
        total_hours: hours(series.reduce((sum, p) => sum + p.breakdown.totalMs, 0)),
        periods: series.map((p) => ({
          start: p.start,
          total_hours: hours(p.breakdown.totalMs),
          sessions: p.breakdown.sessions,
          by_tag: p.breakdown.slices.map((sl) => ({ tag: tagOf(data, sl.tagId) ?? 'Untagged', hours: hours(sl.ms) }))
        }))
      }
    }
  }),

  tool({
    name: 'list_tags',
    title: 'List tags',
    description: 'All tags, with how much study time each has in total.',
    input: {},
    annotations: { readOnlyHint: true },
    async run(_input, { port }) {
      const data = await port.read()
      const all = breakdown(data.logs, -Infinity, Infinity)
      return {
        tags: data.tags.map((t) => ({ name: t.name, total_hours: hours(all.slices.find((s) => s.tagId === t.id)?.ms ?? 0) }))
      }
    }
  }),

  tool({
    name: 'create_goal',
    title: 'Create goal',
    description:
      'Create a goal, optionally with ordered checkpoints. With target_hours set, the goal completes itself once that much study time is linked to it.',
    input: {
      title: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      tag: tagName.optional(),
      start_date: date.optional().describe('Default: today'),
      end_date: date.optional(),
      target_hours: z.number().positive().max(10000).optional(),
      checkpoints: z.array(checkpointInput).max(50).optional()
    },
    annotations: {},
    async run(input, { port, now }) {
      const data = await port.read()
      const ops: StoreOp[] = []
      const tag = tagResolver(data, ops)
      const startDate = validDate(input.start_date ?? todayYmd(now()))
      const endDate = input.end_date ? validDate(input.end_date) : null
      if (endDate && endDate < startDate) throw new ToolError('end_date is before start_date.')
      const goal: Goal = {
        id: newId(),
        title: input.title.trim(),
        description: input.description?.trim() ?? '',
        tagId: tag(input.tag) ?? null,
        startDate,
        endDate,
        targetHours: input.target_hours ?? null,
        completedAt: null,
        checkpoints: (input.checkpoints ?? []).map((c) => ({ id: newId(), title: c.title.trim(), tagId: tag(c.tag) ?? null, done: false, doneAt: null })),
        createdAt: now()
      }
      ops.push({ type: 'upsertGoal', goal })
      const next = await port.apply(ops)
      const today = todayYmd(now())
      return { created: goalJson(summarizeGoals(next, today).get(goal.id)!, next, today) }
    }
  }),

  tool({
    name: 'update_goal',
    title: 'Edit goal',
    description:
      'Change a goal: title, description, tag, dates, target hours, or mark it completed / reopen it. Pass null to clear tag, end_date or target_hours. Prefer editing over deleting.',
    input: {
      goal: goalRef,
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(2000).optional(),
      tag: tagName.nullable().optional(),
      start_date: date.optional(),
      end_date: date.nullable().optional(),
      target_hours: z.number().positive().max(10000).nullable().optional(),
      completed: z.boolean().optional().describe('true marks the goal completed; false reopens it')
    },
    annotations: { idempotentHint: true },
    async run(input, { port, now }) {
      const data = await port.read()
      const g = findGoal(data, input.goal)
      const ops: StoreOp[] = []
      const tag = tagResolver(data, ops)
      const updated: Goal = {
        ...g,
        title: input.title?.trim() ?? g.title,
        description: input.description?.trim() ?? g.description,
        tagId: input.tag === undefined ? g.tagId : (tag(input.tag) ?? null),
        startDate: input.start_date ? validDate(input.start_date) : g.startDate,
        endDate: input.end_date === undefined ? g.endDate : input.end_date === null ? null : validDate(input.end_date),
        targetHours: input.target_hours === undefined ? g.targetHours : input.target_hours,
        completedAt: input.completed === undefined ? g.completedAt : input.completed ? (g.completedAt ?? now()) : null
      }
      if (updated.endDate && updated.endDate < updated.startDate) throw new ToolError('end_date is before start_date.')
      ops.push({ type: 'upsertGoal', goal: updated })
      const next = await port.apply(ops)
      const today = todayYmd(now())
      const s = summarizeGoals(next, today).get(g.id)!
      return {
        updated: goalJson(s, next, today),
        ...(input.completed === false && s.autoCompleted
          ? { note: 'The goal stays completed because its target hours are reached. Raise or clear target_hours to reopen it.' }
          : {})
      }
    }
  }),

  tool({
    name: 'add_checkpoints',
    title: 'Add checkpoints',
    description: 'Add checkpoints to a goal, at the end or at a 1-based position.',
    input: {
      goal: goalRef,
      checkpoints: z.array(checkpointInput).min(1).max(50),
      position: z.number().int().min(1).optional().describe('1 inserts before the current first checkpoint. Default: at the end')
    },
    annotations: {},
    async run({ goal, checkpoints, position }, { port, now }) {
      const data = await port.read()
      const g = findGoal(data, goal)
      const ops: StoreOp[] = []
      const tag = tagResolver(data, ops)
      const added = checkpoints.map((c) => ({ id: newId(), title: c.title.trim(), tagId: tag(c.tag) ?? null, done: false, doneAt: null }))
      const at = Math.min(position ? position - 1 : g.checkpoints.length, g.checkpoints.length)
      ops.push({ type: 'upsertGoal', goal: { ...g, checkpoints: [...g.checkpoints.slice(0, at), ...added, ...g.checkpoints.slice(at)] } })
      const next = await port.apply(ops)
      const today = todayYmd(now())
      return { updated: goalJson(summarizeGoals(next, today).get(g.id)!, next, today) }
    }
  }),

  tool({
    name: 'update_checkpoint',
    title: 'Edit checkpoint',
    description: 'Rename a checkpoint, change its tag (null clears it), or tick it off / un-tick it.',
    input: { goal: goalRef, checkpoint: checkpointRef, title: z.string().min(1).max(200).optional(), tag: tagName.nullable().optional(), done: z.boolean().optional() },
    annotations: { idempotentHint: true },
    async run(input, { port, now }) {
      const data = await port.read()
      const g = findGoal(data, input.goal)
      const c = findCheckpoint(g, input.checkpoint)
      const ops: StoreOp[] = []
      const tag = tagResolver(data, ops)
      const done = input.done ?? c.done
      const updated: Checkpoint = {
        ...c,
        title: input.title?.trim() ?? c.title,
        tagId: input.tag === undefined ? c.tagId : (tag(input.tag) ?? null),
        done,
        doneAt: done ? (c.doneAt ?? now()) : null
      }
      ops.push({ type: 'upsertGoal', goal: { ...g, checkpoints: g.checkpoints.map((x) => (x.id === c.id ? updated : x)) } })
      const next = await port.apply(ops)
      const today = todayYmd(now())
      return { updated: goalJson(summarizeGoals(next, today).get(g.id)!, next, today) }
    }
  }),

  tool({
    name: 'reorder_checkpoints',
    title: 'Reorder checkpoints',
    description: "Put a goal's checkpoints in a new order. List every checkpoint (ids or titles) exactly once.",
    input: { goal: goalRef, order: z.array(checkpointRef).min(1) },
    annotations: { idempotentHint: true },
    async run({ goal, order }, { port, now }) {
      const data = await port.read()
      const g = findGoal(data, goal)
      const ordered = order.map((ref) => findCheckpoint(g, ref))
      if (new Set(ordered.map((c) => c.id)).size !== g.checkpoints.length || ordered.length !== g.checkpoints.length) {
        throw new ToolError(`List each of the goal's ${g.checkpoints.length} checkpoints exactly once.`)
      }
      const next = await port.apply([{ type: 'upsertGoal', goal: { ...g, checkpoints: ordered } }])
      const today = todayYmd(now())
      return { updated: goalJson(summarizeGoals(next, today).get(g.id)!, next, today) }
    }
  }),

  tool({
    name: 'remove_checkpoint',
    title: 'Remove checkpoint',
    description: 'Remove a checkpoint from a goal. Plans and study time linked to it stay, counted toward the goal as a whole.',
    input: { goal: goalRef, checkpoint: checkpointRef },
    annotations: { destructiveHint: true },
    async run({ goal, checkpoint }, { port, now }) {
      const data = await port.read()
      const g = findGoal(data, goal)
      const c = findCheckpoint(g, checkpoint)
      const next = await port.apply([{ type: 'upsertGoal', goal: { ...g, checkpoints: g.checkpoints.filter((x) => x.id !== c.id) } }])
      const today = todayYmd(now())
      return { removed: c.title, updated: goalJson(summarizeGoals(next, today).get(g.id)!, next, today) }
    }
  }),

  tool({
    name: 'delete_duplicate_goal',
    title: 'Delete duplicate goal',
    description:
      'Delete a goal ONLY when it is an exact duplicate of another goal: same title and the same checkpoints in the same order. Its plans and study time move to the goal that is kept, and ticked checkpoints carry over. Any other goal cannot be deleted here — edit it with update_goal, or ask the user to delete it in the app.',
    input: { goal: goalRef.describe('The duplicate to delete (id or exact title)'), keep: goalRef.describe('The identical goal to keep (id)') },
    annotations: { destructiveHint: true },
    async run({ goal, keep }, { port, now }) {
      const data = await port.read()
      // Titles are identical for duplicates, so ids are needed to tell them apart.
      const dup = data.goals.find((g) => g.id === goal)
      const kept = data.goals.find((g) => g.id === keep)
      if (!dup || !kept) throw new ToolError('Use goal ids from list_goals for both goals.')
      if (dup.id === kept.id) throw new ToolError('"goal" and "keep" are the same goal.')
      const same =
        norm(dup.title) === norm(kept.title) &&
        dup.checkpoints.length === kept.checkpoints.length &&
        dup.checkpoints.every((c, i) => norm(c.title) === norm(kept.checkpoints[i].title))
      if (!same) {
        throw new ToolError(
          'These goals are not identical (title and checkpoints must match), so the goal cannot be deleted. Edit it with update_goal instead, or ask the user to delete it in Study Tracker.'
        )
      }
      // Checkpoints line up one-to-one, so links move by position.
      const mapCp = (id: string | null): string | null => {
        const i = dup.checkpoints.findIndex((c) => c.id === id)
        return i === -1 ? null : kept.checkpoints[i].id
      }
      const ops: StoreOp[] = []
      const movedPlans = data.plans.filter((p) => p.goalId === dup.id)
      for (const p of movedPlans) ops.push({ type: 'upsertPlan', plan: { ...p, goalId: kept.id, checkpointId: mapCp(p.checkpointId) } })
      const movedLogs = data.logs.filter((l) => l.goalId === dup.id)
      for (const l of movedLogs) ops.push({ type: 'upsertLog', log: { ...l, goalId: kept.id, checkpointId: mapCp(l.checkpointId) } })
      const merged: Goal = {
        ...kept,
        checkpoints: kept.checkpoints.map((c, i) => {
          const other = dup.checkpoints[i]
          return c.done || !other.done ? c : { ...c, done: true, doneAt: other.doneAt }
        })
      }
      ops.push({ type: 'upsertGoal', goal: merged }, { type: 'deleteGoal', id: dup.id })
      const next = await port.apply(ops)
      const today = todayYmd(now())
      return {
        deleted: dup.id,
        moved_plans: movedPlans.length,
        moved_sessions: movedLogs.length,
        kept: goalJson(summarizeGoals(next, today).get(kept.id)!, next, today)
      }
    }
  }),

  tool({
    name: 'create_plans',
    title: 'Create study plans',
    description:
      'Schedule one or more study plans. Link a plan to a goal (and optionally one of its checkpoints) so studying it counts toward the goal; without a tag, it takes the checkpoint or goal tag. Reports overlaps with existing plans.',
    input: {
      plans: z
        .array(
          z.object({
            title: z.string().min(1).max(200),
            date,
            start_time: time,
            duration_minutes: z.number().int().min(5).max(1440),
            goal: goalRef.optional(),
            checkpoint: checkpointRef.optional(),
            tag: tagName.optional(),
            description: z.string().max(2000).optional()
          })
        )
        .min(1)
        .max(50)
    },
    annotations: {},
    async run({ plans }, { port, now }) {
      const data = await port.read()
      const ops: StoreOp[] = []
      const tag = tagResolver(data, ops)
      const created: Plan[] = plans.map((input) => {
        const g = input.goal ? findGoal(data, input.goal) : undefined
        if (input.checkpoint && !g) throw new ToolError('A checkpoint needs its goal.')
        const c = g && input.checkpoint ? findCheckpoint(g, input.checkpoint) : undefined
        return {
          id: newId(),
          title: input.title.trim(),
          date: validDate(input.date),
          startTime: input.start_time,
          durationMin: input.duration_minutes,
          tagId: input.tag !== undefined ? (tag(input.tag) ?? null) : (c?.tagId ?? g?.tagId ?? null),
          goalId: g?.id ?? null,
          checkpointId: c?.id ?? null,
          description: input.description?.trim() ?? '',
          createdAt: now()
        }
      })
      for (const plan of created) ops.push({ type: 'upsertPlan', plan })
      const next = await port.apply(ops)
      const studied = msByPlan(next.logs)
      const warnings = created.flatMap((p) =>
        overlaps(next.plans, p).map((o) => `"${p.title}" overlaps "${o.title}" on ${p.date} (${o.startTime}, ${o.durationMin} min).`)
      )
      return { created: created.map((p) => planJson(p, next, studied)), ...(warnings.length ? { warnings } : {}) }
    }
  }),

  tool({
    name: 'update_plan',
    title: 'Edit study plan',
    description: 'Change or move a study plan. Pass null for goal, checkpoint or tag to clear the link.',
    input: {
      plan_id: z.string().min(1),
      title: z.string().min(1).max(200).optional(),
      date: date.optional(),
      start_time: time.optional(),
      duration_minutes: z.number().int().min(5).max(1440).optional(),
      goal: goalRef.nullable().optional(),
      checkpoint: checkpointRef.nullable().optional(),
      tag: tagName.nullable().optional(),
      description: z.string().max(2000).optional()
    },
    annotations: { idempotentHint: true },
    async run(input, { port }) {
      const data = await port.read()
      const p = findPlan(data, input.plan_id)
      const ops: StoreOp[] = []
      const tag = tagResolver(data, ops)
      let goalId = p.goalId
      let checkpointId = p.checkpointId
      if (input.goal !== undefined) {
        goalId = input.goal === null ? null : findGoal(data, input.goal).id
        if (goalId !== p.goalId) checkpointId = null
      }
      if (input.checkpoint !== undefined) {
        if (input.checkpoint === null) checkpointId = null
        else {
          const g = goalId ? data.goals.find((x) => x.id === goalId) : undefined
          if (!g) throw new ToolError('Link the plan to a goal before choosing a checkpoint.')
          checkpointId = findCheckpoint(g, input.checkpoint).id
        }
      }
      const updated: Plan = {
        ...p,
        title: input.title?.trim() ?? p.title,
        date: input.date ? validDate(input.date) : p.date,
        startTime: input.start_time ?? p.startTime,
        durationMin: input.duration_minutes ?? p.durationMin,
        tagId: input.tag === undefined ? p.tagId : (tag(input.tag) ?? null),
        goalId,
        checkpointId,
        description: input.description?.trim() ?? p.description
      }
      ops.push({ type: 'upsertPlan', plan: updated })
      const next = await port.apply(ops)
      const warnings = overlaps(next.plans, updated).map((o) => `Overlaps "${o.title}" (${o.startTime}, ${o.durationMin} min).`)
      return { updated: planJson(updated, next, msByPlan(next.logs)), ...(warnings.length ? { warnings } : {}) }
    }
  }),

  tool({
    name: 'delete_plan',
    title: 'Delete study plan',
    description: 'Delete a study plan. Study time already recorded for it is kept.',
    input: { plan_id: z.string().min(1) },
    annotations: { destructiveHint: true },
    async run({ plan_id }, { port }) {
      const data = await port.read()
      const p = findPlan(data, plan_id)
      await port.apply([{ type: 'deletePlan', id: p.id }])
      return { deleted: { id: p.id, title: p.title, date: p.date, start_time: p.startTime } }
    }
  })
]

export const SERVER_INSTRUCTIONS = `Study Tracker is the user's personal study planner on this computer.
- Goals have ordered checkpoints. Plans are scheduled study sessions (date, start time, duration), optionally linked to a goal and checkpoint.
- Study time is recorded by the app's timer. You can read it but never change it.
- Dates are local YYYY-MM-DD; times are 24-hour HH:mm. Call get_overview first to learn today's date.
- Prefer editing goals over removing anything. A goal can only be deleted when it is an exact duplicate (delete_duplicate_goal); otherwise ask the user to delete it in the app.
- Before creating or changing several things at once, briefly confirm the plan with the user.`
