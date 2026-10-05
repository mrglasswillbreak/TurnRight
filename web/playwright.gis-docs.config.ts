import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  grep: /GIS documentation gallery/,
  timeout: 180000,
  use: {
    ...base.use,
    baseURL: 'http://127.0.0.1:5199',
    serviceWorkers: 'block',
  },
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js build --outDir work/gis-docs-preview && node node_modules/vite/bin/vite.js preview --outDir work/gis-docs-preview --host 127.0.0.1 --port 5199 --strictPort',
    url: 'http://127.0.0.1:5199',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      VITE_SUPABASE_URL: 'https://editor-test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-only-public-key',
    },
  },
});
