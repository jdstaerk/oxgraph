import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiTarget = process.env.OXGRAPH_API_URL ?? 'http://localhost:8888'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    hmr: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
})
