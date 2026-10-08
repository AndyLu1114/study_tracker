// Checks a packaged build on the machine it was built on (run by CI):
//   1. the app starts, its window renders, and Settings opens;
//   2. the Claude connector runs under the app's own executable.
// Usage: node scripts/smoke-packaged.mjs <path to the app's executable>

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { _electron as electron } from 'playwright-core'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const exe = process.argv[2]
if (!exe) throw new Error('Usage: node scripts/smoke-packaged.mjs <app executable>')
const resources = process.platform === 'darwin' ? join(dirname(exe), '..', 'Resources') : join(dirname(exe), 'resources')
const connector = join(resources, 'app.asar.unpacked', 'out', 'mcp', 'index.cjs')

function check(ok, what) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) process.exitCode = 1
}

// Never hang CI: report where we got stuck instead.
let stage = 'starting'
setTimeout(() => {
  console.log(`FAIL timed out while: ${stage}`)
  process.exit(1)
}, 180_000).unref()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// 1. The app window.
const userData = mkdtempSync(join(tmpdir(), 'st-smoke-'))
// Skip the macOS "Move to Applications?" prompt; CI builds don't live there.
writeFileSync(join(userData, 'mac-prefs.json'), JSON.stringify({ dontAskMove: true }))
stage = 'launching the app'
const app = await electron.launch({ executablePath: exe, args: [`--user-data-dir=${userData}`] })
const proc = app.process()
const exited = new Promise((resolve) => proc.once('exit', () => resolve(true)))
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(e.message))
await win.waitForSelector('.nav-item', { timeout: 30_000 })
check((await win.locator('.nav-item').count()) >= 6, 'main window shows the navigation')
check(await win.locator('.help-modal').isVisible(), 'help cards open on first launch')
await win.keyboard.press('Escape')
await win.locator('.nav-item').nth(5).click()
await win.waitForSelector('.connector-state', { timeout: 10_000 })
console.log(`     connector status: ${await win.locator('.connector-state').textContent()}`)
check(errors.length === 0, `no page errors ${errors.join('; ')}`)

// Close the window like a user clicking its close button.
stage = 'closing the window'
await win.close()
if (process.platform === 'darwin') {
  // macOS apps keep running in the Dock after their last window closes; quit like Cmd+Q.
  await sleep(1000)
  check(proc.exitCode === null, 'app stays in the Dock after its window closes')
  await app.evaluate(({ app }) => app.quit()).catch(() => {})
}
const quit = await Promise.race([exited, sleep(15_000).then(() => false)])
check(quit, process.platform === 'darwin' ? 'app quits with Cmd+Q' : 'app quits when its window is closed')
if (!quit) proc.kill()

// 2. The Claude connector, started the way Claude desktop starts it.
stage = 'running the Claude connector'
const transport = new StdioClientTransport({
  command: exe,
  args: [connector, '--data-dir', userData],
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stderr: 'inherit'
})
const client = new Client({ name: 'smoke-test', version: '1.0.0' })
await client.connect(transport)
const tools = (await client.listTools()).tools
check(tools.length === 16, `connector offers ${tools.length} actions`)
const res = await client.callTool({ name: 'create_goal', arguments: { title: 'Smoke test goal' } })
check(!res.isError, 'connector can create a goal')
await client.close()
const saved = JSON.parse(readFileSync(join(userData, 'study-data.json'), 'utf8'))
check(saved.goals.some((g) => g.title === 'Smoke test goal'), 'the goal was saved to the data file')

// Don't let leftover handles keep CI waiting.
process.exit(process.exitCode ?? 0)
