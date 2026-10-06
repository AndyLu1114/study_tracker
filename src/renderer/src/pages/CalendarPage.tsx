import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useApp, useNow } from '../state'
import { PlanForm } from '../components/PlanForm'
import { tagColor } from '../components/ui'
import { addDays, hmToMinutes, minutesToHm, parseYmd, todayYmd } from '../../../shared/dates'
import { layoutDay } from '../../../shared/calendar'
import type { Plan } from '../../../shared/types'
import { monthDay, weekdayShort } from '../format'

const HOUR_PX = 52
const HOURS = Array.from({ length: 24 }, (_, h) => h)

export function CalendarPage(): ReactNode {
  const { data, t, loc, tagById } = useApp()
  const now = useNow(30_000)
  const today = todayYmd(now)
  const days = [today, addDays(today, 1), addDays(today, 2)]
  const [editing, setEditing] = useState<{ plan?: Plan; date?: string; startTime?: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const columns = useMemo(() => days.map((d) => ({ date: d, blocks: layoutDay(data.plans, d) })), [data.plans, today])

  // Open scrolled to an hour before now, or before today's first plan if that's earlier.
  useEffect(() => {
    const nowH = new Date().getHours()
    const first = columns[0].blocks[0]
    const target = Math.max(0, Math.min(nowH, first ? Math.floor(first.startMin / 60) : 24) - 1)
    scrollRef.current?.scrollTo({ top: target * HOUR_PX })
  }, [])

  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes()

  const onSlotClick = (date: string, e: React.MouseEvent<HTMLDivElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    const minutes = Math.floor(((e.clientY - rect.top) / HOUR_PX) * 2) * 30
    setEditing({ date, startTime: minutesToHm(Math.min(minutes, 23 * 60 + 30)) })
  }

  return (
    <div className="page calendar-page">
      <header className="page-head">
        <div>
          <h1>{t('calendar.title')}</h1>
          <p className="muted small">{t('calendar.hint')}</p>
        </div>
      </header>

      <div className="card calendar">
        <div className="cal-head">
          <div className="cal-gutter" />
          {days.map((d) => (
            <div key={d} className={`cal-day-head${d === today ? ' today' : ''}`}>
              <span className="cal-dow">{weekdayShort(d, loc)}</span>
              <span className="cal-date">{parseYmd(d).getDate()}</span>
              <span className="cal-rel">{d === today ? t('common.today') : d === days[1] ? t('common.tomorrow') : monthDay(d, loc)}</span>
            </div>
          ))}
        </div>
        <div className="cal-scroll" ref={scrollRef}>
          <div className="cal-grid" style={{ height: 24 * HOUR_PX }}>
            <div className="cal-gutter">
              {HOURS.map((h) => (
                <span key={h} className="cal-hour" style={{ top: h * HOUR_PX }}>
                  {h === 0 ? '' : minutesToHm(h * 60)}
                </span>
              ))}
            </div>
            {columns.map(({ date, blocks }) => (
              <div key={date} className="cal-col" onClick={(e) => onSlotClick(date, e)}>
                {HOURS.map((h) => (
                  <div key={h} className="cal-line" style={{ top: h * HOUR_PX }} />
                ))}
                {date === today && (
                  <div className="cal-now" style={{ top: (nowMin / 60) * HOUR_PX }}>
                    <span />
                  </div>
                )}
                {blocks.map((b) => {
                  const color = tagColor(tagById(b.plan.tagId)?.color)
                  const height = Math.max(((b.endMin - b.startMin) / 60) * HOUR_PX - 2, 20)
                  const compact = height < 44
                  return (
                    <button
                      key={b.plan.id}
                      className={`cal-block${compact ? ' compact' : ''}${b.plan.date < today || (b.plan.date === today && b.endMin <= nowMin && !b.intoNextDay) ? ' past' : ''}`}
                      style={{
                        top: (b.startMin / 60) * HOUR_PX + 1,
                        height,
                        left: `calc(${(b.column / b.columns) * 100}% + 2px)`,
                        width: `calc(${100 / b.columns}% - 4px)`,
                        ['--block' as string]: color
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditing({ plan: b.plan })
                      }}
                      title={`${b.plan.title}\n${b.plan.startTime}–${minutesToHm(hmToMinutes(b.plan.startTime) + b.plan.durationMin)}`}
                    >
                      <span className="cal-block-title">
                        {b.plan.title}
                        {b.fromPrevDay ? ' ↩' : ''}
                      </span>
                      <span className="cal-block-time">
                        {b.fromPrevDay ? '00:00' : b.plan.startTime}–{b.intoNextDay ? '24:00' : minutesToHm(b.endMin)}
                        {!compact && tagById(b.plan.tagId) ? ` · ${tagById(b.plan.tagId)!.name}` : ''}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {editing && (
        <PlanForm
          plan={editing.plan}
          defaults={{ date: editing.date, startTime: editing.startTime }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
