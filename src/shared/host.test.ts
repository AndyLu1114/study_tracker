import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudyHost } from './host'
import { emptyData } from './store'

const MIN = 60_000

function makeHost() {
  let now = 1_000_000
  const notify = vi.fn()
  const host = new StudyHost({ data: emptyData(), saveData: () => {}, saveTimer: () => {}, notify, now: () => now })
  return { host, notify, advance: (ms: number) => (now += ms) }
}

afterEach(() => vi.useRealTimers())

describe('StudyHost', () => {
  it('saves a linked log when a session of at least a minute is stopped', () => {
    const { host, advance } = makeHost()
    host.command({ type: 'configure', cfg: { link: { tagId: null, planId: null } } })
    host.command({ type: 'start' })
    advance(30_000)
    host.command({ type: 'stop' })
    expect(host.data.logs).toHaveLength(0)

    host.command({ type: 'start' })
    advance(5 * MIN)
    host.command({ type: 'stop' })
    expect(host.data.logs).toHaveLength(1)
    expect(host.data.logs[0].source).toBe('stopwatch')
    expect(host.data.logs[0].segments[0].end - host.data.logs[0].segments[0].start).toBe(5 * MIN)
  })

  it('finishes a countdown on its own and notifies', () => {
    vi.useFakeTimers()
    const { host, notify, advance } = makeHost()
    host.apply({ type: 'updateSettings', settings: { countdownMin: 10 } })
    host.command({ type: 'configure', cfg: { mode: 'countdown' } })
    host.command({ type: 'start' })
    advance(10 * MIN + 50)
    vi.advanceTimersByTime(10 * MIN + 50)
    expect(host.timer.status).toBe('idle')
    expect(host.data.logs).toHaveLength(1)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('stays quiet when notifications are off', () => {
    vi.useFakeTimers()
    const { host, notify, advance } = makeHost()
    host.apply({ type: 'updateSettings', settings: { notifications: false } })
    host.command({ type: 'configure', cfg: { mode: 'pomodoro' } })
    host.command({ type: 'start' })
    advance(25 * MIN + 50)
    vi.advanceTimersByTime(25 * MIN + 50)
    expect(host.timer.phase).toBe('shortBreak')
    expect(notify).not.toHaveBeenCalled()
  })

  it('drops the timer link when its tag is deleted', () => {
    const { host } = makeHost()
    host.apply({ type: 'upsertTag', tag: { id: 't', name: 'x', color: 0 } })
    host.command({ type: 'configure', cfg: { link: { tagId: 't', planId: null } } })
    host.apply({ type: 'deleteTag', id: 't' })
    expect(host.timer.link.tagId).toBeNull()
  })
})
