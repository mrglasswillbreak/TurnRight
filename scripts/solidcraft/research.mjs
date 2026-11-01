import fs from 'node:fs/promises';
import path from 'node:path';
import { archive, repository } from './inventory.mjs';

const directory = path.join(repository, 'data/lasu-models');
const inventory = JSON.parse(
  await fs.readFile(path.join(directory, 'inventory.json'), 'utf8'),
);
const metadataDirectory = path.join(archive, 'source-metadata');
await fs.mkdir(metadataDirectory, { recursive: true });
const text = (value) =>
  String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:nbsp|amp);/g, ' ')
    .trim();
async function commons(titles) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  for (const [key, value] of Object.entries({
    action: 'query',
    titles: titles.join('|'),
    prop: 'imageinfo|categories',
    iiprop: 'url|extmetadata',
    cllimit: '500',
    format: 'json',
  }))
    url.searchParams.set(key, value);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: { 'User-Agent': 'TurnRight-LASU-reference-audit/1.0' },
  });
  if (!response.ok)
    throw new Error(`Commons metadata returned ${response.status}`);
  return { url: url.href, result: await response.json() };
}
const metadata = new Map(),
  missing = [];
for (const photo of inventory.buildings.flatMap((b) => b.references)) {
  if (!photo.sourceUrl?.startsWith('https://commons.wikimedia.org/wiki/File:'))
    continue;
  const cached = await fs
    .readFile(path.join(metadataDirectory, photo.sha256 + '.json'), 'utf8')
    .then(JSON.parse)
    .catch(() => null);
  if (cached?.result?.query?.pages) metadata.set(photo.id, cached);
  else missing.push(photo);
}
// One batched request replaces dozens of individual requests. Never retry a 429 in a tight loop.
let batchError;
if (missing.length)
  try {
    const result = await commons(
      missing.map((p) =>
        decodeURIComponent(
          new URL(p.sourceUrl).pathname.slice('/wiki/'.length),
        ),
      ),
    );
    for (const photo of missing) {
      const title = decodeURIComponent(
        new URL(photo.sourceUrl).pathname.slice('/wiki/'.length),
      ).replaceAll('_', ' ');
      const page = Object.values(result.result.query?.pages || {}).find(
        (p) => p.title === title,
      );
      if (!page) continue;
      const single = {
        url: result.url,
        result: { query: { pages: { [page.pageid]: page } } },
      };
      metadata.set(photo.id, single);
      await fs.writeFile(
        path.join(metadataDirectory, photo.sha256 + '.json'),
        JSON.stringify(single, null, 2),
      );
    }
  } catch (error) {
    batchError = error.message;
  }
const records = [];
for (const building of inventory.buildings)
  for (const photo of building.references) {
    const record = {
      buildingId: building.id,
      photoId: photo.id,
      sourceUrl: photo.sourceUrl,
      checkedAt: new Date().toISOString(),
      status: 'observation-only',
      permittedUses: ['private observational reference'],
      publishedMetadata: {
        author: photo.author,
        license: photo.license,
        date: photo.capturedAt,
      },
    };
    if (
      photo.sourceUrl?.startsWith('https://commons.wikimedia.org/wiki/File:')
    ) {
      try {
        const result = metadata.get(photo.id);
        if (!result)
          throw new Error(
            batchError ||
              'Commons did not return this file; retry the audit later.',
          );
        const page = Object.values(result.result.query?.pages || {})[0],
          info = page?.imageinfo?.[0];
        if (!info?.extmetadata) throw new Error('No image metadata found.');
        await fs.writeFile(
          path.join(metadataDirectory, photo.sha256 + '.json'),
          JSON.stringify(result, null, 2),
        );
        const meta = info.extmetadata;
        record.verifiedMetadata = {
          author: text(meta.Artist?.value),
          license: text(meta.LicenseShortName?.value),
          licenseUrl: meta.LicenseUrl?.value,
          date: text(meta.DateTimeOriginal?.value || meta.DateTime?.value),
          description: text(meta.ImageDescription?.value).slice(0, 1200),
          categories: page.categories?.map((c) => c.title) || [],
          canonicalUrl: info.descriptionurl,
        };
        if (
          ['CC BY 4.0', 'CC BY-SA 4.0', 'CC0'].includes(
            record.verifiedMetadata.license,
          )
        ) {
          record.status = 'reuse-verified';
          record.permittedUses = [
            'observational reference',
            'redistributed reference with attribution',
            'texture derivative under source licence',
          ];
        }
        if (
          record.verifiedMetadata.categories.some((c) =>
            /Epe|Ikeja|LASUTH/i.test(c),
          )
        )
          record.identificationIssue =
            'Source is categorized outside Ojo; hold pending footprint identification.';
      } catch (error) {
        record.metadataError = error.message;
      }
    } else
      record.rightsGap =
        'Public accessibility and a legacy Public domain tag do not establish permission for redistribution or photographic textures.';
    if (photo.historical)
      record.temporalUse =
        'Dated historical evidence; does not establish the present appearance. Check the image before treating it as construction-era evidence.';
    if (photo.id === 'commons:198256515')
      record.exteriorUse =
        'Interior reference; does not independently locate the atrium roof on the mapped footprint.';
    records.push(record);
    console.log(
      `${photo.id}: ${record.status}${record.identificationIssue ? ' — identification hold' : ''}${record.metadataError ? ' — ' + record.metadataError : ''}`,
    );
  }
const output = {
  version: 1,
  baselineVersion: inventory.baselineVersion,
  records,
};
await fs.writeFile(
  path.join(directory, 'photo-audit.json'),
  JSON.stringify(output, null, 2),
);
await fs.writeFile(
  path.join(archive, 'photo-audit.json'),
  JSON.stringify(output, null, 2),
);
