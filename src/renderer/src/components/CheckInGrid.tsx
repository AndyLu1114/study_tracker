import type { ReactNode } from 'react'
import { useApp } from '../state'
import type { DayCell } from '../../../shared/stats'
import { longDate } from '../format'
import { parseYmd } from '../../../shared/dates'

/** Two weeks as 2 rows × 7 columns; columns line up by weekday. */
export function CheckInGrid({ days }: { days: DayCell[] }): ReactNode {
  const { t, fmt, loc } = useApp()
  const rows = [days.slice(0, 7), days.slice(7, 14)]
  const today = days[days.length - 1]?.date
  return (
    <div className="checkin">
      <div className="checkin-grid" role="grid">
        <div className="checkin-row head" role="row">
          {rows[0].map((d) => (
            <span key={d.date} className="checkin-dow">
              {parseYmd(d.date).toLocaleDateString(loc, { weekday: 'narrow' })}
            </span>
          ))}
        </div>
        {rows.map((row, i) => (
          <div key={i} className="checkin-row" role="row">
            {row.map((d) => (
              <span
                key={d.date}
                role="gridcell"
                className={`checkin-cell l${d.level}${d.date === today ? ' today' : ''}`}
                title={`${longDate(d.date, loc)} · ${fmt(d.ms)}`}
                aria-label={`${longDate(d.date, loc)}: ${fmt(d.ms)}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="checkin-legend">
        <span>{t('stats.less')}</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`checkin-cell sm l${l}`} />
        ))}
        <span>{t('stats.more')}</span>
      </div>
    </div>
  )
}
