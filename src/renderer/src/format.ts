import { addDays, parseYmd, todayYmd } from '../../shared/dates'
import type { MessageKey } from '../../shared/i18n'

type T = (key: MessageKey) => string

export function weekdayShort(ymd: string, loc: string): string {
  return parseYmd(ymd).toLocaleDateString(loc, { weekday: 'short' })
}

export function monthDay(ymd: string, loc: string): string {
  return parseYmd(ymd).toLocaleDateString(loc, { month: 'numeric', day: 'numeric' })
}

/** "Today" / "Tomorrow" / "Yesterday", else e.g. "Tue, Oct 6" or "10月6日 週二". */
export function dayLabel(ymd: string, loc: string, t: T): string {
  const today = todayYmd()
  if (ymd === today) return t('common.today')
  if (ymd === addDays(today, 1)) return t('common.tomorrow')
  if (ymd === addDays(today, -1)) return t('common.yesterday')
  return longDate(ymd, loc)
}

export function longDate(ymd: string, loc: string): string {
  const d = parseYmd(ymd)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(loc, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' })
  })
}

/** 25:00 → "25:00", 3725000 ms → "1:02:05" */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
