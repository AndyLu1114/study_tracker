import { useMemo, useState, type ReactNode } from 'react'
import { Clock3, Play, Plus, Target } from 'lucide-react'
import { useApp } from '../state'
import { PlanForm } from '../components/PlanForm'
import { PageHead } from '../components/Help'
import { usePlanMenu } from '../components/usePlanMenu'
import { usePlanTimer } from '../components/usePlanTimer'
import { Segmented, TagPill, tagColor } from '../components/ui'
import { hmToMinutes, minutesToHm, todayYmd } from '../../../shared/dates'
import type { Plan } from '../../../shared/types'
import { dayLabel } from '../format'

type Filter = 'upcoming' | 'past' | 'all'

export function PlannerPage(): ReactNode {
  const { data, t, loc } = useApp()
  const [filter, setFilter] = useState<Filter>('upcoming')
  const [tagFilter, setTagFilter] = useState<string>('')
  const [editing, setEditing] = useState<Plan | 'new' | null>(null)
  const today = todayYmd()

  const { openMenu, menu } = usePlanMenu(setEditing)
  const planTimer = usePlanTimer()
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
      <PageHead title={t('planner.title')}>
        <button className="btn primary" onClick={() => setEditing('new')}>
          <Plus size={16} />
          {t('planner.new')}
        </button>
      </PageHead>

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
                <PlanCard key={p.id} plan={p} planTimer={planTimer} onOpen={() => setEditing(p)} onMenu={(e) => openMenu(e, p)} />
              ))}
            </div>
          </section>
        ))
      )}

      {editing && <PlanForm plan={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {menu}
    </div>
  )
}

function PlanCard({ plan, planTimer, onOpen, onMenu }: {
  plan: Plan
  planTimer: ReturnType<typeof usePlanTimer>
  onOpen: () => void
  onMenu: (e: React.MouseEvent) => void
}): ReactNode {
  const { t, fmt, tagById, data } = useApp()
  const studiedMs = planTimer.studiedMs(plan)
  const start = hmToMinutes(plan.startTime)
  const plannedMs = plan.durationMin * 60_000
  const pct = Math.min(100, Math.round((studiedMs / plannedMs) * 100))
  const goal = plan.goalId ? data.goals.find((g) => g.id === plan.goalId) : undefined
  const checkpoint = goal?.checkpoints.find((c) => c.id === plan.checkpointId)

  return (
    <article className="plan-card" onClick={onOpen} onContextMenu={onMenu} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
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
          {goal && (
            <span className="goal-chip" title={checkpoint ? `${goal.title} › ${checkpoint.title}` : goal.title}>
              <Target size={12} />
              {goal.title}
              {checkpoint && <span className="goal-chip-cp">› {checkpoint.title}</span>}
            </span>
          )}
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
        onClick={(e) => {
          e.stopPropagation()
          planTimer.start(plan)
        }}
        aria-disabled={!planTimer.canStart(plan)}
        title={t('planner.startClock')}
        aria-label={t('planner.startClock')}
      >
        <Play size={16} />
      </button>
    </article>
  )
}
