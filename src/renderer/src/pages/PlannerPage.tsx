import { useMemo, useState, type ReactNode } from 'react'
import { Clock3, Play, Plus } from 'lucide-react'
import { useApp } from '../state'
import { PlanForm } from '../components/PlanForm'
import { Segmented, TagPill, tagColor } from '../components/ui'
import { hmToMinutes, minutesToHm, todayYmd } from '../../../shared/dates'
import { msByPlan } from '../../../shared/stats'
import type { Plan } from '../../../shared/types'
import { dayLabel } from '../format'

type Filter = 'upcoming' | 'past' | 'all'

export function PlannerPage(): ReactNode {
  const { data, t, loc } = useApp()
  const [filter, setFilter] = useState<Filter>('upcoming')
  const [tagFilter, setTagFilter] = useState<string>('')
  const [editing, setEditing] = useState<Plan | 'new' | null>(null)
  const today = todayYmd()

  const studied = useMemo(() => msByPlan(data.logs), [data.logs])
  const groups = useMemo(() => {
    const list = data.plans
      .filter((p) => (filter === 'upcoming' ? p.date >= today : filter === 'past' ? p.date < today : true))
      .filter((p) => !tagFilter || (tagFilter === '__none' ? p.tagId === null : p.tagId === tagFilter))
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    if (filter !== 'upcoming') list.reverse()
    const byDate = new Map<string, Plan[]>()
    for (const p of list) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p])
    // Within a day, always show earliest first.
    for (const plans of byDate.values()) plans.sort((a, b) => a.startTime.localeCompare(b.startTime))
    return [...byDate.entries()]
  }, [data.plans, filter, tagFilter, today])

  return (
    <div className="page">
      <header className="page-head">
        <h1>{t('planner.title')}</h1>
        <button className="btn primary" onClick={() => setEditing('new')}>
          <Plus size={16} />
          {t('planner.new')}
        </button>
      </header>

      <div className="toolbar">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'upcoming', label: t('planner.upcoming') },
            { value: 'past', label: t('planner.past') },
            { value: 'all', label: t('planner.all') }
          ]}
        />
        <select className="compact" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
          <option value="">{t('planner.allTags')}</option>
          {data.tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
          <option value="__none">{t('common.untagged')}</option>
        </select>
      </div>

      {groups.length === 0 ? (
        <div className="empty card">
          <p>{t('planner.empty')}</p>
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Plus size={16} />
            {t('planner.new')}
          </button>
        </div>
      ) : (
        groups.map(([date, plans]) => (
          <section key={date} className="plan-group">
            <h3 className={`group-title${date === today ? ' is-today' : ''}`}>{dayLabel(date, loc, t)}</h3>
            <div className="plan-list">
              {plans.map((p) => (
                <PlanCard key={p.id} plan={p} studiedMs={studied.get(p.id) ?? 0} onOpen={() => setEditing(p)} />
              ))}
            </div>
          </section>
        ))
      )}

      {editing && <PlanForm plan={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function PlanCard({ plan, studiedMs, onOpen }: { plan: Plan; studiedMs: number; onOpen: () => void }): ReactNode {
  const { t, fmt, tagById, api, timer, setPage } = useApp()
  const start = hmToMinutes(plan.startTime)
  const plannedMs = plan.durationMin * 60_000
  const pct = Math.min(100, Math.round((studiedMs / plannedMs) * 100))

  const startClock = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    const link = { tagId: plan.tagId, planId: plan.id }
    if (timer.status === 'idle' && timer.mode === 'countdown') {
      await api.timer({ type: 'configure', cfg: { link, countdownMs: plannedMs } })
    } else {
      await api.timer({ type: 'configure', cfg: { link } })
    }
    setPage('clock')
  }

  return (
    <article className="plan-card" onClick={onOpen} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <span className="plan-bar" style={{ background: tagColor(tagById(plan.tagId)?.color) }} />
      <div className="plan-time">
        <strong>{plan.startTime}</strong>
        <span>{minutesToHm(start + plan.durationMin)}</span>
      </div>
      <div className="plan-main">
        <div className="plan-title">{plan.title}</div>
        {plan.description && <div className="plan-desc">{plan.description}</div>}
        <div className="plan-meta">
          <TagPill tagId={plan.tagId} />
          <span className="muted">
            <Clock3 size={13} /> {fmt(plannedMs)}
          </span>
        </div>
      </div>
      <div className="plan-progress" title={`${pct}%`}>
        <span className="muted small">{t('planner.studied', { done: fmt(studiedMs), planned: fmt(plannedMs) })}</span>
        <div className="progress">
          <div style={{ width: `${pct}%`, background: tagColor(tagById(plan.tagId)?.color) }} />
        </div>
      </div>
      <button
        className="icon-btn play"
        onClick={startClock}
        title={t('planner.startClock')}
        aria-label={t('planner.startClock')}
      >
        <Play size={16} />
      </button>
    </article>
  )
}
