import { monitoringConfiguration } from '../web/server/error-monitoring.mjs';
const config = monitoringConfiguration();
if (!config) throw Error('Monitoring backend is not configured.');
const response = await fetch(
  `${config.origin}/rest/v1/rpc/prune_operational_errors`,
  {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  },
);
if (!response.ok)
  throw Error(`Monitoring retention failed (${response.status}).`);
const removed = await response.json();
if (!Number.isSafeInteger(removed) || removed < 0)
  throw Error('Unexpected retention receipt.');
console.log(
  JSON.stringify({ operation: 'operational-monitoring-retention', removed }),
);
