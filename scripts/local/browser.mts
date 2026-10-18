import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import playwright from '../../web/node_modules/playwright/index.js';
import { runtime, origin } from './runtime.mjs';

const accounts: Array<{ role: string; email: string; password: string }> =
  JSON.parse(await readFile(path.join(runtime, 'accounts.json'), 'utf8'));
const account = accounts.find((item) => item.role === 'editor')!;
const browser = await playwright.chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) =>
    console.error('Local browser:', error.message),
  );
  page.on('response', (response) => {
    if (response.status() >= 400)
      console.error(
        'Local browser HTTP',
        response.status(),
        new URL(response.url()).pathname,
      );
  });
  await page.goto(origin + '/admin');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page
    .getByRole('button', { name: 'Sign in locally', exact: true })
    .click();
  await page
    .locator('.workspace-frame')
    .waitFor({ state: 'visible', timeout: 60_000 });
  await page.reload();
  await page
    .locator('.workspace-frame')
    .waitFor({ state: 'visible', timeout: 60_000 });
  assert.equal(
    await page
      .getByRole('button', { name: 'Sign in locally', exact: true })
      .count(),
    0,
  );
  for (const file of [
    '/.local-runtime/accounts.json',
    '/@fs/' + path.join(runtime, 'accounts.json').replaceAll('\\', '/'),
  ]) {
    const response = await page.request.get(origin + file);
    const text = await response.text();
    assert(
      !text.includes(account.password),
      'Private local credentials must never be served by Vite',
    );
  }
  console.log(
    'Browser sign-in, authenticated editor readiness, session reload and private-file isolation passed.',
  );
} finally {
  await browser.close();
}
