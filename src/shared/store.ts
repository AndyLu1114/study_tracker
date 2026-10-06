import type { AppData, Checkpoint, Goal, Plan, Settings, StudyLog, Tag } from './types'

export const PALETTE_SIZE = 8

export type StoreOp =
  | { type: 'upsertPlan'; plan: Plan }
  | { type: 'deletePlan'; id: string }
  | { type: 'upsertGoal'; goal: Goal }
  | { type: 'deleteGoal'; id: string }
  | { type: 'upsertTag'; tag: Tag }
  | { type: 'deleteTag'; id: string }
  | { type: 'upsertLog'; log: StudyLog }
  | { type: 'deleteLog'; id: string }
  | { type: 'updateSettings'; settings: Partial<Settings> }
  | { type: 'replaceAll'; data: AppData }

export function defaultSettings(): Settings {
  return {
    language: 'en',
    theme: 'system',
    notifications: true,
    countdownMin: 25,
    pomodoro: { focusMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
    seenHelp: false
  }
}

export function emptyData(): AppData {
  return { app: 'study-tracker', version: 1, tags: [], goals: [], plans: [], logs: [], settings: defaultSettings() }
}

export function newId(): string {
  return globalThis.crypto.randomUUID()
}

/** First palette slot no tag uses yet; once all are taken, wrap around. */
export function nextTagColor(tags: Tag[]): number {
  const used = new Set(tags.map((t) => t.color))
  for (let i = 0; i < PALETTE_SIZE; i++) if (!used.has(i)) return i
  return tags.length % PALETTE_SIZE
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id)
  if (i === -1) return [...list, item]
  const copy = list.slice()
  copy[i] = item
  return copy
}

export function applyOp(data: AppData, op: StoreOp): AppData {
  switch (op.type) {
    case 'upsertPlan':
      return { ...data, plans: upsert(data.plans, op.plan) }
    case 'deletePlan': {
      const plan = data.plans.find((p) => p.id === op.id)
      return {
        ...data,
        plans: data.plans.filter((p) => p.id !== op.id),
        // Keep the studied time; it still counts toward the plan's goal.
        logs: data.logs.map((l) =>
          l.planId === op.id
            ? { ...l, planId: null, goalId: plan?.goalId ?? null, checkpointId: plan?.checkpointId ?? null }
            : l
        )
      }
    }
    case 'upsertGoal': {
      // Plans and sessions pointing at a removed checkpoint fall back to the whole goal.
      const ids = new Set(op.goal.checkpoints.map((c) => c.id))
      const fix = <T extends { goalId: string | null; checkpointId: string | null }>(x: T): T =>
        x.goalId === op.goal.id && x.checkpointId && !ids.has(x.checkpointId) ? { ...x, checkpointId: null } : x
      return { ...data, goals: upsert(data.goals, op.goal), plans: data.plans.map(fix), logs: data.logs.map(fix) }
    }
    case 'deleteGoal': {
      const unlink = <T extends { goalId: string | null; checkpointId: string | null }>(x: T): T =>
        x.goalId === op.id ? { ...x, goalId: null, checkpointId: null } : x
      return { ...data, goals: data.goals.filter((g) => g.id !== op.id), plans: data.plans.map(unlink), logs: data.logs.map(unlink) }
    }
    case 'upsertTag':
      return { ...data, tags: upsert(data.tags, op.tag) }
    case 'deleteTag':
      return {
        ...data,
        tags: data.tags.filter((t) => t.id !== op.id),
        goals: data.goals.map((g) => ({
          ...g,
          tagId: g.tagId === op.id ? null : g.tagId,
          checkpoints: g.checkpoints.map((c) => (c.tagId === op.id ? { ...c, tagId: null } : c))
        })),
        plans: data.plans.map((p) => (p.tagId === op.id ? { ...p, tagId: null } : p)),
        logs: data.logs.map((l) => (l.tagId === op.id ? { ...l, tagId: null } : l))
      }
    case 'upsertLog':
      return { ...data, logs: upsert(data.logs, op.log) }
    case 'deleteLog':
      return { ...data, logs: data.logs.filter((l) => l.id !== op.id) }
    case 'updateSettings':
      return { ...data, settings: { ...data.settings, ...op.settings } }
    case 'replaceAll':
      return normalizeData(op.data)
  }
}

// ---- Validation for loaded and imported files ----

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const YMD = /^\d{4}-\d{2}-\d{2}$/
const HM = /^\d{2}:\d{2}$/

/**
 * Turns parsed JSON into valid AppData, filling defaults for missing fields and
 * dropping records that cannot be repaired. Throws if it is not our file at all.
 */
export function normalizeData(raw: unknown): AppData {
  if (!isObj(raw) || raw.app !== 'study-tracker') {
    throw new Error('Not a Study Tracker data file')
  }
  const tags: Tag[] = (Array.isArray(raw.tags) ? raw.tags : [])
    .filter(isObj)
    .filter((t) => typeof t.id === 'string' && typeof t.name === 'string')
    .map((t, i) => ({ id: t.id as string, name: t.name as string, color: num(t.color, i) % PALETTE_SIZE }))
  const tagIds = new Set(tags.map((t) => t.id))
  const tagRef = (v: unknown): string | null => {
    const id = strOrNull(v)
    return id && tagIds.has(id) ? id : null
  }

  const goals: Goal[] = (Array.isArray(raw.goals) ? raw.goals : [])
    .filter(isObj)
    .filter((g) => typeof g.id === 'string' && YMD.test(str(g.startDate)))
    .map((g) => ({
      id: g.id as string,
      title: str(g.title),
      description: str(g.description),
      tagId: tagRef(g.tagId),
      startDate: g.startDate as string,
      endDate: YMD.test(str(g.endDate)) ? (g.endDate as string) : null,
      targetHours: typeof g.targetHours === 'number' && g.targetHours > 0 ? g.targetHours : null,
      completedAt: typeof g.completedAt === 'number' ? g.completedAt : null,
      checkpoints: (Array.isArray(g.checkpoints) ? g.checkpoints : [])
        .filter(isObj)
        .filter((c) => typeof c.id === 'string')
        .map(
          (c): Checkpoint => ({
            id: c.id as string,
            title: str(c.title),
            tagId: tagRef(c.tagId),
            done: c.done === true,
            doneAt: c.done === true && typeof c.doneAt === 'number' ? c.doneAt : null
          })
        ),
      createdAt: num(g.createdAt, 0)
    }))
  const goalById = new Map(goals.map((g) => [g.id, g]))
  /** A valid [goalId, checkpointId] pair, or nulls. */
  const goalRef = (goalId: unknown, checkpointId: unknown): [string | null, string | null] => {
    const goal = goalById.get(str(goalId))
    if (!goal) return [null, null]
    return [goal.id, goal.checkpoints.some((c) => c.id === checkpointId) ? (checkpointId as string) : null]
  }

  const plans: Plan[] = (Array.isArray(raw.plans) ? raw.plans : [])
    .filter(isObj)
    .filter((p) => typeof p.id === 'string' && YMD.test(str(p.date)) && HM.test(str(p.startTime)))
    .map((p) => ({
      id: p.id as string,
      title: str(p.title),
      date: p.date as string,
      startTime: p.startTime as string,
      durationMin: Math.max(1, Math.round(num(p.durationMin, 60))),
      tagId: tagRef(p.tagId),
      ...(([goalId, checkpointId]) => ({ goalId, checkpointId }))(goalRef(p.goalId, p.checkpointId)),
      description: str(p.description),
      createdAt: num(p.createdAt, 0)
    }))
  const planIds = new Set(plans.map((p) => p.id))

  const sources = ['stopwatch', 'countdown', 'pomodoro', 'manual']
  const logs: StudyLog[] = (Array.isArray(raw.logs) ? raw.logs : [])
    .filter(isObj)
    .filter((l) => typeof l.id === 'string' && Array.isArray(l.segments))
    .map((l) => ({
      id: l.id as string,
      segments: (l.segments as unknown[])
        .filter(isObj)
        .map((s) => ({ start: num(s.start, NaN), end: num(s.end, NaN) }))
        .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start),
      source: (sources.includes(str(l.source)) ? l.source : 'manual') as StudyLog['source'],
      tagId: tagRef(l.tagId),
      planId: planIds.has(str(l.planId)) ? (l.planId as string) : null,
      ...(([goalId, checkpointId]) => ({ goalId, checkpointId }))(goalRef(l.goalId, l.checkpointId)),
      note: str(l.note),
      createdAt: num(l.createdAt, 0)
    }))
    .filter((l) => l.segments.length > 0)

  const d = defaultSettings()
  const s = isObj(raw.settings) ? raw.settings : {}
  const p = isObj(s.pomodoro) ? s.pomodoro : {}
  const positive = (v: unknown, fallback: number): number => {
    const n = Math.round(num(v, fallback))
    return n >= 1 ? n : fallback
  }
  const settings: Settings = {
    language: s.language === 'zh-TW' ? 'zh-TW' : 'en',
    theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : 'system',
    notifications: typeof s.notifications === 'boolean' ? s.notifications : d.notifications,
    countdownMin: positive(s.countdownMin, d.countdownMin),
    pomodoro: {
      focusMin: positive(p.focusMin, d.pomodoro.focusMin),
      shortBreakMin: positive(p.shortBreakMin, d.pomodoro.shortBreakMin),
      longBreakMin: positive(p.longBreakMin, d.pomodoro.longBreakMin),
      longBreakEvery: positive(p.longBreakEvery, d.pomodoro.longBreakEvery)
    },
    seenHelp: s.seenHelp === true
  }

  return { app: 'study-tracker', version: 1, tags, goals, plans, logs, settings }
}

export function logDurationMs(log: StudyLog): number {
  return log.segments.reduce((sum, s) => sum + (s.end - s.start), 0)
}
