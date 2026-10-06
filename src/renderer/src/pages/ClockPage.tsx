import { useMemo, useState, type ReactNode } from 'react'
import { Pause, PictureInPicture2, Play, Plus, SkipForward, Square, Trash2 } from 'lucide-react'
import { useApp } from '../state'
import { ClockRing } from '../components/ClockRing'
import { PageHead } from '../components/Help'
import { LogForm } from '../components/LogForm'
import { Field, PlanSelect, Segmented, TagDot, TagSelect, useConfirm } from '../components/ui'
import { useClock } from '../components/useClock'
import { clockText } from '../format'
import { addDays, dayStartMs, msToHm, todayYmd } from '../../../shared/dates'
import { logDurationMs } from '../../../shared/store'
import { MIN_LOG_MS } from '../../../shared/timer'
import type { MessageKey } from '../../../shared/i18n'
import type { PomodoroSettings, StudyLog, TimerMode } from '../../../shared/types'

export function ClockPage(): ReactNode {
  const { api, timer, data, t, fmt } = useApp()
  const confirm = useConfirm()
  const { display, progress, focused, phaseLabel, isBreak } = useClock()
  const [notice, setNotice] = useState('')
  const [editingLog, setEditingLog] = useState<StudyLog | 'new' | null>(null)
  const idle = timer.status === 'idle'
  const today = todayYmd()

  const nearbyPlans = useMemo(
    () =>
      data.plans
        .filter((p) => p.date >= addDays(today, -1) && p.date <= addDays(today, 7))
        .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
    [data.plans, today]
  )

  const todayLogs = useMemo(() => {
    const start = dayStartMs(today)
    const end = dayStartMs(addDays(today, 1))
    return data.logs
      .filter((l) => l.segments.some((s) => s.end > start && s.start < end))
      .sort((a, b) => b.segments[0].start - a.segments[0].start)
  }, [data.logs, today])

  const setMode = (mode: TimerMode): void => {
    api.timer({ type: 'configure', cfg: { mode } })
  }
  const setPomodoro = (patch: Partial<PomodoroSettings>): void => {
    api.apply({ type: 'updateSettings', settings: { pomodoro: { ...data.settings.pomodoro, ...patch } } })
  }

  const stop = async (): Promise<void> => {
    setNotice(focused < MIN_LOG_MS ? t('clock.tooShort') : '')
    await api.timer({ type: 'stop' })
  }
  const discard = async (): Promise<void> => {
    if (await confirm(t('clock.discardConfirm'), { okLabel: t('clock.discard') })) api.timer({ type: 'discard' })
  }

  const num = (v: string, fallback: number): number => {
    const n = parseInt(v, 10)
    return Number.isFinite(n) && n >= 1 ? Math.min(n, 600) : fallback
  }

  return (
    <div className="page">
      <PageHead title={t('nav.clock')}>
        <button className="btn" onClick={() => api.openMini()}>
          <PictureInPicture2 size={16} />
          {t('clock.mini')}
        </button>
      </PageHead>

      <div className="clock-layout">
        <section className="card clock-card">
          <Segmented
            value={timer.mode}
            onChange={(m) => idle && setMode(m)}
            options={(['stopwatch', 'countdown', 'pomodoro'] as const).map((m) => ({ value: m, label: t(`clock.${m}` as MessageKey) }))}
          />

          <ClockRing progress={progress} isBreak={isBreak}>
            <span className={`ring-phase${isBreak ? ' break' : ''}`}>
              {timer.status === 'paused' ? t('clock.paused') : idle ? t('clock.ready') : phaseLabel}
            </span>
            <span className="ring-time">{clockText(display)}</span>
            {timer.mode === 'pomodoro' && !idle && <span className="ring-sub">{t('clock.focused', { time: fmt(focused) })}</span>}
          </ClockRing>

          <div className="clock-controls">
            {idle && (
              <button className="btn primary lg" onClick={() => api.timer({ type: 'start' })}>
                <Play size={18} />
                {t('clock.start')}
              </button>
            )}
            {timer.status === 'running' && (
              <button className="btn primary lg" onClick={() => api.timer({ type: 'pause' })}>
                <Pause size={18} />
                {t('clock.pause')}
              </button>
            )}
            {timer.status === 'paused' && (
              <button className="btn primary lg" onClick={() => api.timer({ type: 'resume' })}>
                <Play size={18} />
                {t('clock.resume')}
              </button>
            )}
            {!idle && (
              <>
                <button className="btn lg" onClick={stop}>
                  <Square size={16} />
                  {t('clock.stop')}
                </button>
                {timer.mode === 'pomodoro' && (
                  <button className="icon-btn lg" onClick={() => api.timer({ type: 'skip' })} title={t('clock.skip')} aria-label={t('clock.skip')}>
                    <SkipForward size={18} />
                  </button>
                )}
                <button className="icon-btn lg" onClick={discard} title={t('clock.discard')} aria-label={t('clock.discard')}>
                  <Trash2 size={18} />
                </button>
              </>
            )}
          </div>
          {notice && <p className="notice">{notice}</p>}

          <div className="clock-settings">
            <div className="form-row">
              <Field label={t('clock.linkTag')}>
                <TagSelect value={timer.link.tagId} onChange={(tagId) => api.timer({ type: 'configure', cfg: { link: { ...timer.link, tagId } } })} />
              </Field>
              <Field label={t('clock.linkPlan')}>
                <PlanSelect
                  value={timer.link.planId}
                  plans={nearbyPlans}
                  onChange={(p) => {
                    const link = p ? { planId: p.id, tagId: p.tagId } : { ...timer.link, planId: null }
                    const countdownMs = p && idle && timer.mode === 'countdown' ? p.durationMin * 60_000 : undefined
                    api.timer({ type: 'configure', cfg: { link, countdownMs } })
                  }}
                />
              </Field>
            </div>

            {idle && timer.mode === 'countdown' && (
              <div className="form-row">
                <Field label={t('clock.countdownMin')}>
                  <input
                    type="number"
                    min={1}
                    max={600}
                    key={timer.countdownMs}
                    defaultValue={Math.round(timer.countdownMs / 60_000)}
                    onBlur={(e) => api.apply({ type: 'updateSettings', settings: { countdownMin: num(e.target.value, 25) } })}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                </Field>
                <div />
              </div>
            )}
            {idle && timer.mode === 'pomodoro' && (
              <div className="form-row four">
                {(
                  [
                    ['focusMin', 'clock.focusMin'],
                    ['shortBreakMin', 'clock.shortBreakMin'],
                    ['longBreakMin', 'clock.longBreakMin'],
                    ['longBreakEvery', 'clock.longBreakEvery']
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={t(label)}>
                    <input
                      type="number"
                      min={1}
                      max={key === 'longBreakEvery' ? 12 : 240}
                      key={data.settings.pomodoro[key]}
                      defaultValue={data.settings.pomodoro[key]}
                      onBlur={(e) => setPomodoro({ [key]: num(e.target.value, data.settings.pomodoro[key]) })}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    />
                  </Field>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="card sessions-card">
          <header className="card-head">
            <h2>{t('clock.todaySessions')}</h2>
            <button className="btn sm" onClick={() => setEditingLog('new')}>
              <Plus size={14} />
              {t('clock.logManual')}
            </button>
          </header>
          {todayLogs.length === 0 ? (
            <p className="muted empty-small">{t('clock.noSessions')}</p>
          ) : (
            <ul className="session-list">
              {todayLogs.map((log) => (
                <SessionRow key={log.id} log={log} onOpen={() => setEditingLog(log)} />
              ))}
            </ul>
          )}
          {todayLogs.length > 0 && (
            <div className="sessions-total">
              <span>{t('stats.total')}</span>
              <strong>{fmt(todayLogs.reduce((s, l) => s + logDurationMs(l), 0))}</strong>
            </div>
          )}
        </section>
      </div>

      {editingLog && <LogForm log={editingLog === 'new' ? undefined : editingLog} onClose={() => setEditingLog(null)} />}
    </div>
  )
}

function SessionRow({ log, onOpen }: { log: StudyLog; onOpen: () => void }): ReactNode {
  const { data, t, fmt, tagById } = useApp()
  const plan = log.planId ? data.plans.find((p) => p.id === log.planId) : undefined
  const tag = tagById(log.tagId)
  const title = plan?.title ?? tag?.name ?? t('common.untagged')
  const first = log.segments[0].start
  const last = log.segments[log.segments.length - 1].end
  return (
    <li>
      <button className="session-row" onClick={onOpen}>
        <TagDot tagId={log.tagId} />
        <span className="session-main">
          <span className="session-title">{title}</span>
          <span className="muted small">
            {msToHm(first)}–{msToHm(last)} · {t(`source.${log.source}` as MessageKey)}
            {plan && tag ? ` · ${tag.name}` : ''}
          </span>
        </span>
        <strong className="session-dur">{fmt(logDurationMs(log))}</strong>
      </button>
    </li>
  )
}
