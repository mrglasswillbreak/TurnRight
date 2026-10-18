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
  if (/^(?:[a-f0-9-]{36}|ref-\d{1,12})$/i.test(context.requestId || ''))
    record.requestId = context.requestId;
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
  (event.endsWith('failed') ? console.error : console.info)(event, record);
}
