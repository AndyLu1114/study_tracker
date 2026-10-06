// Bundles the Claude connector into one self-contained file. It runs under the
// app's own executable (ELECTRON_RUN_AS_NODE=1), so it cannot rely on node_modules.
import { build } from 'esbuild'

await build({
  entryPoints: ['src/mcp/index.ts'],
  outfile: 'out/mcp/index.cjs',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  logLevel: 'warning'
})
