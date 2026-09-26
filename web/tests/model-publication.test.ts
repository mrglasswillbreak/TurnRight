import { expect, it } from 'vitest';
import { newModelDocument } from '../src/model-document';
import { primitive } from '../src/model-primitives';
import { modelDocumentRevision } from '../src/model-document-revision';
import {
  publishedRecords,
  validateReleaseSnapshot,
} from '../server/release-validation';
import { campusFixture } from './fixture';
import type { MapEdit } from '../src/types';
// @ts-expect-error Shared Node publication sanitiser.
import { publicCampus } from '../../scripts/public-campus.mjs';

it('requires the current authored revision to be reviewed before publication', () => {
  const data = campusFixture(),
    document = newModelDocument([3.204, 6.465]);
  document.objects = [primitive('box')];
  const edit: MapEdit = {
    id: 'authored',
    kind: 'building',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [3.204, 6.465],
          [3.2042, 6.465],
          [3.2042, 6.4652],
          [3.204, 6.4652],
          [3.204, 6.465],
        ],
      ],
    },
    properties: {
      name: 'Authored',
      height: 6,
      heightMode: 'metres',
      modelDocument: document,
    },
  };
  const snapshot = { features: publishedRecords(data), edits: [edit] };
  expect(() => validateReleaseSnapshot(snapshot, data)).toThrow(
    /review the authored geometry/,
  );
  edit.properties.reviewedModelRevision = modelDocumentRevision(document);
  expect(() => validateReleaseSnapshot(snapshot, data)).not.toThrow();
  const changed = structuredClone(document);
  changed.objects[0].transform.position[0] = 1;
  edit.properties.modelDocument = changed;
  expect(() => validateReleaseSnapshot(snapshot, data)).toThrow(
    /review the authored geometry/,
  );
  delete edit.properties.modelDocument;
  edit.properties.modelDocumentAsset = {
    version: 1,
    id: crypto.randomUUID(),
    sha256: 'a'.repeat(64),
    bytes: 123,
  };
  expect(() => validateReleaseSnapshot(snapshot, data)).toThrow(
    /must be loaded/,
  );
});

it('strips private topology, history and asset references while retaining the compiled revision', () => {
  const result = publicCampus({
    map: {
      features: [
        {
          properties: {
            id: 'b',
            modelDocument: { objects: ['private'] },
            modelDocumentAsset: { id: 'secret' },
            modelAuthoring: { history: ['private'] },
            reviewedModelRevision: 'private',
            authoredRevision: 'public-content-hash',
          },
        },
      ],
    },
  });
  expect(result.map.features[0].properties).toEqual({
    id: 'b',
    authoredRevision: 'public-content-hash',
  });
});
