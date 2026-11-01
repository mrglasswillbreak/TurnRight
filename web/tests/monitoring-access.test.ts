import { afterEach, expect, it, vi } from 'vitest';
const database = vi.hoisted(() => vi.fn());
vi.mock('../server/backend.js', async () => {
  const original =
    await vi.importActual<typeof import('../server/backend')>(
      '../server/backend',
    );
  return { ...original, db: database };
});
import { monitoringAction } from '../server/monitoring';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
function configured() {
  vi.stubEnv('ADMIN_USER_ID', 'owner');
  vi.stubEnv('ERROR_MONITORING_ENABLED', 'true');
  vi.stubEnv('SUPABASE_URL', 'https://monitoring.example');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test');
}
it('restricts all monitoring data to the configured owner, regardless of campus membership', async () => {
  configured();
  await expect(
    monitoringAction('monitoring-list', {}, 'campus-administrator'),
  ).rejects.toMatchObject({ status: 403 });
  vi.stubEnv('ADMIN_USER_ID', '');
  await expect(
    monitoringAction('monitoring-list', {}, 'owner'),
  ).rejects.toMatchObject({ status: 403 });
  expect(database).not.toHaveBeenCalled();
});
it('reports unavailable monitoring and reads only the bounded private summary', async () => {
  configured();
  vi.stubEnv('ERROR_MONITORING_ENABLED', 'false');
  await expect(
    monitoringAction('monitoring-list', {}, 'owner'),
  ).rejects.toMatchObject({ status: 503 });
  vi.stubEnv('ERROR_MONITORING_ENABLED', 'true');
  database.mockResolvedValue({ groups: [] });
  expect(await monitoringAction('monitoring-list', {}, 'owner')).toEqual({
    groups: [],
  });
  expect(database).toHaveBeenCalledWith(
    'rpc/operational_error_summary',
    'POST',
    {},
  );
  await expect(
    monitoringAction('monitoring-unknown', {}, 'owner'),
  ).rejects.toMatchObject({ status: 400 });
});
it('uses optimistic resolution so a newly recurring failure cannot be silently dismissed', async () => {
  configured();
  const payload = {
    fingerprint: 'a'.repeat(32),
    lastSeen: '2026-10-21T10:00:00.123456Z',
  };
  for (const invalid of [
    null,
    {},
    { ...payload, fingerprint: '../../private' },
    { ...payload, lastSeen: 'invalid' },
    { ...payload, lastSeen: 'a'.repeat(41) },
  ])
    await expect(
      monitoringAction('monitoring-resolve', invalid, 'owner'),
    ).rejects.toMatchObject({ status: 400 });
  database.mockResolvedValue(false);
  await expect(
    monitoringAction('monitoring-resolve', payload, 'owner'),
  ).rejects.toMatchObject({ status: 409 });
  database.mockResolvedValue(true);
  expect(
    await monitoringAction('monitoring-resolve', payload, 'owner'),
  ).toEqual({ resolved: true });
  expect(database).toHaveBeenLastCalledWith(
    'rpc/resolve_operational_error',
    'POST',
    { p_fingerprint: payload.fingerprint, p_last_seen: payload.lastSeen },
  );
});
