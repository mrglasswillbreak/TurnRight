import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: [
        'src/**/*.{ts,tsx,mjs}',
        'components/**/*.{ts,tsx}',
        'server/**/*.{ts,mjs}',
        'api/**/*.ts',
      ],
      exclude: ['**/*.d.ts', '**/*.d.mts'],
      reporter: ['text-summary', 'json-summary', 'lcov', 'html'],
      reportsDirectory: 'coverage',
      thresholds: {
        statements: 38,
        lines: 38,
        functions: 32,
        branches: 35,
        'server/local-dispatch.ts': {
          statements: 80,
          lines: 80,
          functions: 80,
          branches: 70,
        },
        'server/{diagnostics.mjs,request-envelope.ts}': {
          statements: 80,
          lines: 80,
          functions: 80,
          branches: 70,
        },
        'api/health.ts': {
          statements: 80,
          lines: 80,
          functions: 80,
          branches: 70,
        },
      },
    },
  },
});
