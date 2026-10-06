import { useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, CalendarRange, Check, Circle, Pencil, Plus, RotateCcw, Sparkles } from 'lucide-react'
import { useApp } from '../state'
import { GoalForm } from '../components/GoalForm'
import { PageHead } from '../components/Help'
import { PlanForm } from '../components/PlanForm'
import { StackedBars } from '../components/StackedBars'
import { Segmented, TagDot, TagPill, tagColor } from '../components/ui'
import { newId } from '../../../shared/store'
import { parseYmd, toYmd, todayYmd } from '../../../shared/dates'
import { daysUntil, summarizeGoals, type GoalStatus, type GoalSummary } from '../../../shared/goals'
import { periodSeries } from '../../../shared/stats'
import type { Goal, Plan } from '../../../shared/types'
import { longDate } from '../format'

export function GoalsPage(): ReactNode {
  const { data, t } = useApp()
  const today = todayYmd()
  const [tab, setTab] = useState<GoalStatus>('current')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const summaries = useMemo(() => summarizeGoals(data, today), [data, today])

  const selected = selectedId ? summaries.get(selectedId) : undefined
  if (selected) {
    return <GoalDetail summary={selected} onBack={() => setSelectedId(null)} />
  }

  const all = [...summaries.values()]
  const count = (s: GoalStatus): number => all.filter((x) => x.status === s).length
  const list = all
    .filter((s) => s.status === tab)
    .sort((a, b) =>
      tab === 'past'
        ? (b.completedAt ?? 0) - (a.completedAt ?? 0)
        : (a.goal.endDate ?? '9999').localeCompare(b.goal.endDate ?? '9999') || a.goal.startDate.localeCompare(b.goal.startDate)
    )

  return (
    <div className="page">
      <PageHead title={t('goals.title')}>
        <button className="btn primary" onClick={() => setEditing('new')}>
          <Plus size={16} />
          {t('goals.new')}
        </button>
      </PageHead>

      <div className="toolbar">
        <Segmented
          value={tab}
          onChange={setTab}
          options={(['current', 'upcoming', 'past'] as const).map((s) => ({
            value: s,
            label: `${t(`goals.${s}`)}${count(s) ? ` · ${count(s)}` : ''}`
          }))}
        />
      </div>

      {list.length === 0 ? (
        <div className="empty card">
          <p>{t(tab === 'current' ? 'goals.emptyCurrent' : tab === 'upcoming' ? 'goals.emptyUpcoming' : 'goals.emptyPast')}</p>
          {tab !== 'past' && (
            <button className="btn primary" onClick={() => setEditing('new')}>
              <Plus size={16} />
              {t('goals.new')}
            </button>
          )}
        </div>
      ) : (
        <div className="goal-grid">
          {list.map((s) => (
            <GoalCard key={s.goal.id} summary={s} onOpen={() => setSelectedId(s.goal.id)} />
          ))}
        </div>
      )}

      {editing && <GoalForm goal={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

/** "12 days left", "Starts tomorrow", "Completed Oct 3", … */
function useStatusText(): (s: GoalSummary) => { text: string; tone: 'muted' | 'warn' | 'good' } {
  const { t, loc } = useApp()
  const today = todayYmd()
  return (s) => {
    if (s.completed) return { text: t('goals.completedOn', { date: longDate(toYmd(new Date(s.completedAt!)), loc) }), tone: 'good' }
    if (s.status === 'upcoming') {
      const n = daysUntil(today, s.goal.startDate)
      return { text: n === 1 ? t('goals.startsTomorrow') : t('goals.startsIn', { n }), tone: 'muted' }
    }
    if (!s.goal.endDate) return { text: t('goals.noEnd'), tone: 'muted' }
    const n = daysUntil(today, s.goal.endDate)
    if (n < 0) return { text: t('goals.overdue', { n: -n }), tone: 'warn' }
    if (n === 0) return { text: t('goals.dueToday'), tone: 'warn' }
    return { text: n === 1 ? t('goals.dayLeft') : t('goals.daysLeft', { n }), tone: 'muted' }
  }
}

function progressLabel(s: GoalSummary, t: ReturnType<typeof useApp>['t'], fmt: (ms: number) => string): string {
  if (s.goal.targetHours) return t('goals.ofTarget', { done: fmt(s.studiedMs), target: fmt(s.goal.targetHours * 3_600_000) })
  return t('goals.checkpointsDone', { done: s.checkpointsDone, total: s.goal.checkpoints.length })
}

function GoalCard({ summary: s, onOpen }: { summary: GoalSummary; onOpen: () => void }): ReactNode {
  const { t, fmt, tagById } = useApp()
  const status = useStatusText()(s)
  const color = tagColor(tagById(s.goal.tagId)?.color ?? 2)
  const next = s.goal.checkpoints.find((c) => !c.done)
  const pct = Math.round(s.progress * 100)
  return (
    <article className="goal-card" onClick={onOpen} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className="goal-card-head">
        <h3>{s.goal.title}</h3>
        <span className={`status-badge ${status.tone}`}>{status.text}</span>
      </div>
      {s.goal.description && <p className="goal-desc">{s.goal.description}</p>}
      <div className="goal-progress">
        <div className="progress lg">
          <div style={{ width: `${pct}%`, background: color }} />
        </div>
        <strong>{pct}%</strong>
      </div>
      <div className="goal-card-meta">
        <span>{progressLabel(s, t, fmt)}</span>
        <span>{t('goals.studied', { time: fmt(s.studiedMs) })}</span>
      </div>
      <div className="goal-card-foot">
        {s.goal.tagId && <TagPill tagId={s.goal.tagId} />}
        {next && !s.completed && (
          <span className="goal-next">
            <Circle size={11} />
            {t('goals.next', { title: next.title })}
          </span>
        )}
      </div>
    </article>
  )
}

function GoalDetail({ summary: s, onBack }: { summary: GoalSummary; onBack: () => void }): ReactNode {
  const { api, data, t, fmt, loc, tagById } = useApp()
  const today = todayYmd()
  const status = useStatusText()(s)
  const [editing, setEditing] = useState(false)
  const [planForm, setPlanForm] = useState<{ plan?: Plan; defaults?: Parameters<typeof PlanForm>[0]['defaults'] } | null>(null)
  const [newCp, setNewCp] = useState('')
  const goal = s.goal
  const pct = Math.round(s.progress * 100)
  const color = tagColor(tagById(goal.tagId)?.color ?? 2)

  const saveGoal = (patch: Partial<Goal>): void => {
    api.apply({ type: 'upsertGoal', goal: { ...goal, ...patch } })
  }
  const toggle = (id: string): void =>
    saveGoal({ checkpoints: goal.checkpoints.map((c) => (c.id === id ? { ...c, done: !c.done, doneAt: c.done ? null : Date.now() } : c)) })
  const addCheckpoint = (): void => {
    const title = newCp.trim()
    if (!title) return
    saveGoal({ checkpoints: [...goal.checkpoints, { id: newId(), title, tagId: null, done: false, doneAt: null }] })
    setNewCp('')
  }

  // Weekly hours on this goal, last 8 weeks, split by tag like the Statistics tab.
  const logs = useMemo(() => s.entries.map((e) => e.log), [s.entries])
  const weeks = useMemo(() => periodSeries(logs, 'week', today, 8), [logs, today])
  const tagOrder = useMemo(() => {
    const totals = new Map<string | null, number>()
    for (const w of weeks) for (const sl of w.breakdown.slices) totals.set(sl.tagId, (totals.get(sl.tagId) ?? 0) + sl.ms)
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  }, [weeks])

  const cpRows = [
    ...goal.checkpoints.map((c) => ({ id: c.id as string | null, title: c.title, tagId: c.tagId ?? goal.tagId, ms: s.byCheckpoint.get(c.id) ?? 0 })),
    ...(s.byCheckpoint.get(null) ? [{ id: null, title: t('goals.wholeGoal'), tagId: goal.tagId, ms: s.byCheckpoint.get(null)! }] : [])
  ]
  const maxCp = Math.max(...cpRows.map((r) => r.ms), 1)

  const upcomingPlans = data.plans
    .filter((p) => p.goalId === goal.id && p.date >= today)
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    .slice(0, 5)

  const daysLeft = goal.endDate ? daysUntil(today, goal.endDate) : null
  const dateRange = `${longDate(goal.startDate, loc)} – ${goal.endDate ? longDate(goal.endDate, loc) : t('goals.noEnd')}`
  const nextCp = goal.checkpoints.find((c) => !c.done)

  return (
    <div className="page">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={16} />
        {t('goals.back')}
      </button>
      <PageHead title={goal.title}>
        {!s.completed && (
          <button className="btn" onClick={() => saveGoal({ completedAt: Date.now() })}>
            <Check size={16} />
            {t('goals.markComplete')}
          </button>
        )}
        {s.completed && !s.autoCompleted && (
          <button className="btn" onClick={() => saveGoal({ completedAt: null })}>
            <RotateCcw size={15} />
            {t('goals.reopen')}
          </button>
        )}
        <button className="btn" onClick={() => setEditing(true)}>
          <Pencil size={15} />
          {t('common.edit')}
        </button>
      </PageHead>

      <div className="goal-detail-meta">
        <span>
          <CalendarRange size={14} /> {dateRange}
        </span>
        <span className={`status-badge ${status.tone}`}>{status.text}</span>
        {goal.tagId && <TagPill tagId={goal.tagId} />}
      </div>
      {goal.description && <p className="goal-detail-desc">{goal.description}</p>}
      {s.autoCompleted && (
        <p className="banner">
          <Sparkles size={15} />
          {t('goals.autoCompleted', { hours: fmt(goal.targetHours! * 3_600_000) })}
        </p>
      )}

      <div className="tiles">
        <div className="tile">
          <span className="tile-label">{t('goals.progress')}</span>
          <strong className="tile-value">{pct}%</strong>
          <div className="progress">
            <div style={{ width: `${pct}%`, background: color }} />
          </div>
        </div>
        <div className="tile">
          <span className="tile-label">{t('goals.studiedLabel')}</span>
          <strong className="tile-value">{fmt(s.studiedMs)}</strong>
          {goal.targetHours && <span className="tile-sub">/ {fmt(goal.targetHours * 3_600_000)}</span>}
        </div>
        <div className="tile">
          <span className="tile-label">{t('goals.checkpoints')}</span>
          <strong className="tile-value">
            {s.checkpointsDone}
            <span className="tile-of">/{goal.checkpoints.length}</span>
          </strong>
        </div>
        <div className="tile">
          <span className="tile-label">{t('goals.timeLeft')}</span>
          <strong className="tile-value">
            {s.completed ? '—' : daysLeft === null ? '∞' : daysLeft < 0 ? t('goals.ended') : t('goals.days', { n: daysLeft })}
          </strong>
        </div>
      </div>

      <div className="goal-detail-grid">
        <section className="card">
          <header className="card-head">
            <h2>{t('goals.checkpoints')}</h2>
          </header>
          {goal.checkpoints.length === 0 && <p className="muted empty-small">{t('goals.noCheckpoints')}</p>}
          <ul className="cp-list">
            {goal.checkpoints.map((c, i) => (
              <li key={c.id} className={c.done ? 'done' : ''}>
                <button className="cp-check" onClick={() => toggle(c.id)} role="checkbox" aria-checked={c.done} aria-label={c.title}>
                  {c.done && <Check size={13} strokeWidth={3} />}
                </button>
                <span className="cp-num">{i + 1}</span>
                <span className="cp-title">
                  {c.title}
                  {c.tagId && c.tagId !== goal.tagId && <TagDot tagId={c.tagId} size={7} />}
                </span>
                <span className="cp-meta">
                  {c.done && c.doneAt ? longDate(toYmd(new Date(c.doneAt)), loc) : fmt(s.byCheckpoint.get(c.id) ?? 0)}
                </span>
              </li>
            ))}
          </ul>
          <form
            className="inline-add cp-add"
            onSubmit={(e) => {
              e.preventDefault()
              addCheckpoint()
            }}
          >
            <input value={newCp} placeholder={t('goals.addCheckpoint')} onChange={(e) => setNewCp(e.target.value)} />
            <button className="btn" type="submit" disabled={!newCp.trim()}>
              <Plus size={15} />
            </button>
          </form>
        </section>

        <div className="goal-side">
          <section className="card">
            <header className="card-head">
              <h2>{t('goals.byCheckpoint')}</h2>
            </header>
            {cpRows.every((r) => r.ms === 0) ? (
              <p className="muted empty-small">{t('stats.noData')}</p>
            ) : (
              <ul className="hbars">
                {cpRows.map((r) => (
                  <li key={r.id ?? 'whole'}>
                    <span className="hbar-label">{r.title}</span>
                    <span className="hbar-track">
                      <span style={{ width: `${(r.ms / maxCp) * 100}%`, background: tagColor(tagById(r.tagId)?.color ?? 2) }} />
                    </span>
                    <span className="hbar-value">{fmt(r.ms)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <header className="card-head">
              <h2>{t('goals.weekly')}</h2>
            </header>
            <StackedBars series={weeks} labels={weeks.map((w) => `${parseYmd(w.start).getMonth() + 1}/${parseYmd(w.start).getDate()}`)} tagOrder={tagOrder} />
          </section>

          <section className="card">
            <header className="card-head">
              <h2>{t('goals.linkedPlans')}</h2>
              <button
                className="btn sm"
                onClick={() =>
                  setPlanForm({
                    defaults: {
                      title: nextCp?.title ?? goal.title,
                      goalId: goal.id,
                      checkpointId: nextCp?.id ?? null,
                      tagId: nextCp?.tagId ?? goal.tagId
                    }
                  })
                }
              >
                <Plus size={14} />
                {t('goals.planForGoal')}
              </button>
            </header>
            {upcomingPlans.length === 0 ? (
              <p className="muted empty-small">{t('goals.noLinkedPlans')}</p>
            ) : (
              <ul className="mini-plans">
                {upcomingPlans.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => setPlanForm({ plan: p })}>
                      <TagDot tagId={p.tagId} size={8} />
                      <span className="mini-plan-title">{p.title}</span>
                      <span className="muted small">
                        {longDate(p.date, loc)} {p.startTime}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {editing && <GoalForm goal={goal} onClose={() => setEditing(false)} onDeleted={onBack} />}
      {planForm && <PlanForm plan={planForm.plan} defaults={planForm.defaults} onClose={() => setPlanForm(null)} />}
    </div>
  )
}

