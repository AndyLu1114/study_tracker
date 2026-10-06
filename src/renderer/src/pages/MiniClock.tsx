import { useEffect, type ReactNode } from 'react'
import { Maximize2, Pause, Play, Square, X } from 'lucide-react'
import { useApp } from '../state'
import { useClock } from '../components/useClock'
import { TagDot } from '../components/ui'
import { clockText } from '../format'

/** Small always-on-top window. */
export function MiniClock(): ReactNode {
  const { api, timer, t, data, tagById } = useApp()
  const { display, progress, phaseLabel, isBreak } = useClock()
  useEffect(() => {
    document.body.classList.add('mini-body')
  }, [])
  const plan = timer.link.planId ? data.plans.find((p) => p.id === timer.link.planId) : undefined
  const label = plan?.title ?? tagById(timer.link.tagId)?.name ?? ''
  const idle = timer.status === 'idle'

  return (
    <div className={`mini${isBreak ? ' break' : ''}`}>
      <div className="mini-drag">
        <span className="mini-phase">
          {timer.status === 'paused' ? t('clock.paused') : idle ? t('clock.ready') : phaseLabel}
        </span>
        <div className="mini-window-btns">
          <button className="icon-btn xs" onClick={() => api.showMain()} title={t('clock.openMain')} aria-label={t('clock.openMain')}>
            <Maximize2 size={13} />
          </button>
          <button className="icon-btn xs" onClick={() => api.closeMini()} title={t('common.close')} aria-label={t('common.close')}>
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="mini-row">
        <div className="mini-time-wrap">
          <span className="mini-time">{clockText(display)}</span>
          {label && (
            <span className="mini-label">
              <TagDot tagId={timer.link.tagId} size={7} />
              {label}
            </span>
          )}
        </div>
        <div className="mini-controls">
          {timer.status === 'running' ? (
            <button className="icon-btn round primary" onClick={() => api.timer({ type: 'pause' })} aria-label={t('clock.pause')}>
              <Pause size={16} />
            </button>
          ) : (
            <button
              className="icon-btn round primary"
              onClick={() => api.timer({ type: idle ? 'start' : 'resume' })}
              aria-label={idle ? t('clock.start') : t('clock.resume')}
            >
              <Play size={16} />
            </button>
          )}
          {!idle && (
            <button className="icon-btn round" onClick={() => api.timer({ type: 'stop' })} aria-label={t('clock.stop')} title={t('clock.stop')}>
              <Square size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="mini-progress">
        <div style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  )
}
