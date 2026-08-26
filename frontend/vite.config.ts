import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { defineConfig } from 'vite'

const require = createRequire(import.meta.url)
const theme = JSON.parse(readFileSync(require.resolve('@alemonjs/react-ui/theme.json'), 'utf8'))

export default defineConfig({
  base: './',
  server: {
    proxy: {
      '/app/api': {
        target: 'http://127.0.0.1:17188',
        changeOrigin: true
      },
      '/api': {
        target: 'http://127.0.0.1:17188',
        changeOrigin: true,
        rewrite: path => `/app${path}`
      }
    }
  },
  plugins: [react()],
  define: {
    'process.env.ALEMONJS_CSS_VARIABLES': JSON.stringify(theme)
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'assets/index.js', assetFileNames: 'assets/[name].[ext]' } }
  }
})
