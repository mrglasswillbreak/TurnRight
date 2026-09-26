import {
  lasuCampus,
  validCatalogue,
  type CampusCatalogue,
} from './campus-context';
import { getPreference, setPreference } from './offline';

export async function loadCampusCatalogue(): Promise<CampusCatalogue> {
  try {
    const response = await fetch('/packages/campuses.json', {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 404)
      return { schemaVersion: 1, campuses: [lasuCampus] };
    if (!response.ok) throw new Error('Campus directory could not load.');
    const data: unknown = await response.json();
    if (!validCatalogue(data))
      throw new Error('This campus directory needs a newer app.');
    await setPreference('campus-catalogue', data);
    return data;
  } catch (error) {
    const cached = await getPreference<unknown>('campus-catalogue', null);
    if (validCatalogue(cached)) return cached;
    if (!navigator.onLine) return { schemaVersion: 1, campuses: [lasuCampus] };
    throw error;
  }
}
