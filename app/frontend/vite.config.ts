import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Some deps (react-draggable, used by react-grid-layout) reference
// `process.env.*` at runtime. The browser has no `process`, so without these
// defines a drag/resize throws "process is not defined" and silently fails.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
    'process.env.DRAGGABLE_DEBUG': 'false',
  },
  server: {
    port: 5173,
    // Fail instead of silently drifting to 5174/5175 if 5173 is taken, so the
    // app is always reachable at the same URL.
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8765',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
  },
}))
