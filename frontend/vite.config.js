import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // The repository-level index.html is the single executable UI entry point.
  root: path.resolve(__dirname, '..'),
  publicDir: false,
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('error', (_error, _request, response) => {
            if (!response || response.headersSent) return
            response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
            response.end(JSON.stringify({ error: '백엔드 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.' }))
          })
        }
      }
    }
  }
})
