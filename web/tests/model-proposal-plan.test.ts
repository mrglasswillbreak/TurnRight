import { expect, it } from 'vitest';
import { newModelDocument } from '../src/model-document';
import { primitive } from '../src/model-primitives';
import { campusFixture } from './fixture';
import { publishedRecords } from '../server/release-validation';
import {
  assertReadback,
  assetEdit,
  checkProposals,
  digest,
  modelChanges,
  protectedCampusHash,
  requireApplyGuards,
  type Proposal,
} from '../../scripts/model-proposal-plan.mts';
import type { MapEdit } from '../src/types';
import type { CampusPackage } from '../src/types';
import { assertManifestPin } from '../../scripts/model-proposal-baseline.mts';
import { evidenceHash } from '../../scripts/cloud.mjs';

function fixture() {
  const data = campusFixture();
  const geometry = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [3.204, 6.465],
        [3.2042, 6.465],
        [3.2042, 6.4652],
        [3.204, 6.465],
      ],
    ],
  };
  data.map.features.push({
    type: 'Feature',
    geometry,
    properties: { id: 'proposal', kind: 'building', name: 'Reviewed building' },
  });
  const document = newModelDocument([3.204, 6.465]);
  document.objects = [primitive('box')];
  const bytes = Buffer.from(JSON.stringify(document));
  const proposal: Proposal = {
    id: 'proposal',
    slug: 'proposal',
    document,
    bytes: bytes.length,
    sha256: digest(bytes),
    footprintSha256: digest(JSON.stringify(geometry)),
    baseline: data.version,
  };
  return { data, proposal };
}
it('preserves saved geometry and all non-model authoring fields and uses immutable references', () => {
  const { data, proposal } = fixture();
  const saved: MapEdit = {
    id: proposal.id,
    kind: 'building',
    geometry: data.map.features.at(-1)!.geometry,
    properties: {
      name: 'Owner correction',
      height: 11,
      customEvidence: 'retain',
      mapLayerId: 'map-layer:original',
    },
    updated_at: '2026-11-01T00:00:00Z',
  };
  const [change] = modelChanges([proposal], data, data, [saved]);
  expect(change.expectedUpdatedAt).toBe(saved.updated_at);
  expect(change.edit.geometry).toEqual(saved.geometry);
  expect(change.edit.properties).toMatchObject(saved.properties);
  expect(saved.properties.modelDocument).toBeUndefined();
  const reference = {
    id: crypto.randomUUID(),
    version: 1 as const,
    sha256: proposal.sha256,
    bytes: proposal.bytes,
  };
  const item = assetEdit(change, reference);
  expect(item.edit.properties.modelDocument).toBeUndefined();
  expect(item.edit.properties.modelDocumentAsset).toEqual(reference);
  expect(() => assetEdit(change, { ...reference, bytes: 1 })).toThrow(
    'differs',
  );
});
it('rejects moved footprints, changed published baselines, missing buildings and deleted corrections', () => {
  const { data, proposal } = fixture();
  const moved = structuredClone(data);
  moved.map.features.at(-1)!.geometry = {
    type: 'Point',
    coordinates: [3.2, 6.46],
  };
  expect(() => modelChanges([proposal], data, moved, [])).toThrow('moved');
  expect(() =>
    modelChanges([{ ...proposal, baseline: 'other' }], data, data, []),
  ).toThrow('baseline');
  expect(() =>
    modelChanges([{ ...proposal, id: 'missing' }], data, data, []),
  ).toThrow('missing');
  expect(() =>
    modelChanges([proposal], data, data, [
      {
        id: proposal.id,
        kind: 'building',
        geometry: data.map.features.at(-1)!.geometry,
        properties: {},
        deleted: true,
      },
    ]),
  ).toThrow('deleted');
});
it('requires the complete inventory, bounded documents and both reviewed hashes before apply', () => {
  const { proposal } = fixture();
  expect(() => checkProposals([proposal], ['proposal'])).not.toThrow();
  expect(() => checkProposals([proposal])).toThrow('inventory');
  expect(() =>
    checkProposals([{ ...proposal, bytes: 26214401 }], ['proposal']),
  ).toThrow('25 MiB');
  expect(() => requireApplyGuards('workspace', 'plan')).toThrow(
    'workspace hash',
  );
  expect(() =>
    requireApplyGuards('workspace', 'plan', 'workspace', 'old'),
  ).toThrow('plan hash');
  expect(() =>
    requireApplyGuards('workspace', 'plan', 'workspace', 'plan', true, ''),
  ).toThrow('reason');
  expect(() =>
    requireApplyGuards('workspace', 'plan', 'workspace', 'plan'),
  ).not.toThrow();
});
it('readback detects unrelated workspace writes and altered saved models', () => {
  const { data, proposal } = fixture();
  const before = { features: publishedRecords(data), edits: [] };
  const [change] = modelChanges([proposal], data, data, []);
  const item = assetEdit(change, {
    id: crypto.randomUUID(),
    version: 1,
    bytes: proposal.bytes,
    sha256: proposal.sha256,
  });
  const after = {
    ...before,
    edits: [{ ...item.edit, updated_at: 'server-time' }],
  };
  expect(() => assertReadback(before, after, [item])).not.toThrow();
  expect(() =>
    assertReadback(before, { ...after, attributes: [] }, [item]),
  ).toThrow('Protected');
  const wrong = structuredClone(after);
  wrong.edits[0].properties.name = 'Unexpected';
  expect(() => assertReadback(before, wrong, [item])).toThrow('readback');
});
it('protected campus digest ignores only source/review fields and catches geometry and route edits', () => {
  const { data, proposal } = fixture();
  const changed = structuredClone(data);
  changed.map.features.at(-1)!.properties!.modelDocument = proposal.document;
  changed.map.features.at(-1)!.properties!.reviewedModelRevision = 'reviewed';
  expect(protectedCampusHash(changed)).toBe(protectedCampusHash(data));
  changed.map.features.reverse();
  expect(protectedCampusHash(changed)).toBe(protectedCampusHash(data));
  changed.map.features.reverse();
  changed.map.features.at(-1)!.properties!.name = 'Lost correction';
  expect(protectedCampusHash(changed)).not.toBe(protectedCampusHash(data));
});
it('pins every public manifest field and photo asset even when the version is unchanged', () => {
  const manifest = {
    version: 'baseline',
    dataUrl: '/core.json',
    assets: [
      { url: '/core.json', bytes: 10, sha256: 'core' },
      { url: '/packages/photos/photo.webp', bytes: 20, sha256: 'photo' },
    ],
  } as CampusPackage;
  const pin = {
    campus: 'lasu',
    version: 'baseline',
    manifestHash: evidenceHash(manifest),
    campusSha256: 'core',
    assetCount: 2,
    photoAssets: 1,
    buildingCount: 614,
  };
  expect(() => assertManifestPin(manifest, pin)).not.toThrow();
  const changed = structuredClone(manifest);
  changed.assets[1].sha256 = 'different-photo';
  expect(() => assertManifestPin(changed, pin)).toThrow(
    'full published LASU manifest',
  );
});
