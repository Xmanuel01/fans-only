import { defineConfig } from 'vite'

export default defineConfig({
  base: '/user/',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/creator': {
        target: 'http://127.0.0.1:5174',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
