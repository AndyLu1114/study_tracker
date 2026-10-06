import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { writeJsonAtomic } from './persistence'

const KEEP = 10

/**
 * Saves a copy of `data` into `<dataDir>/backups` unless one was already made
 * today. Keeps the newest ten. Used before the Claude connector changes anything.
 */
export function dailyBackup(dataDir: string, data: unknown, now = new Date()): string | null {
  const dir = join(dataDir, 'backups')
  mkdirSync(dir, { recursive: true })
  const pad = (n: number): string => String(n).padStart(2, '0')
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const existing = readdirSync(dir).filter((f) => f.startsWith('study-data-') && f.endsWith('.json'))
  if (existing.some((f) => f.startsWith(`study-data-${day}`))) return null

  const file = join(dir, `study-data-${day}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`)
  writeJsonAtomic(file, data)
  // Names sort by date, so the oldest come first.
  const all = [...existing, file.slice(dir.length + 1)].sort()
  for (const old of all.slice(0, Math.max(0, all.length - KEEP))) rmSync(join(dir, old), { force: true })
  return file
}
