import { useMemo, useState, type ReactNode } from 'react'
import { ChevronRight, Target } from 'lucide-react'
import { useApp } from '../state'
import { DurationInput, Field, Modal, TagDot, TagSelect, useConfirm } from './ui'
import { newId } from '../../../shared/store'
import { msToHm, todayYmd } from '../../../shared/dates'
import { summarizeGoals } from '../../../shared/goals'
import type { Goal, Plan } from '../../../shared/types'

type Defaults = Partial<Pick<Plan, 'title' | 'date' | 'startTime' | 'tagId' | 'goalId' | 'checkpointId'>>

export function PlanForm({ plan, defaults, onClose }: { plan?: Plan; defaults?: Defaults; onClose: () => void }): ReactNode {
  const { api, data, t } = useApp()
  const confirm = useConfirm()
  const [title, setTitle] = useState(plan?.title ?? defaults?.title ?? '')
  // New plans start now, unless opened from a calendar slot.
  const [date, setDate] = useState(plan?.date ?? defaults?.date ?? todayYmd())
  const [startTime, setStartTime] = useState(plan?.startTime ?? defaults?.startTime ?? msToHm(Date.now()))
  const [durationMin, setDurationMin] = useState(plan?.durationMin ?? 60)
  const [tagId, setTagId] = useState<string | null>(plan?.tagId ?? defaults?.tagId ?? null)
  const [goalId, setGoalId] = useState<string | null>(plan?.goalId ?? defaults?.goalId ?? null)
  const [checkpointId, setCheckpointId] = useState<string | null>(plan?.checkpointId ?? defaults?.checkpointId ?? null)
  const [description, setDescription] = useState(plan?.description ?? '')
  const [error, setError] = useState('')

  const goal = data.goals.find((g) => g.id === goalId)
  // Goals you can still plan for: in progress first, then upcoming.
  const openGoals = useMemo(() => {
    const summaries = summarizeGoals(data, todayYmd())
    const rank = (g: Goal): number => (summaries.get(g.id)?.status === 'current' ? 0 : 1)
    return data.goals.filter((g) => summaries.get(g.id)?.status !== 'past').sort((a, b) => rank(a) - rank(b))
  }, [data])

  /** Link to a goal/checkpoint and take its tag (checkpoint tag first). */
  const link = (g: Goal | undefined, cpId: string | null): void => {
    setGoalId(g?.id ?? null)
    setCheckpointId(cpId)
    const tag = g ? (g.checkpoints.find((c) => c.id === cpId)?.tagId ?? g.tagId) : null
    if (tag) setTagId(tag)
  }

  const save = async (): Promise<void> => {
    if (!title.trim()) return setError(t('plan.titleRequired'))
    await api.apply({
      type: 'upsertPlan',
      plan: {
        id: plan?.id ?? newId(),
        title: title.trim(),
        date,
        startTime,
        durationMin: Math.max(5, durationMin),
        tagId,
        goalId,
        checkpointId: goalId ? checkpointId : null,
        description: description.trim(),
        createdAt: plan?.createdAt ?? Date.now()
      }
    })
    onClose()
  }

  const remove = async (): Promise<void> => {
    if (!plan || !(await confirm(t('planner.deleteConfirm')))) return
    await api.apply({ type: 'deletePlan', id: plan.id })
    onClose()
  }

  return (
    <Modal
      title={plan ? t('plan.edit') : t('plan.new')}
      onClose={onClose}
      width={520}
      footer={
        <>
          {plan && (
            <button className="btn ghost danger-text" onClick={remove} style={{ marginRight: 'auto' }}>
              {t('common.delete')}
            </button>
          )}
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" onClick={save}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Field label={t('plan.title')}>
          <TitleAutocomplete
            goals={openGoals}
            value={title}
            onChange={(v) => {
              setTitle(v)
              setError('')
            }}
            onPick={(g, cpId, newTitle) => {
              link(g, cpId)
              setTitle(newTitle)
            }}
          />
          {error && <span className="field-error">{error}</span>}
        </Field>
        <div className="form-row">
          <Field label={t('plan.goal')}>
            <div className="select-with-icon">
              <Target size={14} />
              <select value={goalId ?? ''} onChange={(e) => link(data.goals.find((g) => g.id === e.target.value), null)}>
                <option value="">{t('plan.noGoal')}</option>
                {[...openGoals, ...(goal && !openGoals.includes(goal) ? [goal] : [])].map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field label={t('plan.checkpoint')}>
            <select value={checkpointId ?? ''} disabled={!goal} onChange={(e) => link(goal, e.target.value || null)}>
              <option value="">{t('goals.wholeGoal')}</option>
              {goal?.checkpoints.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.done ? '✓ ' : ''}
                  {c.title}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label={t('plan.date')}>
            <input type="date" value={date} required onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
          <Field label={t('plan.start')}>
            <input type="time" value={startTime} required onChange={(e) => e.target.value && setStartTime(e.target.value)} />
          </Field>
        </div>
        <div className="form-row">
          <Field label={t('plan.duration')}>
            <DurationInput minutes={durationMin} onChange={setDurationMin} />
          </Field>
          <Field label={t('plan.tag')}>
            <TagSelect value={tagId} onChange={setTagId} />
          </Field>
        </div>
        <Field label={t('plan.description')}>
          <textarea rows={3} value={description} placeholder={t('plan.descriptionPlaceholder')} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

type Suggestion =
  | { kind: 'goal'; goal: Goal }
  | { kind: 'whole'; goal: Goal }
  | { kind: 'checkpoint'; goal: Goal; checkpointId: string; title: string; done: boolean; tagId: string | null }

/**
 * Title input that suggests goals as you type. Picking a goal lists its
 * checkpoints; picking one of those links the plan and fills in the title.
 */
function TitleAutocomplete({ goals, value, onChange, onPick }: {
  goals: Goal[]
  value: string
  onChange: (v: string) => void
  onPick: (goal: Goal, checkpointId: string | null, title: string) => void
}): ReactNode {
  const { t } = useApp()
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Goal | null>(null)
  const [active, setActive] = useState(0)

  const items: Suggestion[] = useMemo(() => {
    if (picked) {
      return [
        { kind: 'whole', goal: picked },
        ...picked.checkpoints.map((c) => ({ kind: 'checkpoint' as const, goal: picked, checkpointId: c.id, title: c.title, done: c.done, tagId: c.tagId }))
      ]
    }
    const q = value.trim().toLowerCase()
    if (!q) return []
    return goals.filter((g) => g.title.toLowerCase().includes(q)).map((goal) => ({ kind: 'goal' as const, goal }))
  }, [picked, value, goals])

  const show = open && items.length > 0

  const choose = (s: Suggestion): void => {
    if (s.kind === 'goal') {
      // Second step: show this goal's checkpoints.
      setPicked(s.goal)
      setActive(s.goal.checkpoints.findIndex((c) => !c.done) + 1)
      return
    }
    if (s.kind === 'whole') onPick(s.goal, null, s.goal.title)
    else onPick(s.goal, s.checkpointId, s.title)
    setPicked(null)
    setOpen(false)
  }

  return (
    <div className="autocomplete">
      <input
        autoFocus
        value={value}
        placeholder={t('plan.titlePlaceholder')}
        role="combobox"
        aria-expanded={show}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value)
          setPicked(null)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false)
          setPicked(null)
        }}
        onKeyDown={(e) => {
          if (!show) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((active + 1) % items.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((active - 1 + items.length) % items.length)
          } else if (e.key === 'Enter' || (e.key === 'ArrowRight' && items[active]?.kind === 'goal')) {
            e.preventDefault()
            if (items[active]) choose(items[active])
          } else if (e.key === 'ArrowLeft' && picked) {
            e.preventDefault()
            setPicked(null)
          } else if (e.key === 'Escape') {
            // Close the suggestions only; a second Escape closes the dialog.
            e.preventDefault()
            e.stopPropagation()
            setOpen(false)
            setPicked(null)
          }
        }}
      />
      {show && (
        <div className="suggest" role="listbox" onMouseDown={(e) => e.preventDefault()}>
          <div className="suggest-label">{picked ? t('plan.suggestCheckpoints', { goal: picked.title }) : t('plan.suggestGoals')}</div>
          {items.map((s, i) => (
            <button
              key={s.kind === 'checkpoint' ? s.checkpointId : `${s.kind}-${s.goal.id}`}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`suggest-item${i === active ? ' on' : ''}${s.kind === 'checkpoint' && s.done ? ' done' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(s)}
            >
              {s.kind === 'goal' && (
                <>
                  <Target size={14} />
                  <span className="suggest-text">{s.goal.title}</span>
                  <span className="suggest-meta">{s.goal.checkpoints.length}</span>
                  <ChevronRight size={14} />
                </>
              )}
              {s.kind === 'whole' && (
                <>
                  <Target size={14} />
                  <span className="suggest-text">{t('goals.wholeGoal')}</span>
                </>
              )}
              {s.kind === 'checkpoint' && (
                <>
                  <TagDot tagId={s.tagId ?? s.goal.tagId} size={8} />
                  <span className="suggest-text">{s.title}</span>
                  {s.done && <span className="suggest-meta">✓</span>}
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
