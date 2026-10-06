import type { ReactNode } from 'react'
import { PictureInPicture2 } from 'lucide-react'
import { useApp } from '../state'
import { useClock } from './useClock'
import { clockText } from '../format'

export function SidebarTimer(): ReactNode {
  const { timer, t, setPage, api } = useApp()
  const { display, phaseLabel, isBreak } = useClock()
  return (
    <div className="sidebar-foot">
      {timer.status !== 'idle' && (
        <button className={`sidebar-timer${isBreak ? ' break' : ''}`} onClick={() => setPage('clock')}>
          <span className={`pulse${timer.status === 'paused' ? ' paused' : ''}`} />
          <span className="sidebar-timer-text">
            <strong>{clockText(display)}</strong>
            <span>{timer.status === 'paused' ? t('clock.paused') : phaseLabel}</span>
          </span>
        </button>
      )}
      <button className="nav-item" onClick={() => api.openMini()}>
        <PictureInPicture2 size={18} strokeWidth={1.8} />
        {t('clock.mini')}
      </button>
    </div>
  )
}
