import { randomUUID } from 'node:crypto';
import { db, dispatch, HttpError } from './backend.js';
import { currentCampusId } from './campus-scope.js';
import {
  MAP_IMPORT_LIMITS,
  type CampusImport,
  type CampusSource,
  type ImportConfiguration,
} from '../src/map-import-types.js';

const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const defaults: ImportConfiguration = {
  layers: [],
  attribution: '',
  license: '',
  redistributionConfirmed: false,
};
export function importConfiguration(value: unknown): ImportConfiguration {
  const c = value as ImportConfiguration;
  if (
    !c ||
    !Array.isArray(c.layers) ||
    c.layers.length > 100 ||
    typeof c.attribution !== 'string' ||
    c.attribution.length > 4000 ||
    typeof c.license !== 'string' ||
    c.license.length > 4000 ||
    typeof c.redistributionConfirmed !== 'boolean'
  )
    throw new HttpError(400, 'Invalid source mapping or attribution.');
  const seen = new Set<string>();
  for (const layer of c.layers) {
    if (
      typeof layer.layer !== 'string' ||
      !layer.layer ||
      layer.layer.length > 200 ||
      seen.has(layer.layer) ||
      ![
        'building',
        'path',
        'place',
        'entrance',
        'barrier',
        'landcover',
        'boundary',
        'skip',
      ].includes(layer.role)
    )
      throw new HttpError(400, 'Choose one valid role for each layer.');
    seen.add(layer.layer);
    for (const key of [
      'idField',
      'nameField',
      'categoryField',
      'heightField',
      'floorsField',
      'accessField',
      'longitudeField',
      'latitudeField',
      'crs',
    ] as const)
      if (
        layer[key] !== undefined &&
        (typeof layer[key] !== 'string' || layer[key]!.length > 200)
      )
        throw new HttpError(400, 'Invalid field mapping.');
    if (
      layer.walkingAccess &&
      !['yes', 'private', 'no'].includes(layer.walkingAccess)
    )
      throw new HttpError(400, 'Choose valid walking access.');
    if (layer.heightUnit && !['m', 'ft'].includes(layer.heightUnit))
      throw new HttpError(400, 'Choose metres or feet.');
  }
  return c;
}
export function importUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 2000)
    throw new HttpError(400, 'Enter a public HTTPS ArcGIS URL.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, 'Enter a valid source URL.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    url.searchParams.has('token') ||
    !url.hostname.includes('.') ||
    /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(url.hostname)
  )
    throw new HttpError(400, 'Use a public HTTPS source without credentials.');
  return url.href;
}
async function storage(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(
    `${process.env.SUPABASE_URL}/storage/v1/${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        'Content-Type': 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!response.ok)
    throw new HttpError(
      503,
      'Private import storage is unavailable. Retry the upload or job.',
    );
  return response;
}
async function jobById(id: unknown) {
  if (!uuid(id)) throw new HttpError(400, 'Invalid import identity.');
  const [job] = await db<(CampusImport & { candidate_path?: string })[]>(
    `campus_imports?id=eq.${id}`,
  );
  if (!job) throw new HttpError(404, 'Import not found in this campus.');
  return job;
}
export async function mapImportAction(
  action: string,
  p: Record<string, unknown>,
) {
  if (action === 'import-list') {
    const [sources, imports] = await Promise.all([
      db<CampusSource[]>('campus_sources?order=name'),
      db<CampusImport[]>('campus_imports?order=created_at.desc&limit=30'),
    ]);
    return {
      sources,
      imports,
      limits: MAP_IMPORT_LIMITS,
      scheduledOsmEnabled: process.env.OVERPASS_SCHEDULE_ALLOWED === 'true',
    };
  }
  if (action === 'import-start') {
    let source: CampusSource;
    if (p.sourceId) {
      if (!uuid(p.sourceId)) throw new HttpError(400, 'Invalid source.');
      [source] = await db<CampusSource[]>(`campus_sources?id=eq.${p.sourceId}`);
      if (!source) throw new HttpError(404, 'Source not found.');
    } else {
      if (
        !['file', 'osm', 'arcgis'].includes(String(p.kind)) ||
        typeof p.name !== 'string' ||
        !p.name.trim() ||
        p.name.length > 160
      )
        throw new HttpError(400, 'Name the source and choose its type.');
      const url = p.kind === 'arcgis' ? importUrl(p.url) : null;
      [source] = await db<CampusSource[]>('campus_sources', 'POST', {
        id: randomUUID(),
        name: p.name.trim(),
        kind: p.kind,
        url,
        configuration:
          p.kind === 'osm'
            ? {
                ...defaults,
                attribution: '© OpenStreetMap contributors',
                license: 'ODbL-1.0',
                redistributionConfirmed: true,
              }
            : defaults,
      });
    }
    const [job] = await db<CampusImport[]>('campus_imports', 'POST', {
      id: randomUUID(),
      source_id: source.id,
      configuration: source.configuration,
      run_token: randomUUID(),
    });
    return { source, job };
  }
  if (action === 'source-schedule') {
    if (!uuid(p.sourceId) || !['manual', 'daily'].includes(String(p.schedule)))
      throw new HttpError(400, 'Choose manual or daily refresh.');
    const [source] = await db<CampusSource[]>(
      `campus_sources?id=eq.${p.sourceId}`,
    );
    if (!source || source.kind === 'file')
      throw new HttpError(
        400,
        'Upload a replacement file to refresh this source.',
      );
    if (
      p.schedule === 'daily' &&
      source.kind === 'osm' &&
      process.env.OVERPASS_SCHEDULE_ALLOWED !== 'true'
    )
      throw new HttpError(
        400,
        'Configure an Overpass endpoint that permits scheduled downloads first.',
      );
    return db(`campus_sources?id=eq.${source.id}`, 'PATCH', {
      schedule: p.schedule,
      updated_at: new Date().toISOString(),
    });
  }
  const job = await jobById(p.importId);
  if (action === 'import-get')
    return {
      job,
      assets: await db(
        `campus_import_assets?import_id=eq.${job.id}&order=name`,
      ),
    };
  if (action === 'import-upload') {
    if (job.status !== 'draft')
      throw new HttpError(409, 'Start a new import to add files.');
    if (
      typeof p.name !== 'string' ||
      p.name.length > 180 ||
      !/\.(geojson|json|zip|gpkg|kml|kmz|gpx|csv|osm|xml|pbf)$/i.test(p.name) ||
      /[\\/]/.test(p.name) ||
      [...p.name].some((c) => c.charCodeAt(0) < 32) ||
      !Number.isSafeInteger(p.bytes) ||
      Number(p.bytes) <= 0 ||
      Number(p.bytes) > MAP_IMPORT_LIMITS.uploadBytes ||
      typeof p.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(p.sha256)
    )
      throw new HttpError(
        400,
        'Choose a supported map file within the 50 MiB batch limit.',
      );
    const id = randomUUID(),
      path = `${currentCampusId()}/${job.id}/${id}.${p.name.split('.').pop()!.toLowerCase()}`;
    const asset = await db<{ id: string; path: string }>(
      'rpc/add_import_asset',
      'POST',
      {
        asset: {
          id,
          import_id: job.id,
          path,
          name: p.name,
          bytes: p.bytes,
          sha256: p.sha256,
        },
      },
    );
    const signed = await (
      await storage(`object/upload/sign/campus-imports/${asset.path}`, 'POST', {
        upsert: false,
      })
    ).json();
    const url = new URL(signed.url, process.env.SUPABASE_URL);
    if (!url.pathname.startsWith('/storage/v1/'))
      url.pathname = `/storage/v1${url.pathname}`;
    return { asset, url: url.href };
  }
  if (action === 'import-cancel') {
    if (job.status === 'reviewed')
      throw new HttpError(409, 'This import is already in the review queue.');
    await db(
      `campus_imports?id=eq.${job.id}&run_token=eq.${job.run_token}`,
      'PATCH',
      {
        status: 'cancelled',
        run_token: randomUUID(),
        message: 'Import cancelled; existing campus data is unchanged.',
        updated_at: new Date().toISOString(),
      },
    );
    return { ok: true };
  }
  if (action === 'import-run') {
    if (['running', 'queued', 'reviewed', 'cancelled'].includes(job.status))
      throw new HttpError(409, 'This import cannot run in its current state.');
    const phase = p.phase === 'preview' ? 'preview' : 'inspect';
    const configuration = p.configuration
      ? importConfiguration(p.configuration)
      : job.configuration;
    const token = randomUUID();
    const rows = await db<CampusImport[]>(
      `campus_imports?id=eq.${job.id}&run_token=eq.${job.run_token}&status=eq.${job.status}`,
      'PATCH',
      {
        status: 'queued',
        phase,
        configuration,
        run_token: token,
        message: 'Waiting for import worker',
        updated_at: new Date().toISOString(),
      },
    );
    if (!rows.length)
      throw new HttpError(409, 'This import changed in another session.');
    try {
      await dispatch('map-import.yml', {
        campus_id: currentCampusId(),
        import_id: job.id,
        run_token: token,
      });
    } catch (error) {
      await db(
        `campus_imports?id=eq.${job.id}&run_token=eq.${token}&status=eq.queued`,
        'PATCH',
        { status: 'failed', message: (error as Error).message },
      );
      throw error;
    }
    return { job: rows[0] };
  }
  if (action === 'import-queue') {
    if (
      job.status !== 'preview' ||
      !job.candidate_path ||
      !job.candidate_path.startsWith(`${currentCampusId()}/${job.id}/`)
    )
      throw new HttpError(409, 'Prepare a complete import preview first.');
    const response = await storage(
      `object/campus-imports/${job.candidate_path}`,
    );
    const candidate = await response.json();
    const count = await db('rpc/queue_campus_import', 'POST', {
      import_id: job.id,
      expected_token: job.run_token,
      proposals: candidate.proposals,
      expected_sources: candidate.expectedSources,
    });
    return { count };
  }
  throw new HttpError(400, 'Unknown import action.');
}
