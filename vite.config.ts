import { defineConfig } from 'vite';
export default defineConfig({
  root: import.meta.dirname,
  build: { target: 'safari16.4', outDir: 'dist', emptyOutDir: true },
  server: { port: 5174, proxy: { "/api": "http://127.0.0.1:8000" } },
});
