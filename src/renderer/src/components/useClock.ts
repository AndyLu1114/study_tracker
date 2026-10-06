import { useApp, useNow } from '../state'
import { elapsedInPhase, focusedMs, remainingInPhase } from '../../../shared/timer'
import type { MessageKey } from '../../../shared/i18n'

/** Live numbers for the current timer state. */
export function useClock(): {
  display: number
  progress: number
  focused: number
  phaseLabel: string
  isBreak: boolean
} {
  const { timer, t } = useApp()
  const now = useNow(250, timer.status === 'running')
  const remaining = remainingInPhase(timer, now)
  const elapsed = elapsedInPhase(timer, now)
  const display = remaining ?? elapsed
  // Timed phases drain from full; the stopwatch fills once per hour.
  const progress =
    timer.phaseDurationMs !== null && timer.phaseDurationMs > 0
      ? 1 - elapsed / timer.phaseDurationMs
      : (elapsed % 3_600_000) / 3_600_000
  const isBreak = timer.phase !== 'focus'
  let phaseLabel: string
  if (timer.mode === 'pomodoro') {
    phaseLabel = `${t(`clock.${timer.phase}` as MessageKey)} · ${t('clock.round', { n: timer.round })}`
  } else {
    phaseLabel = t(`clock.${timer.mode}` as MessageKey)
  }
  return { display, progress: Math.min(1, Math.max(0, progress)), focused: focusedMs(timer, now), phaseLabel, isBreak }
}
