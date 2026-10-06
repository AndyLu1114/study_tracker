import { overlapMs } from './stats'
import type { AppData, Goal, Plan, StudyLog } from './types'

const HOUR = 3_600_000

export type GoalStatus = 'current' | 'upcoming' | 'past'

/** A session counted toward a goal, with the checkpoint it counts toward (null = the whole goal). */
export interface GoalEntry {
  log: StudyLog
  checkpointId: string | null
}

export interface GoalSummary {
  goal: Goal
  entries: GoalEntry[]
  studiedMs: number
  /** Studied ms per checkpoint id; `null` is time linked to the goal as a whole. */
  byCheckpoint: Map<string | null, number>
  completed: boolean
  completedAt: number | null
  /** Completed because the target hours were reached (rather than by hand). */
  autoCompleted: boolean
  status: GoalStatus
  /** 0–1: hours toward the target if one is set, else the share of checkpoints ticked. */
  progress: number
  checkpointsDone: number
}

/** The goal a session counts toward: its plan's link, or its own once the plan is gone. */
export function logGoalLink(log: StudyLog, planById: Map<string, Plan>): { goalId: string | null; checkpointId: string | null } {
  const plan = log.planId ? planById.get(log.planId) : undefined
  if (plan) return { goalId: plan.goalId, checkpointId: plan.checkpointId }
  return { goalId: log.goalId, checkpointId: log.checkpointId }
}

/** When the running total of `logs` first reaches `targetMs`, or null if it never does. */
export function timeTargetReached(logs: StudyLog[], targetMs: number): number | null {
  const segments = logs.flatMap((l) => l.segments).sort((a, b) => a.start - b.start)
  let total = 0
  for (const s of segments) {
    const len = s.end - s.start
    if (total + len >= targetMs) return s.start + (targetMs - total)
    total += len
  }
  return null
}

export function summarizeGoal(goal: Goal, entries: GoalEntry[], today: string): GoalSummary {
  const byCheckpoint = new Map<string | null, number>()
  let studiedMs = 0
  for (const { log, checkpointId } of entries) {
    const ms = overlapMs(log, -Infinity, Infinity)
    studiedMs += ms
    byCheckpoint.set(checkpointId, (byCheckpoint.get(checkpointId) ?? 0) + ms)
  }
  const targetMs = goal.targetHours ? goal.targetHours * HOUR : null
  const autoAt = targetMs
    ? timeTargetReached(
        entries.map((e) => e.log),
        targetMs
      )
    : null
  const completedAt = goal.completedAt ?? autoAt
  const completed = completedAt !== null
  const checkpointsDone = goal.checkpoints.filter((c) => c.done).length
  let progress: number
  if (targetMs) progress = Math.min(1, studiedMs / targetMs)
  else if (goal.checkpoints.length) progress = checkpointsDone / goal.checkpoints.length
  else progress = completed ? 1 : 0

  return {
    goal,
    entries,
    studiedMs,
    byCheckpoint,
    completed,
    completedAt,
    autoCompleted: goal.completedAt === null && autoAt !== null,
    status: completed ? 'past' : goal.startDate > today ? 'upcoming' : 'current',
    progress,
    checkpointsDone
  }
}

/** Summaries for every goal, in one pass over the sessions. */
export function summarizeGoals(data: AppData, today: string): Map<string, GoalSummary> {
  const planById = new Map(data.plans.map((p) => [p.id, p]))
  const entriesByGoal = new Map<string, GoalEntry[]>()
  for (const log of data.logs) {
    const { goalId, checkpointId } = logGoalLink(log, planById)
    if (!goalId) continue
    const list = entriesByGoal.get(goalId) ?? []
    list.push({ log, checkpointId })
    entriesByGoal.set(goalId, list)
  }
  return new Map(data.goals.map((g) => [g.id, summarizeGoal(g, entriesByGoal.get(g.id) ?? [], today)]))
}

/** Whole days from `today` until `ymd` (negative once it has passed). */
export function daysUntil(today: string, ymd: string): number {
  const utc = (d: string): number => {
    const [y, m, day] = d.split('-').map(Number)
    return Date.UTC(y, m - 1, day)
  }
  return Math.round((utc(ymd) - utc(today)) / 86_400_000)
}

/** Time left on a plan: planned minus what's already been studied against it. */
export function planRemainingMs(plan: Plan, studiedMs: number): number {
  return Math.max(0, plan.durationMin * 60_000 - studiedMs)
}
