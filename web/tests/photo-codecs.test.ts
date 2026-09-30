import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import hashes from '../src/photo-codec-manifest.json';
it('pins byte-identical local encoders on every checkout platform', () => {
  expect(Object.keys(hashes)).toHaveLength(8);
  for (const [name, digest] of Object.entries(hashes)) {
    const file = readFileSync(new URL(`../public/photo-codecs/e8d35e0/${name}`, import.meta.url));
    expect(createHash('sha256').update(file).digest('hex'), name).toBe(digest);
  }
});
