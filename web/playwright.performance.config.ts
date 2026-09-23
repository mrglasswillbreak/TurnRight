import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/performance',
  outputDir: './work/performance-test-results',
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:5195',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js preview --config vite.performance.config.ts --host 127.0.0.1 --port 5195 --strictPort',
    url: 'http://127.0.0.1:5195/tests/performance/index.html',
    reuseExistingServer: true,
  },
});
