import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  catalogueRevision,
  preserveCampusCatalogue,
} from '../scripts/published-campus-catalogue.mjs';
import type { CampusCatalogue } from '../src/campus-context';
import type { CampusPackage } from '../src/types';

const origin = 'https://maps.example';
const content = new Map<string, Buffer>();
const manifests = new Map<string, CampusPackage>();
const catalogue: CampusCatalogue = {
  schemaVersion: 1,
  campuses: ['lasu', 'north'].map((id) => ({
    id,
    slug: id,
    name: id,
    bounds: [
      [3.19, 6.45],
      [3.22, 6.49],
    ],
    manifestUrl: `/packages/${id}-abc123/manifest.json`,
  })),
};
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(
    path.join(tmpdir(), 'turnright-campus-publication-'),
  );
  for (const c of catalogue.campuses) {
    const bytes = Buffer.from(`${c.id} immutable campus data`),
      url = `/packages/${c.id}-abc123/campus.json`;
    content.set(url, bytes);
    manifests.set(c.manifestUrl!, {
      schemaVersion: 1,
      version: `${c.id}-abc123`,
      createdAt: '2026-09-26',
      summary: 'Reviewed',
      dataUrl: url,
      bytes: bytes.length,
      assets: [
        {
          url,
          bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
      ],
      ...(c.id === 'lasu'
        ? {}
        : { campus: { id: c.id, slug: c.slug, name: c.name } }),
    });
  }
});
afterEach(async () => {
  vi.unstubAllGlobals();
  if (
    path.dirname(directory) !== path.resolve(tmpdir()) ||
    !path.basename(directory).startsWith('turnright-campus-publication-')
  )
    throw Error('Invalid cleanup directory');
  await rm(directory, { recursive: true });
});
function mockDirectory(changed = false) {
  let reads = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL) => {
      const p = input.pathname;
      if (p === '/packages/campuses.json') {
        reads++;
        return Response.json(
          changed && reads > 1
            ? {
                ...catalogue,
                campuses: catalogue.campuses.map((c) => ({
                  ...c,
                  name: c.name + ' changed',
                })),
              }
            : catalogue,
        );
      }
      if (manifests.has(p)) return Response.json(manifests.get(p));
      if (content.has(p)) return new Response(content.get(p));
      return new Response('missing', { status: 404 });
    }),
  );
}
it('publishes or restores one campus while retaining every other manifest and asset', async () => {
  mockDirectory();
  const north = catalogue.campuses[1];
  const replacement = {
    ...manifests.get(north.manifestUrl!)!,
    version: 'north-def456',
  };
  const result = await preserveCampusCatalogue(directory, origin, {
    expectedRevision: catalogueRevision(catalogue),
    replacement: { campus: north, manifest: replacement },
  });
  expect(result.catalogue.campuses[0]).toEqual(catalogue.campuses[0]);
  expect(result.catalogue.campuses[1].manifestUrl).toBe(
    '/packages/north-def456/manifest.json',
  );
  expect(
    JSON.parse(
      await readFile(path.join(directory, 'packages/latest.json'), 'utf8'),
    ),
  ).toEqual(manifests.get(catalogue.campuses[0].manifestUrl!));
  for (const [url, bytes] of content)
    expect(await readFile(path.join(directory, url))).toEqual(bytes);
  expect(result.previousRevision).toBe(catalogueRevision(catalogue));
  expect(result.revision).not.toBe(result.previousRevision);
});
it('rejects stale previews before any public replacement', async () => {
  mockDirectory();
  await expect(
    preserveCampusCatalogue(directory, origin, { expectedRevision: 'stale' }),
  ).rejects.toThrow('directory changed');
  mockDirectory(true);
  await expect(preserveCampusCatalogue(directory, origin)).rejects.toThrow(
    'published while assets were copied',
  );
});
it('refuses mismatched public campus identities', async () => {
  mockDirectory();
  manifests.get(catalogue.campuses[1].manifestUrl!)!.campus!.id =
    'wrong-campus';
  await expect(preserveCampusCatalogue(directory, origin)).rejects.toThrow(
    'identity mismatch',
  );
});
