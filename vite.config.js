import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: './',
  publicDir: 'public',
  server: {
    port: 3000,
    open: true,
    host: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'public/index.html'),
        main: resolve(__dirname, 'public/main/index.html'),
        mcp: resolve(__dirname, 'public/mcp/index.html'),
        options: resolve(__dirname, 'public/options/index.html')
      }
    }
  },
  resolve: {
    alias: {
      '@': new URL('./js', import.meta.url).pathname,
      '@types': new URL('./ts', import.meta.url).pathname
    }
  }
}) 