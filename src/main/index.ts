import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, Notification, powerMonitor, screen, shell } from 'electron'
import { IPC, type ImportResult } from '../shared/api'
import { StudyHost, type TimerCommand } from '../shared/host'
import { t } from '../shared/i18n'
import { emptyData, normalizeData, type StoreOp } from '../shared/store'
import type { AppData, TimerState } from '../shared/types'
import { debouncedWriter, readJson, writeJsonAtomic } from '../node/persistence'
import { startBridgeServer } from '../node/bridge'
import { connectClaude, connectorStatus, disconnectClaude } from './claudeConnector'
import { isMac, offerMoveToApplications, setMacMenu } from './mac'

const APP_ID = 'com.andylu.studytracker'

let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null
let host: StudyHost

// A second copy just hands focus to the first one and quits.
const isFirstInstance = app.requestSingleInstanceLock()
if (!isFirstInstance) app.quit()

function loadRenderer(win: BrowserWindow, hash = ''): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${hash}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
}

function windowBackground(): string {
  const theme = host.data.settings.theme
  const dark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
  return dark ? '#141413' : '#f6f6f4'
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 940,
    minHeight: 620,
    show: false,
    title: t(host.data.settings.language, 'app.name'),
    backgroundColor: windowBackground(),
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  mainWindow.setMenuBarVisibility(false)
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
    // On Windows, closing the main window quits the app, mini clock included.
    // On macOS the app (and its timer) keeps running in the Dock.
    if (!isMac) miniWindow?.close()
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  loadRenderer(mainWindow)
}

function openMini(): void {
  if (miniWindow) {
    miniWindow.show()
    return
  }
  const { workArea } = screen.getPrimaryDisplay()
  const width = 300
  const height = 132
  miniWindow = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 24,
    y: workArea.y + 24,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: windowBackground(),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  miniWindow.setAlwaysOnTop(true, 'floating')
  // Keep the timer visible on every desktop (Space), even over full-screen apps.
  if (isMac) miniWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  miniWindow.on('closed', () => (miniWindow = null))
  loadRenderer(miniWindow, '/mini')
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
}

function setupHost(): void {
  const dir = app.getPath('userData')
  const dataPath = join(dir, 'study-data.json')
  const timerPath = join(dir, 'timer-state.json')

  let data: AppData
  const raw = readJson(dataPath)
  try {
    data = raw ? normalizeData(raw) : emptyData()
  } catch {
    data = emptyData()
  }
  const savedTimer = readJson(timerPath) as TimerState | null

  const dataWriter = debouncedWriter(dataPath)
  const timerWriter = debouncedWriter(timerPath)
  host = new StudyHost({
    data,
    timer: savedTimer && typeof savedTimer === 'object' && 'status' in savedTimer ? savedTimer : null,
    saveData: (d) => dataWriter.write(d),
    saveTimer: (s) => timerWriter.write(s),
    notify: (title, body) => {
      if (!Notification.isSupported()) return
      const n = new Notification({ title, body, silent: true })
      n.on('click', () => showMain())
      n.show()
    }
  })
  if (!raw) writeJsonAtomic(dataPath, host.data)

  host.onData((d) => broadcast(IPC.dataChanged, d))
  host.onTimer((s) => broadcast(IPC.timerChanged, s))
  app.on('before-quit', () => {
    dataWriter.flush()
    timerWriter.flush()
  })
  powerMonitor.on('resume', () => host.wake())

  ipcMain.handle(IPC.getData, () => host.data)
  ipcMain.handle(IPC.apply, (_e, op: StoreOp) => host.apply(op))
  ipcMain.handle(IPC.getTimer, () => host.timer)
  ipcMain.handle(IPC.timer, (_e, cmd: TimerCommand) => host.command(cmd))
  ipcMain.handle(IPC.dataPath, () => dataPath)

  ipcMain.handle(IPC.exportData, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const stamp = new Date().toISOString().slice(0, 10)
    const opts = {
      defaultPath: join(app.getPath('documents'), `study-tracker-backup-${stamp}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return false
    writeJsonAtomic(res.filePath, { ...host.data, exportedAt: new Date().toISOString() })
    return true
  })

  ipcMain.handle(IPC.importData, async (e): Promise<ImportResult> => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const opts = { properties: ['openFile' as const], filters: [{ name: 'JSON', extensions: ['json'] }] }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return { ok: false, cancelled: true }
    try {
      const parsed = normalizeData(JSON.parse(readFileSync(res.filePaths[0], 'utf8')))
      host.apply({ type: 'replaceAll', data: parsed })
      return { ok: true }
    } catch (err) {
      return { ok: false, cancelled: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.connectorStatus, () => connectorStatus())
  ipcMain.handle(IPC.connectorConnect, () => connectClaude())
  ipcMain.handle(IPC.connectorDisconnect, () => disconnectClaude())

  // Lets the Claude connector make changes through the running app.
  startBridgeServer(dir, {
    getData: () => host.data,
    replaceData: (data) => host.apply({ type: 'replaceAll', data })
  })
    .then((stop) => app.on('will-quit', stop))
    .catch((err) => console.error('Claude connector bridge failed to start:', err))

  ipcMain.on(IPC.openMini, () => openMini())
  ipcMain.on(IPC.closeMini, () => miniWindow?.close())
  ipcMain.on(IPC.showMain, () => showMain())
}

function showMain(): void {
  if (!mainWindow) {
    createMainWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

app.on('second-instance', () => showMain())

app.whenReady().then(() => {
  if (!isFirstInstance) return
  // Required on Windows for notifications to show the app name.
  if (process.platform === 'win32') app.setAppUserModelId(APP_ID)
  if (isMac) setMacMenu()
  setupHost()
  createMainWindow()
  offerMoveToApplications(host.data.settings.language)
})

// macOS: clicking the Dock icon with no window open brings it back.
app.on('activate', () => {
  if (isFirstInstance && host) showMain()
})

app.on('window-all-closed', () => {
  // macOS apps stay running until Cmd+Q, so the timer keeps going.
  if (isMac) return
  host?.dispose()
  app.quit()
})
