import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type StudyApi } from '../shared/api'

function subscribe<T>(channel: string, cb: (v: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, v: T): void => cb(v)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: StudyApi = {
  isElectron: true,
  getData: () => ipcRenderer.invoke(IPC.getData),
  apply: (op) => ipcRenderer.invoke(IPC.apply, op),
  onData: (cb) => subscribe(IPC.dataChanged, cb),
  getTimer: () => ipcRenderer.invoke(IPC.getTimer),
  timer: (cmd) => ipcRenderer.invoke(IPC.timer, cmd),
  onTimer: (cb) => subscribe(IPC.timerChanged, cb),
  exportData: () => ipcRenderer.invoke(IPC.exportData),
  importData: () => ipcRenderer.invoke(IPC.importData),
  dataPath: () => ipcRenderer.invoke(IPC.dataPath),
  connectorStatus: () => ipcRenderer.invoke(IPC.connectorStatus),
  connectorConnect: () => ipcRenderer.invoke(IPC.connectorConnect),
  connectorDisconnect: () => ipcRenderer.invoke(IPC.connectorDisconnect),
  openMini: () => ipcRenderer.send(IPC.openMini),
  closeMini: () => ipcRenderer.send(IPC.closeMini),
  showMain: () => ipcRenderer.send(IPC.showMain)
}

contextBridge.exposeInMainWorld('studyApi', api)
