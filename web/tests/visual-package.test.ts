import { expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error Packaging is an executable ESM pipeline.
import { packageVisuals } from '../../scripts/visual-package.mjs';
it('packages only verified catalogue sectors and remains optional for old packages', async () => {
  const root = fileURLToPath(new URL('../../data/visuals', import.meta.url)),
    urls: string[] = [];
  const result = await packageVisuals(root, async (url: string) => {
    urls.push(url);
  });
  expect(urls).toEqual(result.manifest.assetUrls);
  expect(result.catalogue.bytes).toBe(result.manifest.bytes);
  const temp = await mkdtemp(path.join(tmpdir(), 'turnright-visual-test-'));
  try {
    expect(await packageVisuals(temp, async () => {})).toBeNull();
    const catalogue = JSON.parse(
      await readFile(path.join(root, 'catalogue.json'), 'utf8'),
    );
    await writeFile(
      path.join(temp, 'catalogue.json'),
      JSON.stringify(catalogue),
    );
    await writeFile(
      path.join(temp, path.basename(catalogue.sectors[0].url)),
      'corrupt',
    );
    await expect(packageVisuals(temp, async () => {})).rejects.toThrow(
      'verification',
    );
    catalogue.sectors[0].url = '/packages/visual-123/../secret.json';
    await writeFile(
      path.join(temp, 'catalogue.json'),
      JSON.stringify(catalogue),
    );
    await expect(packageVisuals(temp, async () => {})).rejects.toThrow('path');
  } finally {
    // mkdtemp returns a new test-owned directory under the system temporary root.
    if (
      path.dirname(temp) !== path.resolve(tmpdir()) ||
      !path.basename(temp).startsWith('turnright-visual-test-')
    )
      console.error('Skipped cleanup of an unexpected test directory');
    else await rm(temp, { recursive: true });
  }
});
