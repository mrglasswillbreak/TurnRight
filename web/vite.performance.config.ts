import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath, URL } from 'node:url';
// Compiles the real workspace in production mode, outside the shipped application.
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    target: 'es2022',
    outDir: 'work/performance-dist',
    rollupOptions: { input: 'tests/performance/index.html' },
  },
});
