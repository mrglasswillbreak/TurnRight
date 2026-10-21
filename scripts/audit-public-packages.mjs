import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { requestPublishedAsset } from '../web/scripts/published-assets.mjs';

const [output, previous] = process.argv.slice(2);
assert(
  output,
  'Usage: node scripts/audit-public-packages.mjs receipt.json [baseline.json]',
);
const origin = process.env.VERIFY_ORIGIN || 'https://turnright.vercel.app';
assert.equal(new URL(origin).protocol, 'https:');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function get(relative) {
  const url = new URL(relative, origin);
  assert.equal(url.origin, new URL(origin).origin);
  const response = await requestPublishedAsset(origin, url.href, 45000, {
    headers: process.env.VERIFY_BYPASS
      ? { 'x-vercel-protection-bypass': process.env.VERIFY_BYPASS }
      : {},
  });
  const location = response.headers.get('location');
  // Report the public path, never redirect queries, bypass credentials or bodies.
  const redirected = location ? new URL(location, url) : null;
  assert.equal(
    response.status,
    200,
    `${url.pathname}${redirected ? ` redirected to ${redirected.origin}${redirected.pathname}` : ''}`,
  );
  return Buffer.from(await response.arrayBuffer());
}
const catalogueBytes = await get('/packages/campuses.json');
const catalogue = JSON.parse(catalogueBytes);
const receipt = {
  recordedAt: new Date().toISOString(),
  origin,
  readOnly: true,
  catalogueSha256: digest(catalogueBytes),
  campuses: [],
  assetsVerified: 0,
};
for (const slug of ['lasu', 'unilag']) {
  const entry = catalogue.campuses.find((campus) => campus.slug === slug);
  assert(entry, `Missing ${slug}`);
  const bytes = await get(entry.manifestUrl);
  const manifest = JSON.parse(bytes);
  const assets = manifest.assets.map(({ url, bytes, sha256 }) => ({
    url,
    bytes,
    sha256,
  }));
  for (let index = 0; index < assets.length; index += 6) {
    await Promise.all(
      assets.slice(index, index + 6).map(async (asset) => {
        const content = await get(asset.url);
        assert.equal(content.length, asset.bytes, asset.url);
        assert.equal(digest(content), asset.sha256, asset.url);
        receipt.assetsVerified++;
      }),
    );
  }
  receipt.campuses.push({
    slug,
    version: manifest.version,
    manifestUrl: entry.manifestUrl,
    manifestSha256: digest(bytes),
    assets,
  });
}
if (previous) {
  const baseline = JSON.parse(await readFile(previous, 'utf8'));
  assert.equal(
    receipt.catalogueSha256,
    baseline.catalogueSha256,
    'Published catalogue changed',
  );
  assert.deepEqual(
    receipt.campuses,
    baseline.campuses,
    'Published campus identity or assets changed',
  );
  receipt.matchesBaseline = true;
}
await writeFile(output, JSON.stringify(receipt, null, 2) + '\n');
console.log(
  `Verified ${receipt.assetsVerified} assets: ${receipt.campuses.map((campus) => campus.version).join(', ')}${previous ? '; baseline unchanged' : ''}.`,
);
