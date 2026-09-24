import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  grep: /documentation current gallery/,
  timeout: 300000,
  use: {
    ...base.use,
    actionTimeout: 15000,
    baseURL: 'http://127.0.0.1:5198',
    serviceWorkers: 'block',
  },
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js build --outDir work/docs-preview && node node_modules/vite/bin/vite.js preview --outDir work/docs-preview --host 127.0.0.1 --port 5198 --strictPort',
    url: 'http://127.0.0.1:5198',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      VITE_SUPABASE_URL: 'https://editor-test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-only-public-key',
    },
  },
});
