import type { TimerCommand } from './host'
import type { StoreOp } from './store'
import type { AppData, TimerState } from './types'

export type ImportResult = { ok: true } | { ok: false; cancelled: boolean; error?: string }

/** What the UI can ask of the backend (Electron preload, or the browser fallback). */
export interface StudyApi {
  isElectron: boolean
  getData(): Promise<AppData>
  apply(op: StoreOp): Promise<void>
  onData(cb: (d: AppData) => void): () => void
  getTimer(): Promise<TimerState>
  timer(cmd: TimerCommand): Promise<void>
  onTimer(cb: (s: TimerState) => void): () => void
  exportData(): Promise<boolean>
  importData(): Promise<ImportResult>
  dataPath(): Promise<string>
  openMini(): void
  closeMini(): void
  showMain(): void
}

export const IPC = {
  getData: 'data:get',
  apply: 'data:apply',
  dataChanged: 'data:changed',
  getTimer: 'timer:get',
  timer: 'timer:command',
  timerChanged: 'timer:changed',
  exportData: 'data:export',
  importData: 'data:import',
  dataPath: 'data:path',
  openMini: 'win:openMini',
  closeMini: 'win:closeMini',
  showMain: 'win:showMain'
} as const
