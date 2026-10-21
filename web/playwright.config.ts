import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  // Offline journeys use a production service worker; documentation captures
  // require their prepared fixtures. Their dedicated configurations select them.
  grepInvert:
    process.env.TURNRIGHT_DOCS_SCREENSHOTS ||
    process.env.TURNRIGHT_GIS_SCREENSHOTS === '1'
      ? /@offline/
      : /@offline|@documentation/,
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5183',
    viewport: { width: 1440, height: 1000 },
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: [
        '--use-angle=swiftshader',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  webServer: {
    command: 'npm exec -- vite --host 127.0.0.1 --port 5183 --strictPort',
    url: 'http://127.0.0.1:5183',
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: 'https://editor-test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-only-public-key',
    },
  },
});
