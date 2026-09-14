import { withPublishedVisuals } from '../src/editor-visuals.js';
import { createHash } from 'node:crypto';
import { assembleSources, type SourceRecord } from '../src/editor-model.js';
import { validateWorkspace } from '../src/editor-validation.js';
import { structuralIssues } from '../src/validation.js';
import type { CampusData, CampusPackage, MapEdit } from '../src/types.js';
import { HttpError } from './backend.js';

function stable(value: unknown, source = false): unknown {
  if (Array.isArray(value)) return value.map((v) => stable(v, source));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) => !source || !['createdAt', 'retrievedAt'].includes(key),
        )
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, v]) => [key, stable(v, source)]),
    );
  return value;
}
export function snapshotHash(features: SourceRecord[], edits: MapEdit[] = []) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        stable({
          features: [...features].sort((a, b) => a.id.localeCompare(b.id)),
          edits: [...edits].sort((a, b) =>
            `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`),
          ),
        }),
      ),
    )
    .digest('hex');
}
export async function publishedCampus(): Promise<CampusData> {
  const origin = process.env.PUBLISHED_MAP_URL;
  if (!origin)
    throw new HttpError(
      503,
      'Configure PUBLISHED_MAP_URL before reconciling or publishing campus data.',
    );
  const root = new URL(origin);
  if (root.protocol !== 'https:')
    throw new HttpError(503, 'The published map must use HTTPS.');
  const response = await fetch(new URL('/packages/latest.json', root), {
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new HttpError(
      503,
      'Cannot verify the current public package. Retry while online.',
    );
  const manifest = (await response.json()) as CampusPackage;
  const asset = manifest.assets?.find((a) => a.url === manifest.dataUrl);
  if (
    manifest.schemaVersion !== 1 ||
    !asset ||
    !/^\/packages\/[a-zA-Z0-9-]+\/campus\.json$/.test(manifest.dataUrl) ||
    asset.bytes > 25_000_000
  )
    throw new HttpError(400, 'Invalid public package manifest.');
  const dataResponse = await fetch(new URL(manifest.dataUrl, root), {
    signal: AbortSignal.timeout(20000),
  });
  if (!dataResponse.ok)
    throw new HttpError(503, 'Cannot download the public campus baseline.');
  const bytes = Buffer.from(await dataResponse.arrayBuffer());
  if (
    bytes.length !== asset.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== asset.sha256
  )
    throw new HttpError(400, 'Public campus integrity verification failed.');
  const data = JSON.parse(bytes.toString()) as CampusData;
  if (data.version !== manifest.version || structuralIssues(data).length)
    throw new HttpError(400, 'Public campus failed structural validation.');
  return data;
}
export function publishedRecords(data: CampusData): SourceRecord[] {
  const { map, places, graph, ...meta } = data;
  const records: SourceRecord[] = [];
  const add = (
    entity: SourceRecord['entity'],
    id: string,
    payload: unknown,
    source: string,
  ) =>
    records.push({
      id: `${entity}:${id}`,
      entity,
      source,
      payload,
      hash: createHash('sha256')
        .update(JSON.stringify(stable(payload, true)))
        .digest('hex'),
    });
  add('meta', 'campus', meta, 'published-review');
  map.features.forEach((f) =>
    add(
      'feature',
      String(f.properties?.id),
      f,
      String(f.properties?.source || 'campus'),
    ),
  );
  places.forEach((p) => add('place', p.id, p, p.source));
  graph.nodes.forEach((n) => add('node', n.id, n, 'published-review'));
  graph.edges.forEach((e) => add('edge', e.id, e, 'published-review'));
  return records;
}
export function validateReleaseSnapshot(
  snapshot: { features: SourceRecord[]; edits: MapEdit[] },
  published: CampusData,
) {
  if (!snapshot?.features?.length || !Array.isArray(snapshot.edits))
    throw new HttpError(400, 'The release has no complete source snapshot.');
  const base = withPublishedVisuals(
    assembleSources(snapshot.features, published),
    published,
  );
  if (base.version !== published.version)
    throw new HttpError(
      409,
      'This baseline predates the public package. Reconcile it and build a new preview.',
    );
  const result = validateWorkspace(base, snapshot.edits);
  if (result.errors.length) throw new HttpError(400, result.errors.join('\n'));
  return result.data;
}
