import { afterEach, expect, it, vi } from 'vitest';
import {
  campusKey,
  campusUrl,
  emptyCampus,
  lasuCampus,
  requestedCampus,
  validCatalogue,
} from '../src/campus-context';
import { structuralIssues } from '../src/validation';
import {
  scopeDatabaseRequest,
  withCampusId,
  currentCampusId,
} from '../server/campus-scope';
afterEach(() => vi.unstubAllGlobals());
it('retains legacy LASU links and separates preferences and public editor links', () => {
  expect(requestedCampus('')).toBe('lasu');
  expect(campusKey('saved', 'lasu')).toBe('saved');
  expect(campusKey('saved', 'other')).toBe('campus:other:saved');
  expect(campusUrl('/admin?building=building', 'other')).toBe(
    '/admin?building=building&campus=other',
  );
  expect(() => requestedCampus('?campus=../../secret')).toThrow();
});
it('rejects duplicate campuses and remote manifest pointers', () => {
  expect(validCatalogue({ schemaVersion: 1, campuses: [lasuCampus] })).toBe(
    true,
  );
  expect(
    validCatalogue({ schemaVersion: 1, campuses: [lasuCampus, lasuCampus] }),
  ).toBe(false);
  expect(
    validCatalogue({
      schemaVersion: 1,
      campuses: [{ ...lasuCampus, manifestUrl: 'https://elsewhere.test/data' }],
    }),
  ).toBe(false);
  expect(structuralIssues(emptyCampus(lasuCampus))).toEqual([]);
});
it('isolates simultaneous API requests including nested asset calls', async () => {
  const results = await Promise.all(
    ['lasu', 'campus-two'].map((id) =>
      withCampusId(id, async () => {
        await Promise.resolve();
        const read = scopeDatabaseRequest(
          'map_edits?campus_id=eq.other&order=id',
          'GET',
          undefined,
        );
        const write = scopeDatabaseRequest('model_assets', 'POST', {
          id: 'asset',
          campus_id: 'wrong',
        });
        expect(
          new URLSearchParams(read.path.split('?')[1]).get('campus_id'),
        ).toBe(`eq.${id}`);
        expect(write.body).toEqual({ id: 'asset', campus_id: id });
        return currentCampusId();
      }),
    ),
  );
  expect(results).toEqual(['lasu', 'campus-two']);
  expect(currentCampusId()).toBe('lasu');
  expect(scopeDatabaseRequest('admin_users', 'GET', undefined).path).toBe(
    'admin_users',
  );
});
