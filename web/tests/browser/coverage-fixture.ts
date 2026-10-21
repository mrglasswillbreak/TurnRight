import { test as base } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { coverageSnapshot } from '../../../scripts/coverage-scope.mjs';

export * from '@playwright/test';

/** Opt-in collection from real Chromium journeys; no instrumentation in shipped code. */
export const test = base.extend<{ applicationCoverage: void }>({
  applicationCoverage: [
    async ({ page, browserName }, use, testInfo) => {
      const enabled =
        process.env.TURNRIGHT_COVERAGE === '1' && browserName === 'chromium';
      if (enabled)
        await page.coverage.startJSCoverage({ resetOnNavigation: false });
      const snapshot = enabled ? await coverageSnapshot() : undefined;
      await use();
      if (!enabled || page.isClosed()) return;
      const entries = (await page.coverage.stopJSCoverage()).filter((entry) => {
        try {
          return /^\/(src|components|lib|hooks)\/.*\.(?:[cm]?[jt]sx?)(?:\?|$)/.test(
            new URL(entry.url).pathname,
          );
        } catch {
          return false;
        }
      });
      const directory = path.resolve('coverage/browser-raw');
      await mkdir(directory, { recursive: true });
      const id = createHash('sha256')
        .update(`${testInfo.testId}:${testInfo.retry}:${testInfo.project.name}`)
        .digest('hex');
      await writeFile(
        path.join(directory, `${id}.json.gz`),
        gzipSync(
          JSON.stringify({
            snapshot,
            title: testInfo.title,
            status: testInfo.status,
            entries,
          }),
        ),
      );
    },
    { auto: true },
  ],
});
