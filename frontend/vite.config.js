import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Where the FastAPI backend listens. Overridable because another project's
  // server on :8000 would otherwise silently receive every /api request.
  const apiTarget = env.API_PROXY_TARGET || 'http://127.0.0.1:8000'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Proxy /api to FastAPI so the browser sees one origin in development.
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
