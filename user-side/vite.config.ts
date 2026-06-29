import { defineConfig } from 'vite'

export default defineConfig({
  base: '/user/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react-icons')) return 'icons'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('react-dom') || id.includes('react')) return 'react-vendor'
          return 'vendor'
        },
      },
    },
  },
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
