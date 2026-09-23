import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { validPhoto } from '../src/arrival';
import type { CampusPhoto } from '../src/types';
import {
  requirePhotographicSource,
  syntheticPhotoEvidence,
} from '../../scripts/photo-source.mjs';
const root = path.resolve(import.meta.dirname, '../../data/photos');
const hash = (bytes: Buffer | string) =>
  createHash('sha256').update(bytes).digest('hex');
describe('reviewed campus photograph collection', () => {
  it('excludes synthetic source images and requires a current original metadata audit', async () => {
    const audit = JSON.parse(
      await readFile(
        path.join(root, 'research/source-metadata-audit.json'),
        'utf8',
      ),
    );
    const catalogue: CampusPhoto[] = JSON.parse(
      await readFile(path.join(root, 'catalogue.json'), 'utf8'),
    );
    for (const receipt of audit.receipts)
      expect(hash(receipt.body)).toBe(receipt.sha256);
    for (const photo of catalogue) {
      const source = audit.pages.find(
        (p) => `commons:${p.pageid}` === photo.id,
      );
      expect(source).toBeDefined();
      expect(() => requirePhotographicSource(source, source)).not.toThrow();
    }
    const synthetic = audit.pages.find((p) => p.pageid === 199191750);
    expect(syntheticPhotoEvidence(synthetic.imageinfo[0])).toBe(true);
    expect(() => requirePhotographicSource(synthetic, synthetic)).toThrow(
      /Synthetic/,
    );
    expect(catalogue.some((p) => p.id === 'commons:199191750')).toBe(false);
    expect(() => requirePhotographicSource(synthetic, undefined)).toThrow(
      /missing or stale/,
    );
    const altered = { imageinfo: [{ sha1: 'changed', commonmetadata: [] }] };
    expect(() => requirePhotographicSource(synthetic, altered)).toThrow(
      /missing or stale/,
    );
    expect(
      syntheticPhotoEvidence({
        commonmetadata: [
          {
            name: 'DigitalSourceType',
            value: 'compositeWithTrainedAlgorithmicMedia',
          },
        ],
      }),
    ).toBe(true);
  });
  it('accounts for every selected snapshot candidate and all published buildings', async () => {
    const commons = JSON.parse(
      await readFile(
        path.join(root, 'research/commons-inventory.json'),
        'utf8',
      ),
    );
    const publication = JSON.parse(
      await readFile(
        path.join(root, 'research/publication-inventory.json'),
        'utf8',
      ),
    );
    const catalogue: CampusPhoto[] = JSON.parse(
      await readFile(path.join(root, 'catalogue.json'), 'utf8'),
    );
    const candidates = [
      ...commons.candidates,
      ...commons.excludedFormats,
      ...publication.candidates,
    ];
    expect(commons.buildings).toHaveLength(420);
    expect(publication.buildings).toHaveLength(420);
    expect(
      candidates.every(
        (c) =>
          [
            'included',
            'duplicate',
            'rejected',
            'awaiting evidence/permission',
          ].includes(c.status) && c.reason,
      ),
    ).toBe(true);
    expect(new Set(commons.candidates.map((c) => c.id)).size).toBe(
      commons.candidates.length,
    );
    expect(
      commons.candidates
        .filter((c) => c.status === 'included')
        .map((c) => c.id)
        .sort(),
    ).toEqual(catalogue.map((p) => p.id).sort());
    expect(publication.candidates.some((c) => c.status === 'included')).toBe(
      false,
    );
    expect(commons.after.photographedBuildings).toBe(
      new Set(catalogue.map((p) => p.buildingId)).size,
    );
    for (const p of catalogue)
      expect(
        commons.buildings.some(
          (b) => b.id === p.buildingId && b.photoIds.includes(p.id),
        ),
      ).toBe(true);
    const snapshots = JSON.parse(
      gunzipSync(
        await readFile(path.join(root, 'research/commons-responses.json.gz')),
      ).toString(),
    );
    for (const receipt of commons.receipts)
      expect(hash(snapshots[receipt.file])).toBe(receipt.sha256);
  });
  it('ships distinct licensed, metadata-free, bounded assets with matching hashes', async () => {
    const catalogue: CampusPhoto[] = JSON.parse(
      await readFile(path.join(root, 'catalogue.json'), 'utf8'),
    );
    expect(new Set(catalogue.map((p) => p.sha256)).size).toBe(catalogue.length);
    for (const photo of catalogue) {
      expect(validPhoto(photo)).toBe(true);
      const bytes = await readFile(path.join(root, `${photo.sha256}.webp`));
      expect(hash(bytes)).toBe(photo.sha256);
      expect(bytes.length).toBe(photo.bytes);
      const info = await sharp(bytes).metadata();
      expect([info.exif, info.xmp, info.icc]).toEqual([
        undefined,
        undefined,
        undefined,
      ]);
      expect(info.format).toBe('webp');
      expect([info.width, info.height]).toEqual([photo.width, photo.height]);
    }
  });
});
