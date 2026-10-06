import { describe, expect, it } from 'vitest'
import { configure, focusedMs, initialTimer, nextDeadline, pause, remainingInPhase, resume, skip, start, stop, tick } from './timer'

const MIN = 60_000
const pomo = { focusMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 2 }
const base = () => initialTimer(30, pomo)

describe('stopwatch', () => {
  it('counts focused time and excludes pauses', () => {
    let s = start(base(), 0)
    s = pause(s, 10 * MIN)
    s = resume(s, 20 * MIN)
    expect(focusedMs(s, 25 * MIN)).toBe(15 * MIN)
    const r = stop(s, 25 * MIN)
    expect(r.finished?.segments).toEqual([
      { start: 0, end: 10 * MIN },
      { start: 20 * MIN, end: 25 * MIN }
    ])
    expect(r.state.status).toBe('idle')
    expect(nextDeadline(s)).toBeNull()
  })
})

describe('countdown', () => {
  it('finishes exactly at the boundary even if ticked late', () => {
    let s = configure(base(), { mode: 'countdown', countdownMs: 30 * MIN })
    s = start(s, 1000)
    expect(remainingInPhase(s, 1000 + 10 * MIN)).toBe(20 * MIN)
    expect(tick(s, 1000 + 29 * MIN).finished).toBeUndefined()
    const r = tick(s, 1000 + 45 * MIN)
    expect(r.finished?.segments).toEqual([{ start: 1000, end: 1000 + 30 * MIN }])
    expect(r.events).toEqual([{ type: 'countdownFinished' }])
    expect(r.state.status).toBe('idle')
  })

  it('accounts for pauses in the deadline', () => {
    let s = configure(base(), { mode: 'countdown', countdownMs: 10 * MIN })
    s = start(s, 0)
    s = pause(s, 4 * MIN)
    s = resume(s, 10 * MIN)
    expect(nextDeadline(s)).toBe(16 * MIN)
  })

  it('ignores mode changes while running', () => {
    const s = start(base(), 0)
    expect(configure(s, { mode: 'countdown' }).mode).toBe('stopwatch')
    expect(configure(s, { link: { tagId: 't', planId: null } }).link.tagId).toBe('t')
  })
})

describe('pomodoro', () => {
  it('cycles focus → short → focus → long and only records focus', () => {
    let s = start(configure(base(), { mode: 'pomodoro' }), 0)
    // 25 focus, 5 short, 25 focus, then long break (every 2)
    const r = tick(s, 56 * MIN)
    s = r.state
    expect(r.events.map((e) => e.type === 'phaseEnded' && e.to)).toEqual(['shortBreak', 'focus', 'longBreak'])
    expect(s.phase).toBe('longBreak')
    expect(s.round).toBe(2)
    expect(s.runningSince).toBe(55 * MIN)
    expect(focusedMs(s, 56 * MIN)).toBe(50 * MIN)
    const done = stop(s, 60 * MIN)
    expect(done.finished?.segments).toEqual([
      { start: 0, end: 25 * MIN },
      { start: 30 * MIN, end: 55 * MIN }
    ])
  })

  it('skip ends the focus phase early', () => {
    let s = start(configure(base(), { mode: 'pomodoro' }), 0)
    s = skip(s, 10 * MIN).state
    expect(s.phase).toBe('shortBreak')
    expect(s.segments).toEqual([{ start: 0, end: 10 * MIN }])
    s = skip(s, 11 * MIN).state
    expect(s.phase).toBe('focus')
    expect(s.round).toBe(2)
  })
})
