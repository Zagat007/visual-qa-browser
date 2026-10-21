import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(import.meta.dirname),
  plugins: [react()],
  publicDir: false,
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:4210', '/reports': 'http://127.0.0.1:4210' },
  },
  build: {
    // scripts/build-frontend.mjs writes the generated bundle sequentially.
    outDir: path.resolve(import.meta.dirname, '.vite-build'),
    write: false,
    emptyOutDir: false,
  },
});
