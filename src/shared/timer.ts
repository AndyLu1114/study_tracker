// The study clock as pure functions of (state, now). The host (Electron main
// process, or the browser fallback) owns the state, schedules a tick at
// nextDeadline(), and turns finished sessions into StudyLogs.

import type { PomodoroSettings, Segment, TimerLink, TimerMode, TimerPhase, TimerState } from './types'

export const MIN_LOG_MS = 60_000

export type TimerEvent =
  | { type: 'phaseEnded'; from: TimerPhase; to: TimerPhase; round: number }
  | { type: 'countdownFinished' }

export interface FinishedSession {
  mode: TimerMode
  segments: Segment[]
  link: TimerLink
}

export interface TimerResult {
  state: TimerState
  events: TimerEvent[]
  /** Set when a session ended (stopped, or a countdown reached zero). */
  finished?: FinishedSession
}

const MIN = 60_000

export function initialTimer(countdownMin: number, pomodoro: PomodoroSettings): TimerState {
  return {
    status: 'idle',
    mode: 'stopwatch',
    phase: 'focus',
    round: 1,
    phaseDurationMs: null,
    phaseElapsedMs: 0,
    runningSince: null,
    segments: [],
    countdownMs: countdownMin * MIN,
    pomodoro,
    link: { tagId: null, planId: null }
  }
}

function phaseLength(s: Pick<TimerState, 'mode' | 'countdownMs' | 'pomodoro'>, phase: TimerPhase): number | null {
  if (s.mode === 'stopwatch') return null
  if (s.mode === 'countdown') return s.countdownMs
  if (phase === 'focus') return s.pomodoro.focusMin * MIN
  if (phase === 'shortBreak') return s.pomodoro.shortBreakMin * MIN
  return s.pomodoro.longBreakMin * MIN
}

/** Resets to a fresh idle session, keeping mode, durations and link. */
function toIdle(s: TimerState): TimerState {
  return {
    ...s,
    status: 'idle',
    phase: 'focus',
    round: 1,
    phaseDurationMs: phaseLength(s, 'focus'),
    phaseElapsedMs: 0,
    runningSince: null,
    segments: []
  }
}

export interface TimerConfig {
  mode?: TimerMode
  countdownMs?: number
  pomodoro?: PomodoroSettings
  link?: TimerLink
}

/** Mode and durations only change while idle; the link can change any time. */
export function configure(s: TimerState, cfg: TimerConfig): TimerState {
  let next: TimerState = cfg.link ? { ...s, link: cfg.link } : s
  if (s.status === 'idle' && (cfg.mode || cfg.countdownMs || cfg.pomodoro)) {
    next = toIdle({
      ...next,
      mode: cfg.mode ?? s.mode,
      countdownMs: cfg.countdownMs && cfg.countdownMs > 0 ? cfg.countdownMs : s.countdownMs,
      pomodoro: cfg.pomodoro ?? s.pomodoro
    })
  }
  return next
}

export function start(s: TimerState, now: number): TimerState {
  if (s.status !== 'idle') return s
  return { ...toIdle(s), status: 'running', runningSince: now }
}

export function pause(s: TimerState, now: number): TimerState {
  if (s.status !== 'running' || s.runningSince === null) return s
  const stretch = Math.max(0, now - s.runningSince)
  return {
    ...s,
    status: 'paused',
    runningSince: null,
    phaseElapsedMs: s.phaseElapsedMs + stretch,
    segments: s.phase === 'focus' && stretch > 0 ? [...s.segments, { start: s.runningSince, end: now }] : s.segments
  }
}

export function resume(s: TimerState, now: number): TimerState {
  if (s.status !== 'paused') return s
  return { ...s, status: 'running', runningSince: now }
}

export function elapsedInPhase(s: TimerState, now: number): number {
  const running = s.status === 'running' && s.runningSince !== null ? Math.max(0, now - s.runningSince) : 0
  return s.phaseElapsedMs + running
}

/** Remaining ms in the current phase, or null for the stopwatch. */
export function remainingInPhase(s: TimerState, now: number): number | null {
  if (s.phaseDurationMs === null) return null
  return Math.max(0, s.phaseDurationMs - elapsedInPhase(s, now))
}

/** Total focused time of the session so far. */
export function focusedMs(s: TimerState, now: number): number {
  const closed = s.segments.reduce((sum, seg) => sum + seg.end - seg.start, 0)
  const open = s.phase === 'focus' && s.status === 'running' && s.runningSince !== null ? Math.max(0, now - s.runningSince) : 0
  return closed + open
}

export function nextDeadline(s: TimerState): number | null {
  if (s.status !== 'running' || s.runningSince === null || s.phaseDurationMs === null) return null
  return s.runningSince + (s.phaseDurationMs - s.phaseElapsedMs)
}

/** Ends the current phase at time `at` (the phase's own boundary, not "now"). */
function endPhase(s: TimerState, at: number, events: TimerEvent[]): TimerResult {
  const wasRunning = s.status === 'running' && s.runningSince !== null
  const segments =
    s.phase === 'focus' && wasRunning && at > s.runningSince! ? [...s.segments, { start: s.runningSince!, end: at }] : s.segments

  if (s.mode === 'countdown') {
    events.push({ type: 'countdownFinished' })
    return { state: toIdle(s), events, finished: { mode: s.mode, segments, link: s.link } }
  }

  const from = s.phase
  let to: TimerPhase
  let round = s.round
  if (from === 'focus') {
    to = s.round % s.pomodoro.longBreakEvery === 0 ? 'longBreak' : 'shortBreak'
  } else {
    to = 'focus'
    round += 1
  }
  events.push({ type: 'phaseEnded', from, to, round })
  return {
    state: {
      ...s,
      phase: to,
      round,
      segments,
      phaseDurationMs: phaseLength(s, to),
      phaseElapsedMs: 0,
      runningSince: wasRunning ? at : null
    },
    events
  }
}

/** Processes every phase boundary that has passed by `now`. */
export function tick(s: TimerState, now: number): TimerResult {
  const events: TimerEvent[] = []
  let state = s
  for (let guard = 0; guard < 10_000; guard++) {
    const deadline = nextDeadline(state)
    if (deadline === null || deadline > now) break
    const r = endPhase(state, deadline, events)
    if (r.finished) return r
    state = r.state
  }
  return { state, events }
}

/** Pomodoro: jump to the next phase now. */
export function skip(s: TimerState, now: number): TimerResult {
  if (s.mode !== 'pomodoro' || s.status === 'idle') return { state: s, events: [] }
  const at = s.status === 'running' ? now : 0
  return endPhase(s, at, [])
}

export function stop(s: TimerState, now: number): TimerResult {
  if (s.status === 'idle') return { state: s, events: [] }
  const paused = pause(s, now)
  return { state: toIdle(paused), events: [], finished: { mode: s.mode, segments: paused.segments, link: s.link } }
}

/** Throws the session away without saving. */
export function discard(s: TimerState): TimerState {
  return toIdle(s)
}
