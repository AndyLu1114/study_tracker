import { useState, type ReactNode } from 'react'
import { useApp } from '../state'
import { DurationInput, Field, Modal, TagSelect, useConfirm } from './ui'
import { newId } from '../../../shared/store'
import { todayYmd } from '../../../shared/dates'
import type { Plan } from '../../../shared/types'

export function PlanForm({ plan, defaults, onClose }: {
  plan?: Plan
  defaults?: Partial<Pick<Plan, 'date' | 'startTime' | 'tagId'>>
  onClose: () => void
}): ReactNode {
  const { api, t } = useApp()
  const confirm = useConfirm()
  const [title, setTitle] = useState(plan?.title ?? '')
  const [date, setDate] = useState(plan?.date ?? defaults?.date ?? todayYmd())
  const [startTime, setStartTime] = useState(plan?.startTime ?? defaults?.startTime ?? '19:00')
  const [durationMin, setDurationMin] = useState(plan?.durationMin ?? 60)
  const [tagId, setTagId] = useState<string | null>(plan?.tagId ?? defaults?.tagId ?? null)
  const [description, setDescription] = useState(plan?.description ?? '')
  const [error, setError] = useState('')

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
          <input
            autoFocus
            value={title}
            placeholder={t('plan.titlePlaceholder')}
            onChange={(e) => {
              setTitle(e.target.value)
              setError('')
            }}
          />
          {error && <span className="field-error">{error}</span>}
        </Field>
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
