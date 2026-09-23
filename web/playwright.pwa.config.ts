import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  grep: /prepared offline survey|prepared public map|prepared building editor|prepared offline driving|prepared offline enrichment|prepared offline arrival/,
  timeout: 90000,
  use: { ...base.use, baseURL: 'http://127.0.0.1:5184' },
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js build --outDir work/pwa-preview && node node_modules/vite/bin/vite.js preview --outDir work/pwa-preview --host 127.0.0.1 --port 5184 --strictPort',
    url: 'http://127.0.0.1:5184',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      VITE_SUPABASE_URL: 'https://editor-test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-only-public-key',
    },
  },
});
