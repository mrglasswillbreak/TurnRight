import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import {
  coverageIncludes,
  coverageExcludes,
} from '../scripts/coverage-scope.mjs';
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    environment: 'node',
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/**/*.test.ts'] },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: 'components',
          include: ['tests/components/**/*.test.tsx'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: coverageIncludes,
      exclude: coverageExcludes,
      reporter: ['text-summary', 'json', 'json-summary', 'lcov', 'html'],
      reportsDirectory: 'coverage/unit',
      thresholds: {
        statements: 38,
        lines: 38,
        functions: 32,
        branches: 35,
        'server/local-dispatch.ts': {
          perFile: true,
          statements: 80,
          lines: 80,
          functions: 80,
          branches: 70,
        },
        'server/{diagnostics.mjs,request-envelope.ts}': {
          perFile: true,
          statements: 80,
          lines: 80,
          functions: 80,
          branches: 70,
        },
        'api/health.ts': {
          perFile: true,
          statements: 80,
          lines: 80,
          functions: 80,
          branches: 70,
        },
      },
    },
  },
});
