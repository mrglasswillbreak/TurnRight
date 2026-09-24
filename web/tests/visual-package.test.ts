import { expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
// @ts-expect-error Packaging is an executable ESM pipeline.
import { packageVisuals } from '../../scripts/visual-package.mjs';
it('keeps textures separate from legacy sector declarations and rejects missing credit or corrupt bytes', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'turnright-visual-test-'));
  const bytes = Buffer.from('verified derivative'),
    sha256 = createHash('sha256').update(bytes).digest('hex');
  const texture = {
    id: 'recipe',
    photoId: 'photo',
    url: `/packages/texture-${sha256.slice(0, 12)}/${sha256}.webp`,
    sha256,
    bytes: bytes.length,
    width: 512,
    height: 512,
    author: 'Photographer',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Photographer · CC BY 4.0',
    modifications: 'Cropped and rectified',
  };
  const catalogue = {
    schemaVersion: 1,
    buildings: [],
    sectors: [],
    bytes: 0,
    textures: [texture],
  };
  try {
    await writeFile(path.join(temp, sha256 + '.webp'), bytes);
    await writeFile(
      path.join(temp, 'catalogue.json'),
      JSON.stringify(catalogue),
    );
    const result = await packageVisuals(temp, async () => {});
    expect(result.manifest.assetUrls).toEqual([]);
    expect(result.textures.assetUrls).toEqual([texture.url]);
    delete (texture as Partial<typeof texture>).attribution;
    await writeFile(
      path.join(temp, 'catalogue.json'),
      JSON.stringify(catalogue),
    );
    await expect(packageVisuals(temp, async () => {})).rejects.toThrow(
      'attribution',
    );
    texture.attribution = 'Credit';
    await writeFile(
      path.join(temp, 'catalogue.json'),
      JSON.stringify(catalogue),
    );
    await writeFile(path.join(temp, sha256 + '.webp'), 'corrupt');
    await expect(packageVisuals(temp, async () => {})).rejects.toThrow(
      'integrity',
    );
  } finally {
    if (
      path.dirname(temp) === path.resolve(tmpdir()) &&
      path.basename(temp).startsWith('turnright-visual-test-')
    )
      await rm(temp, { recursive: true });
  }
});
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
