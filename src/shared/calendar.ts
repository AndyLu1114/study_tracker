import { addDays, hmToMinutes } from './dates'
import type { Plan } from './types'

export interface CalendarBlock {
  plan: Plan
  /** Minutes since this day's midnight. */
  startMin: number
  endMin: number
  /** Started on the previous day. */
  fromPrevDay: boolean
  /** Runs past midnight into the next day. */
  intoNextDay: boolean
  column: number
  columns: number
}

/** The part of each plan that falls on `ymd`, laid out side by side where they overlap. */
export function layoutDay(plans: Plan[], ymd: string): CalendarBlock[] {
  const prev = addDays(ymd, -1)
  const raw: Omit<CalendarBlock, 'column' | 'columns'>[] = []
  for (const plan of plans) {
    const start = hmToMinutes(plan.startTime)
    const end = start + plan.durationMin
    if (plan.date === ymd) {
      raw.push({ plan, startMin: start, endMin: Math.min(end, 1440), fromPrevDay: false, intoNextDay: end > 1440 })
    } else if (plan.date === prev && end > 1440) {
      raw.push({ plan, startMin: 0, endMin: Math.min(end - 1440, 1440), fromPrevDay: true, intoNextDay: end > 2880 })
    }
  }
  raw.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)

  const out: CalendarBlock[] = []
  let cluster: CalendarBlock[] = []
  let clusterEnd = -1
  let columnEnds: number[] = []
  const flush = (): void => {
    for (const b of cluster) b.columns = columnEnds.length
    out.push(...cluster)
    cluster = []
    columnEnds = []
  }
  for (const r of raw) {
    if (cluster.length && r.startMin >= clusterEnd) flush()
    let column = columnEnds.findIndex((end) => end <= r.startMin)
    if (column === -1) {
      column = columnEnds.length
      columnEnds.push(r.endMin)
    } else {
      columnEnds[column] = r.endMin
    }
    cluster.push({ ...r, column, columns: 1 })
    clusterEnd = Math.max(clusterEnd, r.endMin)
  }
  flush()
  return out
}
