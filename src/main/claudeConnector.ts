// Adds or removes Study Tracker in the Claude desktop app's config, so Claude
// can start the connector (out/mcp/index.cjs) using this app's own executable.

import { app } from 'electron'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ConnectorStatus } from '../shared/api'
import { writeJsonAtomic } from '../node/persistence'

const KEY = 'study-tracker'
const FILE = 'claude_desktop_config.json'

interface ServerEntry {
  command: string
  args: string[]
  env: Record<string, string>
}

/** Claude desktop config folders that exist on this machine. */
function claudeDirs(): string[] {
  if (process.env.STUDY_TRACKER_CLAUDE_DIR) return [process.env.STUDY_TRACKER_CLAUDE_DIR] // tests
  const dirs: string[] = []
  if (process.platform === 'win32') {
    if (process.env.APPDATA) dirs.push(join(process.env.APPDATA, 'Claude'))
    // The Microsoft Store version reads its config from a virtualized folder.
    if (process.env.LOCALAPPDATA) {
      const packages = join(process.env.LOCALAPPDATA, 'Packages')
      try {
        for (const name of readdirSync(packages)) {
          if (/claude/i.test(name)) dirs.push(join(packages, name, 'LocalCache', 'Roaming', 'Claude'))
        }
      } catch {
        // no Packages folder
      }
    }
  } else if (process.platform === 'darwin') {
    dirs.push(join(homedir(), 'Library', 'Application Support', 'Claude'))
  } else {
    dirs.push(join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'Claude'))
  }
  return dirs.filter((d) => existsSync(d))
}

function scriptPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'app.asar.unpacked', 'out', 'mcp', 'index.cjs')
    : join(app.getAppPath(), 'out', 'mcp', 'index.cjs')
}

function entry(): ServerEntry {
  return { command: process.execPath, args: [scriptPath(), '--data-dir', app.getPath('userData')], env: { ELECTRON_RUN_AS_NODE: '1' } }
}

type Config = { mcpServers?: Record<string, unknown> } & Record<string, unknown>

function readConfig(dir: string): Config {
  const file = join(dir, FILE)
  if (!existsSync(file)) return {}
  const text = readFileSync(file, 'utf8')
  if (!text.trim()) return {}
  const parsed = JSON.parse(text) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${file} is not a JSON object`)
  return parsed as Config
}

const sameEntry = (a: unknown, b: ServerEntry): boolean => {
  const e = a as Partial<ServerEntry> | undefined
  return !!e && e.command === b.command && JSON.stringify(e.args) === JSON.stringify(b.args)
}

export function connectorStatus(): ConnectorStatus {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return { state: 'portable' }
  const dirs = claudeDirs()
  if (dirs.length === 0) return { state: 'claudeMissing' }
  const want = entry()
  let found = 0
  let current = 0
  for (const dir of dirs) {
    try {
      const existing = readConfig(dir).mcpServers?.[KEY]
      if (existing) found++
      if (sameEntry(existing, want)) current++
    } catch {
      // unreadable config counts as not connected; connect() reports the error
    }
  }
  if (found === 0) return { state: 'notConnected' }
  return { state: current === found ? 'connected' : 'needsUpdate' }
}

export function connectClaude(): ConnectorStatus {
  const status = connectorStatus()
  if (status.state === 'portable' || status.state === 'claudeMissing') return status
  if (!existsSync(scriptPath())) return { ...status, error: `Connector file is missing: ${scriptPath()}` }
  try {
    for (const dir of claudeDirs()) {
      const config = readConfig(dir)
      config.mcpServers = { ...(config.mcpServers ?? {}), [KEY]: entry() }
      writeJsonAtomic(join(dir, FILE), config)
    }
  } catch (err) {
    return { ...connectorStatus(), error: err instanceof Error ? err.message : String(err) }
  }
  return connectorStatus()
}

export function disconnectClaude(): ConnectorStatus {
  try {
    for (const dir of claudeDirs()) {
      const config = readConfig(dir)
      if (!config.mcpServers?.[KEY]) continue
      const { [KEY]: _removed, ...rest } = config.mcpServers
      config.mcpServers = rest
      writeJsonAtomic(join(dir, FILE), config)
    }
  } catch (err) {
    return { ...connectorStatus(), error: err instanceof Error ? err.message : String(err) }
  }
  return connectorStatus()
}
