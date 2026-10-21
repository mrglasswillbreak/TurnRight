import { test as base, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { coverageSnapshot } from '../../../scripts/coverage-scope.mjs';

export * from '@playwright/test';

/** Opt-in collection from real Chromium journeys; no instrumentation in shipped code. */
export const test = base.extend<{ applicationCoverage: void }>({
  applicationCoverage: [
    async ({ page, browser, browserName }, runTest, testInfo) => {
      const enabled =
        process.env.TURNRIGHT_COVERAGE === '1' && browserName === 'chromium';
      if (!enabled) return runTest();
      const snapshot = await coverageSnapshot();
      const entries: Awaited<ReturnType<Page['coverage']['stopJSCoverage']>> =
        [];
      const started = new Map<Page, Promise<void>>();
      const collected = new Set<Page>();
      const collect = async (target: Page) => {
        if (collected.has(target)) return;
        collected.add(target);
        await started.get(target);
        entries.push(...(await target.coverage.stopJSCoverage()));
      };
      const start = (target: Page) => {
        if (!started.has(target)) {
          started.set(
            target,
            target.coverage.startJSCoverage({ resetOnNavigation: false }),
          );
          const close = target.close.bind(target);
          target.close = async (options) => {
            await collect(target);
            await close(options);
          };
        }
        return started.get(target)!;
      };
      const attach = (context: BrowserContext) => {
        context.on('page', (target) => {
          void start(target);
        });
        const newPage = context.newPage.bind(context);
        context.newPage = async () => {
          const target = await newPage();
          await start(target);
          return target;
        };
        const close = context.close.bind(context);
        context.close = async (options) => {
          await Promise.all(context.pages().map(collect));
          await close(options);
        };
      };
      attach(page.context());
      await start(page);
      // Some journeys create isolated signed-out or touch contexts themselves.
      // Collect these before they close, as well as the default fixture page.
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (options) => {
        const context = await newContext(options);
        attach(context);
        return context;
      };
      try {
        await runTest();
        await Promise.all([...started.keys()].map(collect));
      } finally {
        browser.newContext = newContext;
      }
      const authoredEntries = entries.filter((entry) => {
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
            testId: testInfo.testId,
            title: testInfo.title,
            status: testInfo.status,
            entries: authoredEntries,
          }),
        ),
      );
    },
    { auto: true },
  ],
});
