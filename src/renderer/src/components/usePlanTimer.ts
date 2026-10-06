import { useCallback, useMemo } from 'react'
import { useApp } from '../state'
import { planRemainingMs } from '../../../shared/goals'
import { msByPlan } from '../../../shared/stats'
import type { Plan } from '../../../shared/types'

/**
 * Starting a countdown for the time left on a plan. It only starts when the
 * clock is free and there is time left; otherwise it does nothing.
 */
export function usePlanTimer(): {
  studiedMs: (plan: Plan) => number
  remainingMs: (plan: Plan) => number
  canStart: (plan: Plan) => boolean
  start: (plan: Plan) => Promise<void>
} {
  const { api, data, timer, setPage } = useApp()
  const studied = useMemo(() => msByPlan(data.logs), [data.logs])
  const studiedMs = useCallback((plan: Plan) => studied.get(plan.id) ?? 0, [studied])
  const remainingMs = useCallback((plan: Plan) => planRemainingMs(plan, studiedMs(plan)), [studiedMs])
  const canStart = useCallback((plan: Plan) => timer.status === 'idle' && remainingMs(plan) >= 1000, [timer.status, remainingMs])
  const start = useCallback(
    async (plan: Plan) => {
      if (!canStart(plan)) return
      await api.timer({
        type: 'configure',
        cfg: { mode: 'countdown', countdownMs: remainingMs(plan), link: { tagId: plan.tagId, planId: plan.id } }
      })
      await api.timer({ type: 'start' })
      setPage('clock')
    },
    [api, canStart, remainingMs, setPage]
  )
  return { studiedMs, remainingMs, canStart, start }
}
