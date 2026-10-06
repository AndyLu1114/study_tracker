// The Study Tracker connector for the Claude desktop app (an MCP server over
// stdio). Claude desktop starts it with `--data-dir <Study Tracker data folder>`.
// stdout carries the protocol, so log only to stderr.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createDataPort } from '../node/bridge'
import { SERVER_INSTRUCTIONS, TOOLS, ToolError } from '../shared/connector'

function dataDirFromArgs(argv: string[]): string {
  const i = argv.indexOf('--data-dir')
  const dir = i !== -1 ? argv[i + 1] : process.env.STUDY_TRACKER_DATA_DIR
  if (!dir) {
    console.error('study-tracker connector: missing --data-dir')
    process.exit(2)
  }
  return dir
}

async function main(): Promise<void> {
  const port = createDataPort(dataDirFromArgs(process.argv))
  const server = new McpServer({ name: 'study-tracker', version: '1.0.0' }, { instructions: SERVER_INSTRUCTIONS })
  // Run one action at a time: two parallel edits of the same goal would
  // otherwise both start from the old version and one change would be lost.
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn)
    queue = run.catch(() => undefined)
    return run
  }

  for (const spec of TOOLS) {
    server.registerTool(
      spec.name,
      { title: spec.title, description: spec.description, inputSchema: spec.input, annotations: { title: spec.title, ...spec.annotations } },
      async (input: unknown) => {
        try {
          const result = await serial(() => spec.run(input as never, { port, now: Date.now }))
          return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
        } catch (err) {
          const message = err instanceof ToolError || err instanceof Error ? err.message : String(err)
          if (!(err instanceof ToolError)) console.error('study-tracker connector:', err)
          return { isError: true, content: [{ type: 'text' as const, text: message }] }
        }
      }
    )
  }

  await server.connect(new StdioServerTransport())
}

main().catch((err) => {
  console.error('study-tracker connector failed:', err)
  process.exit(1)
})
