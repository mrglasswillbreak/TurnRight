import { db, HttpError } from './backend.js';
import { monitoringConfiguration } from './error-monitoring.mjs';

export async function monitoringAction(
  action: string,
  payload: unknown,
  userId: string,
) {
  if (!process.env.ADMIN_USER_ID || userId !== process.env.ADMIN_USER_ID)
    throw new HttpError(
      403,
      'Only the application owner can view operational monitoring.',
    );
  if (!monitoringConfiguration())
    throw new HttpError(
      503,
      'Operational monitoring is disabled or not configured.',
    );
  if (action === 'monitoring-list')
    return db('rpc/operational_error_summary', 'POST', {});
  if (action === 'monitoring-resolve') {
    const value = payload as {
      fingerprint?: unknown;
      lastSeen?: unknown;
    } | null;
    if (
      typeof value?.fingerprint !== 'string' ||
      !/^[a-f0-9]{32}$/.test(value.fingerprint) ||
      typeof value.lastSeen !== 'string' ||
      value.lastSeen.length > 40 ||
      !Number.isFinite(Date.parse(value.lastSeen))
    )
      throw new HttpError(400, 'Select a current monitoring group.');
    const changed = await db<boolean>('rpc/resolve_operational_error', 'POST', {
      p_fingerprint: value.fingerprint,
      p_last_seen: value.lastSeen,
    });
    if (!changed)
      throw new HttpError(
        409,
        'This group changed. Refresh before marking it resolved.',
      );
    return { resolved: true };
  }
  throw new HttpError(400, 'Unknown monitoring action.');
}
