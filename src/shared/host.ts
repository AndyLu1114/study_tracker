// Owns the app data and the study clock. The Electron main process runs one
// of these; the browser preview runs one in-page.

import { t } from './i18n'
import { applyOp, newId, type StoreOp } from './store'
import * as T from './timer'
import type { AppData, StudyLog, TimerState } from './types'

export type TimerCommand =
  | { type: 'configure'; cfg: T.TimerConfig }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' }
  | { type: 'discard' }
  | { type: 'skip' }

export interface HostOptions {
  data: AppData
  timer?: TimerState | null
  saveData(data: AppData): void
  saveTimer(timer: TimerState): void
  notify(title: string, body: string): void
  now?: () => number
}

export class StudyHost {
  data: AppData
  timer: TimerState
  private opts: HostOptions
  private now: () => number
  private dataListeners = new Set<(d: AppData) => void>()
  private timerListeners = new Set<(s: TimerState) => void>()
  private handle: ReturnType<typeof setTimeout> | null = null

  constructor(opts: HostOptions) {
    this.opts = opts
    this.now = opts.now ?? Date.now
    this.data = opts.data
    const s = opts.data.settings
    this.timer = opts.timer ?? T.initialTimer(s.countdownMin, s.pomodoro)
    // A session may have kept running while the app was closed.
    this.handleResult(T.tick(this.timer, this.now()), false)
    this.schedule()
  }

  onData(cb: (d: AppData) => void): () => void {
    this.dataListeners.add(cb)
    return () => this.dataListeners.delete(cb)
  }

  onTimer(cb: (s: TimerState) => void): () => void {
    this.timerListeners.add(cb)
    return () => this.timerListeners.delete(cb)
  }

  apply(op: StoreOp): void {
    this.setData(applyOp(this.data, op))
    if (op.type === 'updateSettings' && (op.settings.pomodoro || op.settings.countdownMin)) {
      const s = this.data.settings
      this.setTimer(T.configure(this.timer, { pomodoro: s.pomodoro, countdownMs: s.countdownMin * 60_000 }))
    }
    // Drop links to things that no longer exist.
    const { tagId, planId } = this.timer.link
    const tagGone = tagId && !this.data.tags.some((x) => x.id === tagId)
    const planGone = planId && !this.data.plans.some((x) => x.id === planId)
    if (tagGone || planGone) {
      this.setTimer(T.configure(this.timer, { link: { tagId: tagGone ? null : tagId, planId: planGone ? null : planId } }))
    }
  }

  command(cmd: TimerCommand): void {
    const now = this.now()
    // Catch up first so commands act on the real current phase.
    this.handleResult(T.tick(this.timer, now), true)
    const s = this.timer
    switch (cmd.type) {
      case 'configure':
        this.setTimer(T.configure(s, cmd.cfg))
        break
      case 'start':
        this.setTimer(T.start(s, now))
        break
      case 'pause':
        this.setTimer(T.pause(s, now))
        break
      case 'resume':
        this.setTimer(T.resume(s, now))
        break
      case 'stop':
        this.handleResult(T.stop(s, now), false)
        break
      case 'discard':
        this.setTimer(T.discard(s))
        break
      case 'skip':
        this.handleResult(T.skip(s, now), false)
        break
    }
  }

  /** Call when the machine wakes from sleep. */
  wake(): void {
    this.handleResult(T.tick(this.timer, this.now()), true)
  }

  dispose(): void {
    if (this.handle) clearTimeout(this.handle)
  }

  private handleResult(r: T.TimerResult, notify: boolean): void {
    const lang = this.data.settings.language
    if (r.finished) {
      const ms = r.finished.segments.reduce((sum, seg) => sum + seg.end - seg.start, 0)
      if (ms >= T.MIN_LOG_MS) {
        const log: StudyLog = {
          id: newId(),
          segments: r.finished.segments,
          source: r.finished.mode,
          tagId: r.finished.link.tagId,
          planId: r.finished.link.planId,
          note: '',
          createdAt: this.now()
        }
        this.setData(applyOp(this.data, { type: 'upsertLog', log }))
      }
    }
    if (notify && this.data.settings.notifications) {
      for (const e of r.events) {
        if (e.type === 'countdownFinished') {
          this.opts.notify(t(lang, 'notify.countdownTitle'), t(lang, 'notify.countdownBody'))
        } else if (e.to === 'focus') {
          this.opts.notify(t(lang, 'notify.focusTitle'), t(lang, 'notify.focusBody', { round: e.round }))
        } else {
          const mins = e.to === 'longBreak' ? r.state.pomodoro.longBreakMin : r.state.pomodoro.shortBreakMin
          this.opts.notify(t(lang, 'notify.breakTitle'), t(lang, 'notify.breakBody', { mins }))
        }
      }
    }
    this.setTimer(r.state)
  }

  private setData(data: AppData): void {
    this.data = data
    this.opts.saveData(data)
    for (const cb of this.dataListeners) cb(data)
  }

  private setTimer(state: TimerState): void {
    if (state === this.timer) return
    this.timer = state
    this.opts.saveTimer(state)
    for (const cb of this.timerListeners) cb(state)
    this.schedule()
  }

  private schedule(): void {
    if (this.handle) clearTimeout(this.handle)
    this.handle = null
    const deadline = T.nextDeadline(this.timer)
    if (deadline === null) return
    // setTimeout caps at ~24.8 days; re-arm in chunks.
    const delay = Math.min(Math.max(0, deadline - this.now()) + 20, 2 ** 30)
    this.handle = setTimeout(() => {
      this.handleResult(T.tick(this.timer, this.now()), true)
      this.schedule()
    }, delay)
  }
}
