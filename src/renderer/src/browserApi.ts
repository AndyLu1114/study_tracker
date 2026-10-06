// In-page backend for running the UI in a normal browser (npm run web).
// Same StudyHost as the desktop app, persisted to localStorage.

import type { StudyApi } from '../../shared/api'
import { StudyHost } from '../../shared/host'
import { emptyData, normalizeData } from '../../shared/store'
import type { TimerState } from '../../shared/types'

const DATA_KEY = 'study-tracker:data'
const TIMER_KEY = 'study-tracker:timer'

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable; keep running in memory
  }
}

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

export function createBrowserApi(): StudyApi {
  let data
  try {
    data = normalizeData(read(DATA_KEY))
  } catch {
    data = emptyData()
  }
  const host = new StudyHost({
    data,
    timer: read(TIMER_KEY) as TimerState | null,
    saveData: (d) => write(DATA_KEY, d),
    saveTimer: (s) => write(TIMER_KEY, s),
    notify: (title, body) => {
      if (typeof Notification === 'undefined') return
      if (Notification.permission === 'granted') new Notification(title, { body, silent: true })
      else if (Notification.permission !== 'denied') Notification.requestPermission()
    }
  })

  return {
    isElectron: false,
    getData: async () => host.data,
    apply: async (op) => host.apply(op),
    onData: (cb) => host.onData(cb),
    getTimer: async () => host.timer,
    timer: async (cmd) => host.command(cmd),
    onTimer: (cb) => host.onTimer(cb),
    exportData: async () => {
      const blob = new Blob([JSON.stringify({ ...host.data, exportedAt: new Date().toISOString() }, null, 2)], {
        type: 'application/json'
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `study-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      return true
    },
    importData: async () => {
      const file = await pickFile()
      if (!file) return { ok: false, cancelled: true }
      try {
        host.apply({ type: 'replaceAll', data: normalizeData(JSON.parse(await file.text())) })
        return { ok: true }
      } catch (err) {
        return { ok: false, cancelled: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
    dataPath: async () => 'Browser storage (localStorage)',
    // The connector needs the desktop app.
    connectorStatus: async () => ({ state: 'unavailable' }),
    connectorConnect: async () => ({ state: 'unavailable' }),
    connectorDisconnect: async () => ({ state: 'unavailable' }),
    openMini: () => window.open('#/mini', 'mini', 'width=300,height=132'),
    closeMini: () => window.close(),
    showMain: () => window.opener?.focus()
  }
}
