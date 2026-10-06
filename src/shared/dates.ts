// Local-time date helpers. Dates are passed around as YYYY-MM-DD strings.

const pad = (n: number): string => String(n).padStart(2, '0')

export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayYmd(now: number = Date.now()): string {
  return toYmd(new Date(now))
}

export function addDays(ymd: string, days: number): string {
  const d = parseYmd(ymd)
  d.setDate(d.getDate() + days)
  return toYmd(d)
}

/** Monday of the week containing `ymd`. */
export function startOfWeek(ymd: string): string {
  const d = parseYmd(ymd)
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  return toYmd(d)
}

export function startOfMonth(ymd: string): string {
  return ymd.slice(0, 8) + '01'
}

export function addMonths(ymd: string, months: number): string {
  const d = parseYmd(startOfMonth(ymd))
  d.setMonth(d.getMonth() + months)
  return toYmd(d)
}

/** Epoch ms of local midnight at the start of `ymd`. */
export function dayStartMs(ymd: string): number {
  return parseYmd(ymd).getTime()
}

/** Minutes since midnight for an HH:mm string. */
export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}

export function minutesToHm(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

export function msToHm(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Epoch ms for a local date + HH:mm. */
export function ymdHmToMs(ymd: string, hm: string): number {
  const d = parseYmd(ymd)
  const mins = hmToMinutes(hm)
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
  return d.getTime()
}
