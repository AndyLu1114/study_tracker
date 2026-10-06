import { useCallback, useState, type MouseEvent, type ReactNode } from 'react'
import { Pencil, Play, Trash2 } from 'lucide-react'
import { useApp } from '../state'
import { ContextMenu, type MenuState } from './ContextMenu'
import { usePlanTimer } from './usePlanTimer'
import { useConfirm } from './ui'
import type { Plan } from '../../../shared/types'

/** Right-click menu for a plan: start a countdown for the time left, edit, delete. */
export function usePlanMenu(onEdit: (plan: Plan) => void): {
  openMenu: (e: MouseEvent, plan: Plan) => void
  menu: ReactNode
} {
  const { api, t, fmt, timer } = useApp()
  const confirm = useConfirm()
  const planTimer = usePlanTimer()
  const [state, setState] = useState<MenuState | null>(null)
  const close = useCallback(() => setState(null), [])

  const openMenu = (e: MouseEvent, plan: Plan): void => {
    e.preventDefault()
    e.stopPropagation()
    const left = planTimer.remainingMs(plan)
    setState({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: t('menu.startTimer'),
          icon: <Play size={14} />,
          hint: timer.status !== 'idle' ? t('menu.timerBusy') : left < 1000 ? t('menu.noTimeLeft') : t('menu.timeLeft', { time: fmt(left) }),
          disabled: !planTimer.canStart(plan),
          onSelect: () => planTimer.start(plan)
        },
        { label: t('common.edit'), icon: <Pencil size={14} />, onSelect: () => onEdit(plan) },
        {
          label: t('common.delete'),
          icon: <Trash2 size={14} />,
          danger: true,
          onSelect: async () => {
            if (await confirm(t('planner.deleteConfirm'))) api.apply({ type: 'deletePlan', id: plan.id })
          }
        }
      ]
    })
  }

  return { openMenu, menu: state && <ContextMenu menu={state} onClose={close} /> }
}
