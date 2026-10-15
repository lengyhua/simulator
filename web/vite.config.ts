import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Single source of truth for build/runtime base: the app is embedded under the
// simulator platform at /calc-xrd/ in production, so dev and prod must agree.
export default defineConfig({
  base: '/calc-xrd/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // Split heavy vendors into stable cacheable chunks (recharts alone is
        // ~350 kB); the module chunk stays small and diff-friendly.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          recharts: ['recharts'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Run test files sequentially: parallel workers race on vite-node's SSR
    // module cache file (EPERN on Windows) for the large generated tables.
    fileParallelism: false,
  },
});
