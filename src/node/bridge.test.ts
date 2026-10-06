import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyConnectorOps, createDataPort, DATA_FILE, startBridgeServer } from './bridge'
import { emptyData, normalizeData, type StoreOp } from '../shared/store'
import type { AppData, Tag } from '../shared/types'

const tag = (id: string, name: string): Tag => ({ id, name, color: 0 })
const stops: (() => void)[] = []
afterEach(() => stops.splice(0).forEach((stop) => stop()))

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'st-'))
}

describe('bridge: app open', () => {
  it('reads and applies through the running app, with a daily backup', async () => {
    const dir = tempDir()
    let data: AppData = { ...emptyData(), tags: [tag('a', 'Math')] }
    let replaced = 0
    stops.push(await startBridgeServer(dir, { getData: () => data, replaceData: (d) => ((data = d), replaced++) }))

    const port = createDataPort(dir)
    expect((await port.read()).tags.map((t) => t.name)).toEqual(['Math'])
    const next = await port.apply([{ type: 'upsertTag', tag: tag('b', 'Physics') }])
    expect(next.tags.map((t) => t.name)).toEqual(['Math', 'Physics'])
    expect(replaced).toBe(1)
    // The data file is the app's business; the connector didn't write it.
    expect(readdirSync(dir)).not.toContain(DATA_FILE)
    expect(readdirSync(join(dir, 'backups'))).toHaveLength(1)
    await port.apply([{ type: 'upsertTag', tag: tag('c', 'Art') }])
    expect(readdirSync(join(dir, 'backups'))).toHaveLength(1) // one per day
  })

  it('rejects a wrong token and disallowed operations', async () => {
    const dir = tempDir()
    let data = emptyData()
    stops.push(await startBridgeServer(dir, { getData: () => data, replaceData: (d) => (data = d) }))
    const info = JSON.parse(readFileSync(join(dir, 'connector.json'), 'utf8'))

    const reply = await new Promise<string>((resolve) => {
      const s = connect(info.endpoint, () => s.write(JSON.stringify({ id: 1, token: 'wrong', method: 'read' }) + '\n'))
      s.setEncoding('utf8')
      s.on('data', (d: string) => (resolve(d), s.end()))
    })
    expect(JSON.parse(reply)).toMatchObject({ ok: false, error: 'Not authorized' })

    const port = createDataPort(dir)
    const bad = { type: 'updateSettings', settings: { language: 'zh-TW' } } as StoreOp
    await expect(port.apply([bad])).rejects.toThrow('not allowed')
    expect(data.settings.language).toBe('en')
  })
})

describe('bridge: app closed', () => {
  it('reads and writes the data file directly', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, DATA_FILE), JSON.stringify({ ...emptyData(), tags: [tag('a', 'Math')] }))
    const port = createDataPort(dir)
    await port.apply([{ type: 'upsertTag', tag: tag('b', 'Physics') }])
    const saved = normalizeData(JSON.parse(readFileSync(join(dir, DATA_FILE), 'utf8')))
    expect(saved.tags.map((t) => t.name)).toEqual(['Math', 'Physics'])
    expect(readdirSync(join(dir, 'backups'))).toHaveLength(1)
  })

  it('ignores a connector.json left behind by a crashed app', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'connector.json'), JSON.stringify({ endpoint: join(dir, 'gone.sock'), token: 'x', pid: 999_999_999 }))
    const port = createDataPort(dir)
    expect((await port.read()).tags).toEqual([])
    await port.apply([{ type: 'upsertTag', tag: tag('a', 'Math') }])
    expect(readdirSync(dir)).toContain(DATA_FILE)
  })

  it('reports an app that is running but not answering', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'connector.json'), JSON.stringify({ endpoint: join(dir, 'gone.sock'), token: 'x', pid: process.pid }))
    await expect(createDataPort(dir).read()).rejects.toThrow('not responding')
  })
})

describe('applyConnectorOps', () => {
  it('drops malformed records instead of saving them', () => {
    const next = applyConnectorOps(emptyData(), [{ type: 'upsertPlan', plan: { id: 'p', date: 'not a date' } as never }])
    expect(next.plans).toEqual([])
  })
})
