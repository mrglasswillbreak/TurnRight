import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '../..');
const date = '2026-10-07';
const names = [
  'public-desktop',
  'public-mobile',
  'editor-desktop',
  'gis-data',
  'model-desktop',
  'photo-desktop',
  'gis-review',
  'gis-publish',
  'globe',
  'editor-mobile',
  'gis-analyze',
  'imports',
  'model-portrait',
  'model-landscape',
  'photo-mobile',
  'offline',
  'legend-collapsed',
  'activity-expanded',
];
const source = execFileSync(
  'git',
  [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '--',
    'web/src',
    'web/vite.config.ts',
    'web/index.html',
    'web/public/icon*',
    'web/public/favicon.svg',
    'web/public/apple-touch-icon.png',
  ],
  { cwd: root, encoding: 'utf8' },
)
  .trim()
  .split(/\r?\n/)
  .sort();
const digest = createHash('sha256');
for (const file of source)
  digest
    .update(file)
    .update('\0')
    .update(await readFile(resolve(root, file)));
const browser = await chromium.launch({ headless: true });
const version = browser.version();
await browser.close();
const captures = [];
for (const name of names) {
  const file = `redesign-${name}-${date}.png`;
  const data = await readFile(resolve(root, 'docs/assets/screenshots', file));
  const { width, height } = await sharp(data).metadata();
  captures.push({
    file,
    width,
    height,
    theme: name === 'globe' ? 'dark' : 'light',
    sha256: createHash('sha256').update(data).digest('hex'),
    fixture: name.startsWith('photo-')
      ? 'photo-harness: commons:112540966 (Abiolakintrunde, CC BY-SA 4.0)'
      : name === 'imports'
        ? 'campus-imports.spec.ts: synthetic campus and inspected layers'
        : name.startsWith('gis-')
          ? 'gis-workflow.spec.ts: lasu-4895a363b403 + isolated team responses'
          : 'editor.spec.ts: lasu-4895a363b403 + isolated owner responses',
    build:
      name.startsWith('photo-') || name === 'imports'
        ? 'Vite development harness'
        : 'Configured production preview',
  });
}
await writeFile(
  resolve(root, `docs/assets/screenshots/redesign-${date}.json`),
  JSON.stringify(
    {
      capturedDate: date,
      recordedAt: new Date().toISOString(),
      baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
      sourceTreeSha256: digest.digest('hex'),
      revision: 'Capture source is identified by baseCommit and sourceTreeSha256; not a deployment receipt',
      browser: `Chromium ${version}`,
      deviceScaleFactor: 1,
      unalteredBrowserCaptures: true,
      captures,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Recorded ${captures.length} captures and source/image hashes.`);
