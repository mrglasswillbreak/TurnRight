import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import { deletePackages, installPackage, loadCampus } from '../src/offline';
import type { OfflineFixture } from './offline.test';
export function registerCampusIsolation(fixture: () => OfflineFixture): void {
  it('keeps campus downloads independent when removing one campus', async () => {
    const first = await fixture().pkg('lasu-isolation'),
      second = await fixture().pkg('other-isolation');
    second.manifest.campus = {
      id: 'campus-two',
      slug: 'other',
      name: 'Other campus',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(
            url === first.manifest.dataUrl ? first.bytes : second.bytes,
          ),
      ),
    );
    await installPackage(first.manifest, () => {});
    await installPackage(second.manifest, () => {});
    expect((await loadCampus('lasu')).manifest.version).toBe('lasu-isolation');
    expect((await loadCampus('other')).manifest.version).toBe(
      'other-isolation',
    );
    await deletePackages('other');
    expect(fixture().saved.has(second.manifest.dataUrl)).toBe(false);
    expect((await loadCampus('lasu')).manifest.version).toBe('lasu-isolation');
  });
}
