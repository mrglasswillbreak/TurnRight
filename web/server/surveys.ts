import { db, HttpError } from './backend.js';

const uuid = (v: unknown) =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export async function surveyAction(
  owner: string,
  action: string,
  input: Record<string, unknown>,
) {
  const actor = encodeURIComponent(owner);
  if (action === 'survey-list')
    return db(
      `surveys?owner=eq.${actor}&select=*,survey_revisions!survey_revisions_survey_id_fkey(id,name:metadata->>name,status,created_at)&order=updated_at.desc&limit=100&survey_revisions.order=created_at.desc&survey_revisions.limit=20`,
    );
  if (action === 'survey-get') {
    if (!uuid(input.revisionId))
      throw new HttpError(400, 'Invalid survey revision.');
    const [revision] = await db(
      `survey_revisions?id=eq.${input.revisionId}&owner=eq.${actor}`,
    );
    if (!revision) throw new HttpError(404, 'Survey not found.');
    const offset = Number(input.offset || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 2000)
      throw new HttpError(400, 'Invalid chunk offset.');
    const chunks = await db(
      `survey_chunks?revision_id=eq.${input.revisionId}&owner=eq.${actor}&order=chunk_index&limit=4&offset=${offset}`,
    );
    return {
      revision,
      chunks,
      nextOffset:
        offset + chunks.length < revision.chunk_count
          ? offset + chunks.length
          : null,
    };
  }
  if (action !== 'survey-save')
    throw new HttpError(400, 'Unknown survey action.');
  const { command, ...payload } = input;
  if (!['begin', 'chunk', 'finalize', 'archive'].includes(String(command)))
    throw new HttpError(400, 'Invalid survey command.');
  if (
    (command === 'archive' || command === 'begin') &&
    (!uuid(payload.surveyId) ||
      (payload.expectedRevision !== null && !uuid(payload.expectedRevision)))
  )
    throw new HttpError(400, 'Invalid survey identity or revision.');
  if (command !== 'archive' && !uuid(payload.revisionId))
    throw new HttpError(400, 'Invalid operation identity.');
  if (command === 'archive' && typeof payload.archived !== 'boolean')
    throw new HttpError(400, 'Choose archive or restore.');
  if (command === 'begin') {
    const metadata = payload.metadata as Record<string, unknown>;
    if (
      !metadata ||
      metadata.owner !== owner ||
      metadata.id !== payload.surveyId ||
      !Array.isArray(metadata.segments) ||
      !Array.isArray(metadata.review) ||
      !Array.isArray(metadata.markers) ||
      JSON.stringify(metadata).length > 1_000_000 ||
      !Number.isInteger(payload.chunkCount) ||
      Number(payload.chunkCount) < 0 ||
      Number(payload.chunkCount) > 2000
    )
      throw new HttpError(400, 'Invalid survey metadata.');
  }
  if (command === 'chunk') {
    if (
      !Number.isInteger(payload.index) ||
      Number(payload.index) < 0 ||
      !Array.isArray(payload.samples) ||
      !payload.samples.length ||
      payload.samples.length > 250 ||
      JSON.stringify(payload.samples).length > 200000
    )
      throw new HttpError(400, 'Invalid recording chunk.');
    for (const sample of payload.samples) {
      if (
        !uuid(sample.id) ||
        !Array.isArray(sample.coordinates) ||
        sample.coordinates.length !== 2 ||
        !sample.coordinates.every(
          (v: unknown) => typeof v === 'number' && Number.isFinite(v),
        ) ||
        !Number.isFinite(sample.timestamp) ||
        !Number.isFinite(sample.accuracy) ||
        ![
          'accepted',
          'duplicate',
          'inaccurate',
          'stale',
          'outside',
          'jump',
          'out-of-order',
        ].includes(sample.status)
      )
        throw new HttpError(400, 'Invalid recording sample.');
    }
  }
  return db('rpc/save_survey_revision', 'POST', {
    actor_id: owner,
    command,
    payload,
  });
}
