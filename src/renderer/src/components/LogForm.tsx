import { useState, type ReactNode } from 'react'
import { useApp } from '../state'
import { DurationInput, Field, Modal, PlanSelect, TagSelect, useConfirm } from './ui'
import { logDurationMs, newId } from '../../../shared/store'
import { msToHm, toYmd, todayYmd, ymdHmToMs } from '../../../shared/dates'
import type { StudyLog } from '../../../shared/types'
import { longDate } from '../format'

/** Create a manual session, or edit any session's tag / plan / note. */
export function LogForm({ log, onClose }: { log?: StudyLog; onClose: () => void }): ReactNode {
  const { api, t, fmt, loc, data } = useApp()
  const confirm = useConfirm()
  const manual = !log || log.source === 'manual'
  const first = log?.segments[0]
  const [date, setDate] = useState(first ? toYmd(new Date(first.start)) : todayYmd())
  const [startTime, setStartTime] = useState(first ? msToHm(first.start) : msToHm(Date.now() - 3600_000))
  const [minutes, setMinutes] = useState(log ? Math.round(logDurationMs(log) / 60_000) : 60)
  const [tagId, setTagId] = useState<string | null>(log?.tagId ?? null)
  const [planId, setPlanId] = useState<string | null>(log?.planId ?? null)
  const [note, setNote] = useState(log?.note ?? '')

  const save = async (): Promise<void> => {
    let segments = log?.segments ?? []
    if (manual) {
      const start = ymdHmToMs(date, startTime)
      segments = [{ start, end: start + Math.max(1, minutes) * 60_000 }]
    }
    await api.apply({
      type: 'upsertLog',
      log: {
        id: log?.id ?? newId(),
        segments,
        source: log?.source ?? 'manual',
        tagId,
        planId,
        goalId: log?.goalId ?? null,
        checkpointId: log?.checkpointId ?? null,
        note: note.trim(),
        createdAt: log?.createdAt ?? Date.now()
      }
    })
    onClose()
  }

  const remove = async (): Promise<void> => {
    if (!log || !(await confirm(t('log.deleteConfirm')))) return
    await api.apply({ type: 'deleteLog', id: log.id })
    onClose()
  }

  const plans = [...data.plans].sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(date)) - Math.abs(Date.parse(b.date) - Date.parse(date))).slice(0, 40)

  return (
    <Modal
      title={log ? t('log.edit') : t('log.new')}
      onClose={onClose}
      footer={
        <>
          {log && (
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
        {manual ? (
          <>
            <div className="form-row">
              <Field label={t('plan.date')}>
                <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
              </Field>
              <Field label={t('plan.start')}>
                <input type="time" value={startTime} onChange={(e) => e.target.value && setStartTime(e.target.value)} />
              </Field>
            </div>
            <Field label={t('plan.duration')}>
              <DurationInput minutes={minutes} onChange={setMinutes} />
            </Field>
          </>
        ) : (
          <div className="log-summary">
            <strong>{fmt(logDurationMs(log!))}</strong>
            <span>
              {longDate(date, loc)} · {msToHm(log!.segments[0].start)}–{msToHm(log!.segments[log!.segments.length - 1].end)} ·{' '}
              {t(`source.${log!.source}`)}
            </span>
          </div>
        )}
        <div className="form-row">
          <Field label={t('plan.tag')}>
            <TagSelect value={tagId} onChange={setTagId} />
          </Field>
          <Field label={t('clock.linkPlan')}>
            <PlanSelect
              value={planId}
              plans={plans}
              onChange={(p) => {
                setPlanId(p?.id ?? null)
                if (p) setTagId(p.tagId)
              }}
            />
          </Field>
        </div>
        <Field label={t('log.note')}>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
