import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** Reads JSON, returning null if the file is missing or unreadable. */
export function readJson(path: string): unknown {
  for (const candidate of [path, `${path}.bak`]) {
    if (!existsSync(candidate)) continue
    try {
      return JSON.parse(readFileSync(candidate, 'utf8'))
    } catch {
      // try the backup next
    }
  }
  return null
}

/** Writes via a temp file + rename so a crash never leaves a half-written file. */
export function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  if (existsSync(path)) {
    try {
      renameSync(path, `${path}.bak`)
    } catch {
      // keep going; the rename below still replaces the file
    }
  }
  renameSync(tmp, path)
}

/** Coalesces bursts of writes into one, and lets us flush on quit. */
export function debouncedWriter(path: string, delayMs = 300): { write(v: unknown): void; flush(): void } {
  let pending: { v: unknown } | null = null
  let handle: NodeJS.Timeout | null = null
  const flush = (): void => {
    if (handle) clearTimeout(handle)
    handle = null
    if (pending) {
      writeJsonAtomic(path, pending.v)
      pending = null
    }
  }
  return {
    write(v) {
      pending = { v }
      if (handle) clearTimeout(handle)
      handle = setTimeout(flush, delayMs)
    },
    flush
  }
}
