/** Private error tracking with bounded delivery; accepts no exception or user content. */
const pending = new Set();
let lastDeliveryWarning = -Infinity;
const components = new Set([
  'gis',
  'map-import',
  'source-review',
  'source-check',
]);
const dependencies = new Set([
  'database',
  'authentication',
  'storage',
  'github',
  'worker',
]);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function monitoringEnvelope(record, environment = process.env) {
  if (
    !['admin-request-failed', 'worker-failed'].includes(record?.event) ||
    !Number.isInteger(record.status) ||
    record.status < 500 ||
    record.status > 599 ||
    (typeof record.action === 'string' &&
      record.action.startsWith('monitoring-'))
  )
    return;
  const revision = environment.VERCEL_GIT_COMMIT_SHA || environment.GITHUB_SHA;
  const reference = record.jobId || record.requestId;
  return {
    event: record.event,
    component: components.has(record.worker) ? record.worker : 'api',
    dependency: dependencies.has(record.dependency)
      ? record.dependency
      : 'unknown',
    status: record.status,
    revision: /^[a-f0-9]{40}$/.test(revision || '') ? revision : 'unknown',
    ...(typeof reference === 'string' && uuid.test(reference)
      ? { reference }
      : {}),
  };
}

export function monitoringConfiguration(environment = process.env) {
  if (
    environment.ERROR_MONITORING_ENABLED === 'false' ||
    !environment.SUPABASE_URL ||
    !environment.SUPABASE_SERVICE_ROLE_KEY
  )
    return;
  try {
    const origin = new URL(environment.SUPABASE_URL);
    if (
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash ||
      !['', '/'].includes(origin.pathname) ||
      (origin.protocol !== 'https:' &&
        !(
          origin.protocol === 'http:' &&
          ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
        ))
    )
      return;
    return {
      origin: origin.origin,
      key: environment.SUPABASE_SERVICE_ROLE_KEY,
    };
  } catch {
    return;
  }
}

function deliveryWarning() {
  if (Date.now() - lastDeliveryWarning < 60_000) return;
  lastDeliveryWarning = Date.now();
  console.error(
    JSON.stringify({
      event: 'monitoring-delivery-failed',
      timestamp: new Date().toISOString(),
    }),
  );
}

export function captureOperationalError(record) {
  const envelope = monitoringEnvelope(record);
  const config = monitoringConfiguration();
  if (!envelope || !config) return;
  if (pending.size >= 16) {
    deliveryWarning();
    return;
  }
  const delivery = Promise.resolve()
    .then(async () => {
      const response = await fetch(
        `${config.origin}/rest/v1/rpc/record_operational_error`,
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(2000),
          headers: {
            apikey: config.key,
            Authorization: `Bearer ${config.key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ p_event: envelope }),
        },
      );
      await response.body?.cancel();
      if (!response.ok) throw Error('Monitoring delivery failed');
    })
    .catch(deliveryWarning)
    .finally(() => pending.delete(delivery));
  pending.add(delivery);
}

/** API handlers and worker entry points await their bounded deliveries before exiting. */
export async function flushErrorMonitoring() {
  await Promise.allSettled(pending);
}
