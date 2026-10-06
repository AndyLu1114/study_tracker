// A private local channel between the Claude connector and the running app.
//
// While Study Tracker is open it listens on a named pipe (Windows) or a Unix
// socket and writes `connector.json` (endpoint, a random token, its pid) into
// its data folder. The connector reads that file, connects, and sends
// newline-delimited JSON requests carrying the token. When the app is closed,
// the connector works on the data file directly instead.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { connect, createServer, type Server, type Socket } from 'node:net'
import { join } from 'node:path'
import { applyOp, emptyData, normalizeData, type StoreOp } from '../shared/store'
import type { AppData } from '../shared/types'
import { dailyBackup } from './backup'
import { readJson, writeJsonAtomic } from './persistence'

export const DATA_FILE = 'study-data.json'
const INFO_FILE = 'connector.json'

/** Store operations the connector may send. Settings and full replaces are not among them. */
const ALLOWED_OPS = new Set<StoreOp['type']>(['upsertPlan', 'deletePlan', 'upsertGoal', 'deleteGoal', 'upsertTag', 'upsertLog'])

export interface BridgeInfo {
  endpoint: string
  token: string
  pid: number
}

type Request = { id: number; token: string; method: 'read' } | { id: number; token: string; method: 'apply'; ops: StoreOp[] }
type Response = { id: number; ok: true; data: AppData } | { id: number; ok: false; error: string }

export function bridgeEndpoint(dataDir: string): string {
  if (process.platform === 'win32') {
    const hash = createHash('sha256').update(dataDir.toLowerCase()).digest('hex').slice(0, 16)
    return `\\\\.\\pipe\\study-tracker-${hash}`
  }
  return join(dataDir, 'connector.sock')
}

/** Applies connector ops to `data`, rejecting anything outside the allowed set. */
export function applyConnectorOps(data: AppData, ops: StoreOp[]): AppData {
  for (const op of ops) {
    if (!ALLOWED_OPS.has(op.type)) throw new Error(`Operation not allowed: ${op.type}`)
  }
  // normalizeData drops anything malformed rather than saving it.
  return normalizeData(ops.reduce(applyOp, data))
}

export interface BridgeHost {
  getData(): AppData
  /** Replaces the app's data (the app re-validates and broadcasts it). */
  replaceData(data: AppData): void
}

/** Starts the app side. Returns a function that stops it and removes connector.json. */
export async function startBridgeServer(dataDir: string, host: BridgeHost): Promise<() => void> {
  const endpoint = bridgeEndpoint(dataDir)
  const token = randomBytes(32).toString('hex')
  const tokenBuf = Buffer.from(token)
  if (process.platform !== 'win32' && existsSync(endpoint)) rmSync(endpoint, { force: true })

  const handle = (req: Request): Response => {
    const given = Buffer.from(String(req.token ?? ''))
    if (given.length !== tokenBuf.length || !timingSafeEqual(given, tokenBuf)) {
      return { id: req.id, ok: false, error: 'Not authorized' }
    }
    if (req.method === 'read') return { id: req.id, ok: true, data: host.getData() }
    if (req.method === 'apply' && Array.isArray(req.ops)) {
      const next = applyConnectorOps(host.getData(), req.ops)
      dailyBackup(dataDir, host.getData())
      host.replaceData(next)
      return { id: req.id, ok: true, data: host.getData() }
    }
    return { id: (req as Request).id, ok: false, error: 'Unknown request' }
  }

  const server: Server = createServer((socket: Socket) => {
    let buffer = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      buffer += chunk
      if (buffer.length > 8_000_000) return socket.destroy()
      let nl: number
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 1)
        let res: Response
        try {
          res = handle(JSON.parse(line) as Request)
        } catch (err) {
          res = { id: -1, ok: false, error: err instanceof Error ? err.message : String(err) }
        }
        socket.write(JSON.stringify(res) + '\n')
      }
    })
    socket.on('error', () => socket.destroy())
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(endpoint, () => resolve())
  })
  const info: BridgeInfo = { endpoint, token, pid: process.pid }
  writeJsonAtomic(join(dataDir, INFO_FILE), info)
  // The token is the key to the channel: keep it readable by this user only.
  if (process.platform !== 'win32') chmodSync(join(dataDir, INFO_FILE), 0o600)

  return () => {
    server.close()
    rmSync(join(dataDir, INFO_FILE), { force: true })
    rmSync(`${join(dataDir, INFO_FILE)}.bak`, { force: true })
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM: the process exists but belongs to someone else.
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function readInfo(dataDir: string): BridgeInfo | null {
  try {
    const info = JSON.parse(readFileSync(join(dataDir, INFO_FILE), 'utf8')) as BridgeInfo
    return info && typeof info.endpoint === 'string' && typeof info.token === 'string' ? info : null
  } catch {
    return null
  }
}

function request(info: BridgeInfo, body: { method: 'read' } | { method: 'apply'; ops: StoreOp[] }): Promise<AppData> {
  return new Promise((resolve, reject) => {
    const socket = connect(info.endpoint)
    let buffer = ''
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('Study Tracker did not respond in time.'))
    }, 10_000)
    socket.setEncoding('utf8')
    socket.on('connect', () => socket.write(JSON.stringify({ id: 1, token: info.token, ...body }) + '\n'))
    socket.on('data', (chunk: string) => {
      buffer += chunk
      const nl = buffer.indexOf('\n')
      if (nl === -1) return
      clearTimeout(timer)
      socket.end()
      try {
        const res = JSON.parse(buffer.slice(0, nl)) as Response
        if (res.ok) resolve(res.data)
        else reject(new Error(res.error))
      } catch (err) {
        reject(err)
      }
    })
    socket.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

/** How the connector reaches the data: through the running app, or the file. */
export interface DataPort {
  read(): Promise<AppData>
  apply(ops: StoreOp[]): Promise<AppData>
}

/**
 * Talks to the running app when it is open; otherwise reads and writes the
 * data file. Decides per call, so opening or closing the app mid-conversation is fine.
 */
export function createDataPort(dataDir: string): DataPort {
  const dataPath = join(dataDir, DATA_FILE)
  const appInfo = (): BridgeInfo | null => {
    const info = readInfo(dataDir)
    return info && isAlive(info.pid) ? info : null
  }
  const readFile = (): AppData => {
    const raw = readJson(dataPath)
    return raw ? normalizeData(raw) : emptyData()
  }
  const viaApp = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn()
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT' || code === 'ECONNREFUSED') {
        throw new Error('Study Tracker is open but not responding. Please restart Study Tracker and try again.')
      }
      throw err
    }
  }
  return {
    async read() {
      const info = appInfo()
      return info ? viaApp(() => request(info, { method: 'read' })) : readFile()
    },
    async apply(ops) {
      const info = appInfo()
      if (info) return viaApp(() => request(info, { method: 'apply', ops }))
      const current = readFile()
      const next = applyConnectorOps(current, ops)
      if (existsSync(dataPath)) dailyBackup(dataDir, current)
      writeJsonAtomic(dataPath, next)
      return next
    }
  }
}
