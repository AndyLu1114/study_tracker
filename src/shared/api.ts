import type { TimerCommand } from './host'
import type { StoreOp } from './store'
import type { AppData, TimerState } from './types'

export type ConnectorState = 'connected' | 'notConnected' | 'needsUpdate' | 'claudeMissing' | 'portable' | 'moveToApplications' | 'unavailable'

/** Whether the Claude desktop app is set up to use Study Tracker's connector. */
export interface ConnectorStatus {
  state: ConnectorState
  error?: string
}

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
  connectorStatus(): Promise<ConnectorStatus>
  connectorConnect(): Promise<ConnectorStatus>
  connectorDisconnect(): Promise<ConnectorStatus>
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
  connectorStatus: 'connector:status',
  connectorConnect: 'connector:connect',
  connectorDisconnect: 'connector:disconnect',
  openMini: 'win:openMini',
  closeMini: 'win:closeMini',
  showMain: 'win:showMain'
} as const
