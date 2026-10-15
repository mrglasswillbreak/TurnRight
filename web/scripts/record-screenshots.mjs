import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '../..');
const date = process.env.TURNRIGHT_DOCS_DATE;
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
  throw Error('Set TURNRIGHT_DOCS_DATE (YYYY-MM-DD) to the capture date.');
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
const source = [
  ...new Set(
    execFileSync(
      'git',
      [
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '-z',
        '--',
        'web/src',
        'web/components',
        'web/hooks',
        'web/lib',
        'web/api',
        'web/server',
        'web/vite.config.ts',
        'web/index.html',
        'web/public/icon*',
        'web/public/favicon.svg',
        'web/public/apple-touch-icon.png',
      ],
      { cwd: root, encoding: 'utf8' },
    )
      .split('\0')
      .filter((file) => file && existsSync(resolve(root, file))),
  ),
].sort();
const digest = createHash('sha256');
for (const file of source)
  digest
    .update(file)
    .update('\0')
    .update(await readFile(resolve(root, file)));
const fixtureDirectory = resolve(root, 'web/work/docs-fixture');
const manifestBytes = await readFile(
  resolve(fixtureDirectory, 'public/packages/latest.json'),
);
const manifest = JSON.parse(manifestBytes);
const fixtureReceipt = JSON.parse(
  await readFile(resolve(fixtureDirectory, 'receipt.json'), 'utf8'),
);
const browser = await chromium.launch({ headless: true });
const version = browser.version();
await browser.close();
const captures = [];
for (const name of names) {
  const file = `tour-${name}-${date}.png`;
  const bytes = await readFile(resolve(root, 'docs/assets/screenshots', file));
  const { width, height } = await sharp(bytes).metadata();
  captures.push({
    file,
    width,
    height,
    theme: name === 'globe' ? 'dark' : 'light',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    fixture: name.startsWith('photo-')
      ? 'photo-harness: commons:112540966 (Abiolakintrunde, CC BY-SA 4.0)'
      : name === 'imports'
        ? 'campus-imports.spec.ts: synthetic campus and inspected layers'
        : `${manifest.version} + isolated ${name.startsWith('gis-') ? 'team' : 'owner'} API responses`,
    build:
      name.startsWith('photo-') || name === 'imports'
        ? 'Vite development harness'
        : 'Configured production preview',
  });
}
await writeFile(
  resolve(root, `docs/assets/screenshots/tour-${date}.json`),
  JSON.stringify(
    {
      capturedDate: date,
      recordedAt: new Date().toISOString(),
      baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
      sourceTreeSha256: digest.digest('hex'),
      sourcePaths: source,
      revision:
        'Working-tree capture; source digest covers the listed runtime application files. Not a deployment receipt or tooling/dependency digest.',
      browser: `Chromium ${version}`,
      node: process.version,
      deviceScaleFactor: 1,
      unalteredBrowserCaptures: true,
      publicFixture: fixtureReceipt,
      campusManifestSha256: createHash('sha256')
        .update(manifestBytes)
        .digest('hex'),
      captures,
    },
    null,
    2,
  ) + '\n',
  { flag: 'wx' },
);
console.log(
  `Recorded ${captures.length} captures and source/image hashes without overwriting historical evidence.`,
);
