import { addDays, addMonths, dayStartMs, startOfMonth, startOfWeek } from './dates'
import type { StudyLog } from './types'

export type Unit = 'day' | 'week' | 'month'

const MIN = 60_000

/** Focused ms of `log` that falls inside [startMs, endMs). */
export function overlapMs(log: StudyLog, startMs: number, endMs: number): number {
  let sum = 0
  for (const s of log.segments) {
    const a = Math.max(s.start, startMs)
    const b = Math.min(s.end, endMs)
    if (b > a) sum += b - a
  }
  return sum
}

export interface TagSlice {
  tagId: string | null
  ms: number
  sessions: number
}

export interface Breakdown {
  totalMs: number
  sessions: number
  /** Largest first. */
  slices: TagSlice[]
}

export function breakdown(logs: StudyLog[], startMs: number, endMs: number, tagFilter?: string | null): Breakdown {
  const byTag = new Map<string | null, TagSlice>()
  let totalMs = 0
  let sessions = 0
  for (const log of logs) {
    if (tagFilter !== undefined && log.tagId !== tagFilter) continue
    const ms = overlapMs(log, startMs, endMs)
    if (ms <= 0) continue
    const slice = byTag.get(log.tagId) ?? { tagId: log.tagId, ms: 0, sessions: 0 }
    slice.ms += ms
    slice.sessions += 1
    byTag.set(log.tagId, slice)
    totalMs += ms
    sessions += 1
  }
  const slices = [...byTag.values()].sort((a, b) => b.ms - a.ms)
  return { totalMs, sessions, slices }
}

// ---- Check-in grid ----

export type Level = 0 | 1 | 2 | 3 | 4

/** none / under 30 min / 30–60 min / 1–3 h / 3 h and more */
export function checkInLevel(ms: number): Level {
  if (ms <= 0) return 0
  if (ms < 30 * MIN) return 1
  if (ms < 60 * MIN) return 2
  if (ms < 180 * MIN) return 3
  return 4
}

export interface DayCell {
  date: string
  ms: number
  level: Level
}

/** The last `days` days, oldest first, ending with `today`. */
export function recentDays(logs: StudyLog[], today: string, days = 14): DayCell[] {
  const cells: DayCell[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i)
    const ms = breakdown(logs, dayStartMs(date), dayStartMs(addDays(date, 1))).totalMs
    cells.push({ date, ms, level: checkInLevel(ms) })
  }
  return cells
}

/** Consecutive study days ending today (or yesterday, if today has nothing yet). */
export function currentStreak(logs: StudyLog[], today: string): number {
  const studied = (d: string): boolean => breakdown(logs, dayStartMs(d), dayStartMs(addDays(d, 1))).totalMs > 0
  let day = studied(today) ? today : addDays(today, -1)
  let n = 0
  while (studied(day) && n < 3650) {
    n++
    day = addDays(day, -1)
  }
  return n
}

// ---- Periods for the accumulated-time charts ----

export function periodStart(unit: Unit, ymd: string): string {
  if (unit === 'week') return startOfWeek(ymd)
  if (unit === 'month') return startOfMonth(ymd)
  return ymd
}

export function shiftPeriod(unit: Unit, start: string, n: number): string {
  if (unit === 'week') return addDays(start, 7 * n)
  if (unit === 'month') return addMonths(start, n)
  return addDays(start, n)
}

export function periodRange(unit: Unit, start: string): [number, number] {
  return [dayStartMs(start), dayStartMs(shiftPeriod(unit, start, 1))]
}

export interface PeriodTotals {
  start: string
  breakdown: Breakdown
}

/** `count` consecutive periods ending with the one that contains `lastYmd`. */
export function periodSeries(
  logs: StudyLog[],
  unit: Unit,
  lastYmd: string,
  count: number,
  tagFilter?: string | null
): PeriodTotals[] {
  const last = periodStart(unit, lastYmd)
  const out: PeriodTotals[] = []
  for (let i = count - 1; i >= 0; i--) {
    const start = shiftPeriod(unit, last, -i)
    const [a, b] = periodRange(unit, start)
    out.push({ start, breakdown: breakdown(logs, a, b, tagFilter) })
  }
  return out
}

/** Planned-vs-done: focused ms recorded against each plan id. */
export function msByPlan(logs: StudyLog[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of logs) {
    if (!l.planId) continue
    m.set(l.planId, (m.get(l.planId) ?? 0) + overlapMs(l, -Infinity, Infinity))
  }
  return m
}
