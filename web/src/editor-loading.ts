import { isConnectionFailure } from './admin-client';
export async function loadPreparedWorkspace<
  T extends { prepared: boolean; syncedAt?: string },
>(
  online: () => Promise<T>,
  cached: () => Promise<T | undefined>,
  preferCache: boolean,
) {
  if (preferCache) {
    const recovery = await cached().catch(() => undefined);
    if (recovery?.prepared) return { context: recovery, offline: true };
  }
  try {
    return { context: await online(), offline: false };
  } catch (error) {
    if (!isConnectionFailure(error)) throw error;
    const recovery = await cached().catch(() => undefined);
    if (!recovery?.prepared) throw error;
    return { context: recovery, offline: true };
  }
}
export function offlineOwner() {
  try {
    return localStorage.getItem('turnright:offline-owner');
  } catch {
    return null;
  }
}
export function rememberOfflineOwner(owner: string | null) {
  try {
    if (owner) localStorage.setItem('turnright:offline-owner', owner);
    else localStorage.removeItem('turnright:offline-owner');
  } catch {
    /* IndexedDB remains the authoritative recovery store. */
  }
}
