import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import {
  installPackage,
  loadCampus,
  getPreference,
  setPreference,
} from '../src/offline';
import type { OfflineFixture } from './offline.test';
export function registerPackageIntegrity(fixture: () => OfflineFixture): void {
  it('keeps visitor layer preferences independent per campus', async () => {
    await setPreference('visitor-layers', { buildings: false }, 'lasu');
    await setPreference('visitor-layers', { greenery: false }, 'unilag');
    expect(await getPreference('visitor-layers', {}, 'lasu')).toEqual({
      buildings: false,
    });
    expect(await getPreference('visitor-layers', {}, 'unilag')).toEqual({
      greenery: false,
    });
  });
  it('captures explicit preference scopes before asynchronous storage and URL changes', async () => {
    vi.stubGlobal('location', { search: '?campus=lasu' });
    const first = setPreference('saved', ['lasu-library'], 'lasu');
    vi.stubGlobal('location', { search: '?campus=north' });
    const second = setPreference('saved', ['north-library'], 'north');
    await Promise.all([first, second]);
    expect(await getPreference('saved', [], 'lasu')).toEqual(['lasu-library']);
    expect(await getPreference('saved', [], 'north')).toEqual([
      'north-library',
    ]);
    vi.unstubAllGlobals();
  });
  it('fails an undownloaded offline target without altering the active campus', async () => {
    const p = await fixture().pkg('retained-offline');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(p.bytes)),
    );
    await installPackage(p.manifest, () => {});
    vi.stubGlobal('navigator', { onLine: false });
    await expect(loadCampus('missing')).rejects.toThrow('not downloaded');
    expect((await loadCampus('lasu')).manifest.version).toBe(
      p.manifest.version,
    );
  });
}
