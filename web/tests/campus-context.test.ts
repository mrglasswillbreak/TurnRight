import { validateEdit, applyEdits } from '../src/editor-model';
import { EditorWorkspace } from '../src/editor-workspace';
import { acceptSample, newSurvey } from '../src/survey-model';
import {
  publishedRecords,
  validateReleaseSnapshot,
} from '../server/release-validation';
import type { MapEdit } from '../src/types';
import { afterEach, expect, it, vi } from 'vitest';
import {
  insideCampusMappingArea,
  campusKey,
  campusUrl,
  emptyCampus,
  lasuCampus,
  requestedCampus,
  validCatalogue,
  restorePublicCampus,
  rememberPublicCampus,
} from '../src/campus-context';
import { structuralIssues } from '../src/validation';
import {
  scopeDatabaseRequest,
  withCampusId,
  currentCampusId,
} from '../server/campus-scope';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('retains legacy LASU links and separates preferences and public editor links', () => {
  expect(requestedCampus('')).toBe('lasu');
  expect(campusKey('saved', 'lasu')).toBe('saved');
  expect(campusKey('saved', 'other')).toBe('campus:other:saved');
  expect(campusUrl('/admin?building=building', 'other')).toBe(
    '/admin?building=building&campus=other',
  );
  const preview = 'https://review.example.test/?view=public#map';
  expect(new URL(campusUrl(preview, 'unilag'), preview).href).toBe(
    'https://review.example.test/?view=public&campus=unilag#map',
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
it.each([undefined, 'campus-release-job'])(
  'isolates simultaneous API requests from the job campus %s',
  async (jobCampus) => {
    vi.stubEnv('CAMPUS_ID', jobCampus);
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
    expect(currentCampusId()).toBe(jobCampus || 'lasu');
    expect(scopeDatabaseRequest('admin_users', 'GET', undefined).path).toBe(
      'admin_users',
    );
  },
);
const unilag = {
  id: 'campus-unilag',
  slug: 'unilag',
  name: 'UNILAG',
  bounds: [
    [3.383488, 6.499619],
    [3.404971, 6.524281],
  ] as [[number, number], [number, number]],
};
const unilagPath = (): MapEdit => ({
  id: 'arcgis:ozolua',
  kind: 'path',
  geometry: {
    type: 'LineString',
    coordinates: [
      [3.391, 6.51],
      [3.392, 6.511],
    ],
  },
  properties: { name: 'OZOLUA RD.', access: 'yes' },
});
it('validates every edit kind in its own campus and rejects cross-campus coordinates', () => {
  for (const kind of [
    'path',
    'building',
    'place',
    'entrance',
    'barrier',
    'closure',
  ] as const) {
    const edit = unilagPath();
    edit.kind = kind;
    if (kind === 'place' || kind === 'entrance')
      edit.geometry = { type: 'Point', coordinates: [3.391, 6.51] };
    if (kind === 'building')
      edit.geometry = {
        type: 'Polygon',
        coordinates: [
          [
            [3.391, 6.51],
            [3.392, 6.51],
            [3.392, 6.511],
            [3.391, 6.51],
          ],
        ],
      };
    expect(validateEdit(edit, unilag), kind).toEqual([]);
    expect(validateEdit(edit, lasuCampus).join(' '), kind).toContain(
      'selected campus',
    );
  }
  expect(
    validateEdit(
      {
        ...unilagPath(),
        geometry: { type: 'Point', coordinates: [NaN, 6.51] },
      },
      unilag,
    ).length,
  ).toBeGreaterThan(0);
});
it('retains approaches while rejecting distant and malformed coordinates, including wrapped extents', () => {
  expect(insideCampusMappingArea([3.381, 6.51], unilag)).toBe(true);
  expect(insideCampusMappingArea([3.37, 6.51], unilag)).toBe(false);
  expect(insideCampusMappingArea([181, 6.51], unilag)).toBe(false);
  expect(insideCampusMappingArea([3.391, Infinity], unilag)).toBe(false);
  const dateline = {
    bounds: [
      [179.9, -1],
      [-179.9, 1],
    ] as [[number, number], [number, number]],
  };
  expect(insideCampusMappingArea([-179.95, 0], dateline)).toBe(true);
  expect(insideCampusMappingArea([179.95, 0], dateline)).toBe(true);
  expect(insideCampusMappingArea([0, 0], dateline)).toBe(false);
});
it('saves, recovers and publishes UNILAG edits without changing the LASU baseline', async () => {
  const send = vi.fn(async (batch) =>
    batch.edits.map((item: { edit: MapEdit }) => ({
      ...item.edit,
      updated_at: '2026-09-27T18:00:00Z',
    })),
  );
  const persist = vi.fn(async () => {});
  const workspace = new EditorWorkspace([], send, persist, null, unilag);
  workspace.commit([unilagPath()]);
  expect(await workspace.flush()).toBe(true);
  expect(send).toHaveBeenCalledOnce();
  const reopened = new EditorWorkspace(
    workspace.saved,
    send,
    persist,
    workspace.recoveryCopy(),
    unilag,
  );
  expect(reopened.edits[0].properties.name).toBe('OZOLUA RD.');
  const base = emptyCampus(unilag);
  const result = applyEdits(base, reopened.edits);
  expect(result.errors).toEqual([]);
  expect(result.data.graph.edges).toHaveLength(2);
  expect(result.data.graph.edges.every((edge) => edge.accessible)).toBe(true);
  expect(base.graph.edges).toEqual([]);
  const lasu = emptyCampus(lasuCampus);
  expect(applyEdits(lasu, reopened.edits).errors.join(' ')).toContain(
    'selected campus',
  );
  expect(lasu.graph.edges).toEqual([]);
  expect(
    validateReleaseSnapshot(
      { features: publishedRecords(base), edits: reopened.edits },
      base,
    ).graph.edges,
  ).toHaveLength(2);
  workspace.commit([
    {
      ...unilagPath(),
      geometry: {
        type: 'LineString',
        coordinates: [
          [3.2, 6.46],
          [3.201, 6.461],
        ],
      },
    },
  ]);
  expect(await workspace.flush()).toBe(false);
  expect(send).toHaveBeenCalledOnce();
  expect(workspace.recoveryCopy().edits[0].geometry).toEqual(
    workspace.edits[0].geometry,
  );
});
it('records in UNILAG and rejects a LASU fix without joining the gap', () => {
  const recording = newSurvey('owner', 'unilag-v1');
  const fix = (coordinates: [number, number], timestamp: number) => ({
    coordinates,
    timestamp,
    accuracy: 5,
    heading: null,
    speed: null,
  });
  expect(
    acceptSample(recording, fix([3.391, 6.51], 100000), 100000, unilag).status,
  ).toBe('accepted');
  expect(
    acceptSample(recording, fix([3.2, 6.46], 105000), 105000, unilag).status,
  ).toBe('outside');
  expect(
    acceptSample(recording, fix([3.39103, 6.51], 110000), 110000, unilag)
      .status,
  ).toBe('accepted');
  expect(recording.session.segments).toHaveLength(2);
});

it('restores the last public campus before loading and makes LASU switches explicit', () => {
  const replaceState = vi.fn();
  vi.stubGlobal('location', new URL('https://map.test/'));
  vi.stubGlobal('localStorage', { getItem: () => 'unilag' });
  vi.stubGlobal('history', { state: { retained: true }, replaceState });
  restorePublicCampus();
  expect(replaceState).toHaveBeenCalledOnce();
  expect(replaceState.mock.calls[0][2].href).toBe('https://map.test/?campus=unilag');
  expect(replaceState.mock.calls[0][0]).toEqual({ retained: true });
  expect(campusUrl('/', 'lasu')).toBe('/?campus=lasu');
});
it.each(['/?campus=lasu', '/?campus=unilag', '/?place=senate', '/?building=legacy', '/#map', '/admin', '/auth/callback'])(
  'does not replace an explicit or legacy link %s with the remembered campus', (path) => {
    const replaceState = vi.fn();
    vi.stubGlobal('location', new URL(path, 'https://map.test'));
    vi.stubGlobal('localStorage', { getItem: () => 'unilag' });
    vi.stubGlobal('history', { replaceState });
    restorePublicCampus();
    expect(replaceState).not.toHaveBeenCalled();
  },
);
it.each([null, '', '../../private', 'https://elsewhere.test', 'UNILAG'])(
  'ignores missing or malformed remembered campus %s', (saved) => {
    const replaceState = vi.fn();
    vi.stubGlobal('location', new URL('https://map.test/'));
    vi.stubGlobal('localStorage', { getItem: () => saved });
    vi.stubGlobal('history', { replaceState });
    restorePublicCampus();
    expect(replaceState).not.toHaveBeenCalled();
  },
);
it('remembers campus choice and stays usable when browser storage is unavailable', () => {
  const setItem = vi.fn();
  vi.stubGlobal('localStorage', { setItem });
  rememberPublicCampus('unilag');
  rememberPublicCampus('lasu');
  expect(setItem.mock.calls).toEqual([['turnright:last-campus', 'unilag'], ['turnright:last-campus', 'lasu']]);
  vi.stubGlobal('location', new URL('https://map.test/'));
  vi.stubGlobal('localStorage', { getItem: () => { throw Error('Blocked'); }, setItem: () => { throw Error('Full'); } });
  expect(() => restorePublicCampus()).not.toThrow();
  expect(() => rememberPublicCampus('unilag')).not.toThrow();
});
