import { captureOperationalError } from './error-monitoring.mjs';
const events = new Set([
  'admin-request-failed',
  'request-completed',
  'worker-completed',
  'worker-failed',
]);
const dependencies = new Set([
  'database',
  'authentication',
  'storage',
  'github',
  'worker',
]);
const workers = new Set(['gis', 'map-import', 'source-review', 'source-check']);
const uuid = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

/** Read only the public job identity from known worker response contracts. */
export function diagnosticJobId(action, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return;
  const id = action?.startsWith('import-')
    ? body.job?.id
    : [
          'gis-job-start',
          'source-updates-prepare',
          'source-updates-control',
        ].includes(action)
      ? body.id
      : undefined;
  return uuid(id) ? id : undefined;
}

/** Whitelist operational metadata; never serialize an Error, request or payload. */
export function eventRecord(event, context = {}, now = Date.now()) {
  if (!events.has(event)) throw Error('Unknown diagnostic event.');
  const record = { event, timestamp: new Date(now).toISOString() };
  if (Number.isFinite(context.startedAt) && context.startedAt <= now)
    record.durationMs = Math.round(now - context.startedAt);
  if (
    Number.isInteger(context.status) &&
    context.status >= 100 &&
    context.status <= 599
  )
    record.status = context.status;
  if (uuid(context.requestId) || /^ref-\d{1,12}$/.test(context.requestId || ''))
    record.requestId = context.requestId;
  if (uuid(context.jobId)) record.jobId = context.jobId;
  if (/^[a-z][a-z-]{0,63}$/.test(context.action || ''))
    record.action = context.action;
  if (dependencies.has(context.dependency))
    record.dependency = context.dependency;
  if (
    Number.isInteger(context.upstreamStatus) &&
    context.upstreamStatus >= 100 &&
    context.upstreamStatus <= 599
  )
    record.upstreamStatus = context.upstreamStatus;
  if (workers.has(context.worker)) record.worker = context.worker;
  return record;
}

export function emitEvent(event, context = {}) {
  const record = eventRecord(event, context);
  (event.endsWith('failed') ? console.error : console.info)(
    JSON.stringify(record),
  );
  captureOperationalError(record);
}
