// Runs the renderer in a plain browser with an in-page backend (localStorage).
// Handy for UI work and screenshots without launching Electron.
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  server: { port: 5199 }
})
