import { useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Flame } from 'lucide-react'
import { useApp } from '../state'
import { CheckInGrid } from '../components/CheckInGrid'
import { PageHead } from '../components/Help'
import { StackedBars } from '../components/StackedBars'
import { Segmented, tagColor } from '../components/ui'
import { addDays, parseYmd, todayYmd } from '../../../shared/dates'
import { currentStreak, periodSeries, periodStart, recentDays, shiftPeriod, type Unit } from '../../../shared/stats'

const PERIODS = 7

export function StatsPage(): ReactNode {
  const { data, t, fmt, loc, tagById } = useApp()
  const today = todayYmd()
  const [unit, setUnit] = useState<Unit>('week')
  const [offset, setOffset] = useState(0)
  const [tagFilter, setTagFilter] = useState<string>('')

  const days = useMemo(() => recentDays(data.logs, today), [data.logs, today])
  const streak = useMemo(() => currentStreak(data.logs, today), [data.logs, today])
  const total14 = days.reduce((s, d) => s + d.ms, 0)

  const lastStart = shiftPeriod(unit, periodStart(unit, today), -offset * PERIODS)
  const filter = tagFilter === '' ? undefined : tagFilter === '__none' ? null : tagFilter
  const series = useMemo(() => periodSeries(data.logs, unit, lastStart, PERIODS, filter), [data.logs, unit, lastStart, filter])

  const label = (start: string): string => {
    const d = parseYmd(start)
    if (unit === 'month') return d.toLocaleDateString(loc, { month: 'short' })
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
  const labels = series.map((s) => label(s.start))
  const rangeText = (() => {
    const first = parseYmd(series[0].start)
    const lastEnd = parseYmd(addDays(shiftPeriod(unit, series[series.length - 1].start, 1), -1))
    const opts: Intl.DateTimeFormatOptions =
      unit === 'month' ? { year: 'numeric', month: 'short' } : { year: 'numeric', month: 'short', day: 'numeric' }
    return `${first.toLocaleDateString(loc, opts)} – ${lastEnd.toLocaleDateString(loc, opts)}`
  })()

  // Tags that appear in this window, largest total first; that is also the stack order.
  const rows = useMemo(() => {
    const totals = new Map<string | null, number>()
    for (const s of series) for (const sl of s.breakdown.slices) totals.set(sl.tagId, (totals.get(sl.tagId) ?? 0) + sl.ms)
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([tagId, ms]) => ({ tagId, ms }))
  }, [series])
  const windowTotal = rows.reduce((s, r) => s + r.ms, 0)

  return (
    <div className="page">
      <PageHead title={t('nav.stats')} />

      <section className="card checkin-card">
        <div className="checkin-info">
          <h2>{t('stats.checkin')}</h2>
          <p className="muted small">{t('stats.checkinSub')}</p>
          <div className="checkin-stats">
            <span className="streak">
              <Flame size={15} />
              {t('stats.streak', { n: streak })}
            </span>
            <span className="muted small">{t('stats.total14', { time: fmt(total14) })}</span>
          </div>
        </div>
        <CheckInGrid days={days} />
      </section>

      <section className="card">
        <header className="card-head">
          <h2>{t('stats.studyTime')}</h2>
          <Segmented
            value={unit}
            onChange={(u) => {
              setUnit(u)
              setOffset(0)
            }}
            options={[
              { value: 'day', label: t('stats.day') },
              { value: 'week', label: t('stats.week') },
              { value: 'month', label: t('stats.month') }
            ]}
          />
        </header>

        <div className="range-nav">
          <button className="icon-btn" onClick={() => setOffset(offset + 1)} aria-label={t('common.prev')}>
            <ChevronLeft size={20} />
          </button>
          <span className="range-text">{rangeText}</span>
          <button className="icon-btn" onClick={() => setOffset(offset - 1)} disabled={offset === 0} aria-label={t('common.next')}>
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="stats-filter-row">
          <select className="compact" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
            <option value="">{t('stats.allTags')}</option>
            {data.tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
            <option value="__none">{t('common.untagged')}</option>
          </select>
          <div className="stat-figures">
            <div>
              <span className="muted small">{t('stats.total')}</span>
              <strong>{fmt(windowTotal)}</strong>
            </div>
            <div>
              <span className="muted small">{t('stats.average')}</span>
              <strong>{fmt(windowTotal / PERIODS)}</strong>
            </div>
          </div>
        </div>

        <StackedBars series={series} labels={labels} tagOrder={rows.map((r) => r.tagId)} />

        <div className="table-wrap">
          <table className="breakdown">
            <thead>
              <tr>
                <th className="tag-col">{t('stats.tag')}</th>
                {labels.map((l, i) => (
                  <th key={series[i].start}>{l}</th>
                ))}
                <th className="total-col">{t('stats.total')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={PERIODS + 2} className="muted empty-cell">
                    {t('stats.noData')}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.tagId ?? 'none'}>
                    <td className="tag-col">
                      <span className="row-swatch" style={{ background: tagColor(tagById(r.tagId)?.color) }} />
                      {tagById(r.tagId)?.name ?? t('common.untagged')}
                    </td>
                    {series.map((s) => {
                      const ms = s.breakdown.slices.find((sl) => sl.tagId === r.tagId)?.ms ?? 0
                      return (
                        <td key={s.start} className={ms ? '' : 'zero'}>
                          {fmt(ms)}
                        </td>
                      )
                    })}
                    <td className="total-col">{fmt(r.ms)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
