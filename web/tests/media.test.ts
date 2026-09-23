import { afterAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { photoDerivative } from '../server/photo-processing';
import { publicCampus } from '../../scripts/public-campus.mjs';
import { packagePhotos } from '../../scripts/photo-package.mjs';
import { campusFixture } from './fixture';
const temporary: string[] = [];
afterAll(async () => {
  for (const dir of temporary) await rm(dir, { recursive: true, force: true });
});
describe('private building photograph processing', () => {
  it('orients, bounds and strips original metadata without publishing originals', async () => {
    const original = await sharp({
      create: { width: 2200, height: 1200, channels: 3, background: '#abcdef' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExif({
        IFD0: {
          Artist: 'Private reviewer',
          Copyright: 'Private upload metadata',
        },
      })
      .toBuffer();
    const result = await photoDerivative(original),
      metadata = await sharp(result.bytes).metadata();
    expect(result.height).toBe(1600);
    expect(result.width).toBeLessThan(1600);
    expect(result.bytes.length).toBeLessThanOrEqual(250 * 1024);
    expect(metadata.format).toBe('webp');
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    const duplicate = await photoDerivative(original);
    expect(duplicate.sha256).toBe(result.sha256);
  });
  it('rejects SVG, truncated and oversized uploads', async () => {
    for (const bytes of [
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      Buffer.from([255, 216, 255, 0]),
      Buffer.alloc(10 * 1024 * 1024 + 1),
    ])
      await expect(photoDerivative(bytes)).rejects.toThrow();
  });
  it('whitelists public media and guides including nested evidence', () => {
    const result = publicCampus({
      photos: [
        {
          id: 'p',
          author: 'Public credit',
          originalPath: 'secret',
          reviewerId: 'private',
        },
      ],
      arrival: {
        description: 'Use the signed entrance',
        original: 'secret',
        reviewer: 'private',
        evidence: {
          description: [
            {
              sourceId: 'Owner observation',
              recordId: 'arrival:p',
              checkedAt: '2026-09-23',
              reviewer: 'private',
              rawSamples: [1],
            },
          ],
        },
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /secret|private|rawSamples|original/,
    );
    expect(result.photos[0].author).toBe('Public credit');
  });
  it('packages every approved distinct asset once and fails on missing or corrupted required bytes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'turnright-photos-'));
    temporary.push(root);
    await mkdir(path.join(root, 'data/photos'), { recursive: true });
    const optimized = await photoDerivative(
      await sharp({
        create: { width: 30, height: 20, channels: 3, background: '#abcdef' },
      })
        .png()
        .toBuffer(),
    );
    const p = {
      id: 'p',
      buildingId: 'building',
      url: `/packages/photos/${optimized.sha256}.webp`,
      sha256: optimized.sha256,
      bytes: optimized.bytes.length,
      author: 'Author',
      license: 'CC0 1.0',
      attribution: 'Author',
      sourceUrl: 'https://example.org/source',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    };
    const data = campusFixture();
    data.map.features = [
      { ...data.boundary, properties: { id: 'building', kind: 'building' } },
    ];
    await writeFile(
      path.join(root, 'data/photos/catalogue.json'),
      JSON.stringify(
        Array.from({ length: 25 }, (_, i) => ({ ...p, id: `p${i}` })),
      ),
    );
    await writeFile(
      path.join(root, `data/photos/${p.sha256}.webp`),
      optimized.bytes,
    );
    const emitted: string[] = [];
    const manifest = await packagePhotos(data, root, async (url: string) => {
      emitted.push(url);
    });
    expect(data.photos).toHaveLength(25);
    expect(emitted).toEqual([p.url]);
    expect(manifest.bytes).toBe(p.bytes);
    await writeFile(path.join(root, `data/photos/${p.sha256}.webp`), 'corrupt');
    await expect(packagePhotos(data, root, async () => {})).rejects.toThrow(
      /failed integrity/,
    );
    const removed = { ...data, photos: [], photoOverrides: ['building'] };
    expect(await packagePhotos(removed, root, async () => {})).toBeUndefined();
    const merged = {
      ...removed,
      photoOverrides: ['former'],
      buildingIdAliases: { former: 'building' },
    };
    expect(await packagePhotos(merged, root, async () => {})).toBeUndefined();
  });
});
