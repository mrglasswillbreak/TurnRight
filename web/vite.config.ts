import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      registerType: 'prompt',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}', 'world/*.geojson'],
        globIgnores: ['packages/**', 'glyphs/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'TurnRight · LASU Campus',
        short_name: 'TurnRight',
        description:
          'Find your way around LASU Ojo. Walking directions, even offline.',
        theme_color: '#1764ed',
        background_color: '#f6f8fc',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  optimizeDeps: { exclude: ['maplibre-gl'] },
  worker: { format: 'es' },
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/maplibre-gl')) return 'map';
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id))
            return 'react';
        },
      },
    },
  },
  server: { host: '127.0.0.1' },
});
