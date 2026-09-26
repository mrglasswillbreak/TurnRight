import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { preservePublished, assetTarget } from './published-assets.mjs';

export function catalogueRevision(catalogue) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        schemaVersion: 1,
        campuses: [...catalogue.campuses]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((c) => ({
            id: c.id,
            slug: c.slug,
            name: c.name,
            bounds: c.bounds,
            manifestUrl: c.manifestUrl,
          })),
      }),
    )
    .digest('hex');
}
export async function readPublishedCatalogue(origin) {
  const root = new URL(origin);
  if (root.protocol !== 'https:' || root.username || root.password)
    throw new Error('Published map URL must be HTTPS.');
  const response = await fetch(new URL('/packages/campuses.json', root), {
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  let catalogue;
  if (response.status === 404) {
    const result = await fetch(new URL('/packages/latest.json', root), {
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    if (!result.ok) throw new Error('Cannot verify the existing LASU package.');
    const manifest = await result.json();
    if (!/^lasu-[a-f0-9]+$/.test(manifest.version))
      throw new Error('Invalid legacy campus version.');
    catalogue = {
      schemaVersion: 1,
      campuses: [
        {
          id: 'lasu',
          slug: 'lasu',
          name: 'LASU · Ojo',
          bounds: [
            [3.19, 6.455],
            [3.215, 6.489],
          ],
          manifestUrl: `/packages/${manifest.version}/manifest.json`,
        },
      ],
    };
  } else {
    if (!response.ok)
      throw new Error('Cannot verify the published campus directory.');
    catalogue = await response.json();
  }
  if (
    catalogue?.schemaVersion !== 1 ||
    !Array.isArray(catalogue.campuses) ||
    !catalogue.campuses.length ||
    catalogue.campuses.length > 1000
  )
    throw new Error('Invalid published campus directory.');
  const ids = new Set(),
    slugs = new Set();
  for (const campus of catalogue.campuses) {
    if (
      typeof campus.id !== 'string' ||
      !campus.id ||
      ids.has(campus.id) ||
      slugs.has(campus.slug) ||
      !/^[a-z0-9][a-z0-9-]{0,79}$/.test(campus.slug) ||
      typeof campus.name !== 'string' ||
      !campus.name ||
      !/^\/packages\/[a-z0-9-]+\/manifest\.json$/.test(campus.manifestUrl) ||
      !Array.isArray(campus.bounds) ||
      campus.bounds.length !== 2 ||
      !campus.bounds.every(
        (p) =>
          Array.isArray(p) &&
          p.length === 2 &&
          Number.isFinite(p[0]) &&
          Number.isFinite(p[1]) &&
          Math.abs(p[0]) <= 180 &&
          Math.abs(p[1]) <= 90,
      )
    )
      throw new Error('Invalid campus directory entry.');
    ids.add(campus.id);
    slugs.add(campus.slug);
  }
  if (!ids.has('lasu'))
    throw new Error('The directory must preserve LASU compatibility.');
  return { catalogue, revision: catalogueRevision(catalogue) };
}
export async function preserveCampusCatalogue(
  publicDir,
  origin,
  { expectedRevision, replacement } = {},
) {
  const { catalogue, revision } = await readPublishedCatalogue(origin);
  if (expectedRevision && revision !== expectedRevision)
    throw new Error(
      'The public campus directory changed. Build a fresh preview.',
    );
  const manifests = new Map();
  for (const campus of catalogue.campuses) {
    const manifest = await preservePublished(
      publicDir,
      origin,
      false,
      undefined,
      campus.manifestUrl,
    );
    if (
      campus.id !== 'lasu' &&
      (manifest.campus?.id !== campus.id ||
        manifest.campus?.slug !== campus.slug)
    )
      throw new Error('Published campus identity mismatch.');
    manifests.set(campus.id, manifest);
  }
  if ((await readPublishedCatalogue(origin)).revision !== revision)
    throw new Error(
      'A campus was published while assets were copied. Rebuild the preview.',
    );
  if (replacement) {
    const { campus, manifest } = replacement;
    const index = catalogue.campuses.findIndex((c) => c.id === campus.id);
    const entry = {
      id: campus.id,
      slug: campus.slug,
      name: campus.name,
      bounds: campus.bounds,
      manifestUrl: `/packages/${manifest.version}/manifest.json`,
    };
    if (index < 0) catalogue.campuses.push(entry);
    else catalogue.campuses[index] = entry;
    manifests.set(campus.id, manifest);
  }
  const directory = path.join(publicDir, 'packages');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, 'campuses.json'),
    JSON.stringify(catalogue, null, 2),
  );
  await fs.writeFile(
    path.join(directory, 'latest.json'),
    JSON.stringify(manifests.get('lasu'), null, 2),
  );
  for (const campus of catalogue.campuses) {
    const manifest = manifests.get(campus.id);
    await fs.mkdir(path.dirname(assetTarget(publicDir, campus.manifestUrl)), {
      recursive: true,
    });
    await fs.writeFile(
      assetTarget(publicDir, campus.manifestUrl),
      JSON.stringify(manifest, null, 2),
    );
  }
  return {
    catalogue,
    revision: catalogueRevision(catalogue),
    previousRevision: revision,
  };
}
