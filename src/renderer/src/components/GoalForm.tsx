import { useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { useApp } from '../state'
import { Field, Modal, TagSelect, useConfirm } from './ui'
import { newId } from '../../../shared/store'
import { todayYmd } from '../../../shared/dates'
import type { Checkpoint, Goal } from '../../../shared/types'

export function GoalForm({ goal, onClose, onDeleted }: { goal?: Goal; onClose: () => void; onDeleted?: () => void }): ReactNode {
  const { api, t } = useApp()
  const confirm = useConfirm()
  const [title, setTitle] = useState(goal?.title ?? '')
  const [description, setDescription] = useState(goal?.description ?? '')
  const [tagId, setTagId] = useState<string | null>(goal?.tagId ?? null)
  const [startDate, setStartDate] = useState(goal?.startDate ?? todayYmd())
  const [endDate, setEndDate] = useState(goal?.endDate ?? '')
  const [targetHours, setTargetHours] = useState(goal?.targetHours ? String(goal.targetHours) : '')
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>(
    goal?.checkpoints.length ? goal.checkpoints : [{ id: newId(), title: '', tagId: null, done: false, doneAt: null }]
  )
  const [error, setError] = useState('')
  const listRef = useRef<HTMLOListElement>(null)

  const update = (i: number, patch: Partial<Checkpoint>): void =>
    setCheckpoints(checkpoints.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const move = (i: number, by: number): void => {
    const next = checkpoints.slice()
    ;[next[i], next[i + by]] = [next[i + by], next[i]]
    setCheckpoints(next)
  }
  const add = (): void => {
    setCheckpoints([...checkpoints, { id: newId(), title: '', tagId: null, done: false, doneAt: null }])
    // Focus the new row once it renders.
    setTimeout(() => listRef.current?.querySelector<HTMLInputElement>('li:last-child input')?.focus())
  }

  const save = async (): Promise<void> => {
    if (!title.trim()) return setError(t('plan.titleRequired'))
    const hours = parseFloat(targetHours)
    await api.apply({
      type: 'upsertGoal',
      goal: {
        id: goal?.id ?? newId(),
        title: title.trim(),
        description: description.trim(),
        tagId,
        startDate,
        endDate: endDate && endDate >= startDate ? endDate : null,
        targetHours: Number.isFinite(hours) && hours > 0 ? hours : null,
        completedAt: goal?.completedAt ?? null,
        checkpoints: checkpoints.filter((c) => c.title.trim()).map((c) => ({ ...c, title: c.title.trim() })),
        createdAt: goal?.createdAt ?? Date.now()
      }
    })
    onClose()
  }

  const remove = async (): Promise<void> => {
    if (!goal || !(await confirm(t('goals.deleteConfirm', { name: goal.title })))) return
    await api.apply({ type: 'deleteGoal', id: goal.id })
    onDeleted?.()
    onClose()
  }

  return (
    <Modal
      title={goal ? t('goal.edit') : t('goal.new')}
      onClose={onClose}
      width={600}
      footer={
        <>
          {goal && (
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
      <div className="form">
        <Field label={t('goal.title')}>
          <input
            autoFocus
            value={title}
            placeholder={t('goal.titlePlaceholder')}
            onChange={(e) => {
              setTitle(e.target.value)
              setError('')
            }}
          />
          {error && <span className="field-error">{error}</span>}
        </Field>
        <Field label={t('goal.description')}>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="form-row">
          <Field label={t('plan.tag')}>
            <TagSelect value={tagId} onChange={setTagId} />
          </Field>
          <Field label={t('goal.target')} hint={t('goal.targetHint')}>
            <input type="number" min={0} step={0.5} value={targetHours} placeholder="—" onChange={(e) => setTargetHours(e.target.value)} />
          </Field>
        </div>
        <div className="form-row">
          <Field label={t('goal.start')}>
            <input type="date" value={startDate} onChange={(e) => e.target.value && setStartDate(e.target.value)} />
          </Field>
          <Field label={t('goal.end')}>
            <div className="input-clear">
              <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
              {endDate && (
                <button type="button" className="icon-btn xs" onClick={() => setEndDate('')} aria-label={t('goals.noEnd')} title={t('goals.noEnd')}>
                  <X size={13} />
                </button>
              )}
            </div>
          </Field>
        </div>

        <div className="field">
          <span className="field-label">{t('goal.checkpoints')}</span>
          <ol className="checkpoint-editor" ref={listRef}>
            {checkpoints.map((c, i) => (
              <li key={c.id}>
                <span className="cp-index">{i + 1}</span>
                <input
                  value={c.title}
                  placeholder={t('goal.checkpointPlaceholder', { n: i + 1 })}
                  onChange={(e) => update(i, { title: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      add()
                    }
                  }}
                />
                <div className="cp-tag">
                  <TagSelect value={c.tagId} onChange={(id) => update(i, { tagId: id })} />
                </div>
                <div className="cp-actions">
                  <button type="button" className="icon-btn xs" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('goals.moveUp')}>
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn xs"
                    disabled={i === checkpoints.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label={t('goals.moveDown')}
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button type="button" className="icon-btn xs" onClick={() => setCheckpoints(checkpoints.filter((_, j) => j !== i))} aria-label={t('common.delete')}>
                    <X size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <button type="button" className="btn ghost sm add-cp" onClick={add}>
            {t('goal.addCheckpoint')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
