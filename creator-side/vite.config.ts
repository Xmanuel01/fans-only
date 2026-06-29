import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const normalizeBase = (value: string | undefined) => {
  const raw = value?.trim() || '/creator';
  let base = raw.startsWith('/') ? raw : `/${raw}`;
  if (base.length > 1 && base.endsWith('/')) {
    base = base.slice(0, -1);
  }
  return base === '/' ? '/' : `${base}/`;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = normalizeBase(env.VITE_CREATOR_BASE_PATH);
  return {
    plugins: [react()],
    base,
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('react-router')) return 'router';
            if (id.includes('react-dom') || id.includes('react')) return 'react-vendor';
            return 'vendor';
          },
        },
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5174,
      strictPort: true,
    },
  };
});
