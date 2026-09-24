import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath, URL } from 'node:url';
// Compiles the real workspace in production mode, outside the shipped application.
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
      'https://editor-test.supabase.co',
    ),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(
      'test-only-public-key',
    ),
  },
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    target: 'es2022',
    outDir: 'work/performance-dist',
    rollupOptions: {
      input: ['tests/performance/index.html', 'tests/models/index.html'],
    },
  },
});
