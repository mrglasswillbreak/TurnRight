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
import { publicCampus } from '../../scripts/public-campus.mjs';
import { buildingRevision } from '../src/building-visuals';
import { detailFixture } from './model-detail-fixture';
import { publicationInputs } from '../server/gis-publication';

it('retains the rendered geometry fingerprint after stripping the editable source', () => {
  const { feature, document } = detailFixture();
  const data = publicCampus({ map: { features: [feature] } });
  const published = data.map.features[0];
  expect(published.properties!.modelDocument).toBeUndefined();
  expect(published.properties!.authoredModelRevision).toBe(
    modelDocumentRevision(document),
  );
  expect(buildingRevision(published)).toBe(buildingRevision(feature));
});

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

it('bounds the sanitized navigation payload while retaining reviewed hydrated models for compilation', () => {
  const data = campusFixture();
  const edits: MapEdit[] = [0, 1].map((index) => {
    const longitude = 3.204 + index * 0.001;
    const document = newModelDocument([longitude, 6.465]);
    document.objects = [primitive('box')];
    document.images = Array.from({ length: 4 }, (_, image) => ({
      id: `image-${image}`,
      name: 'Bounded embedded texture',
      mime: 'image/png',
      data: 'A'.repeat(3_200_000),
    }));
    return {
      id: `authored-${index}`,
      kind: 'building',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [longitude, 6.465],
            [longitude + 0.0002, 6.465],
            [longitude + 0.0002, 6.4652],
            [longitude, 6.4652],
            [longitude, 6.465],
          ],
        ],
      },
      properties: {
        name: `Authored ${index}`,
        height: 6,
        heightMode: 'metres',
        modelDocument: document,
        reviewedModelRevision: modelDocumentRevision(document),
      },
    };
  });
  const snapshot = { features: publishedRecords(data), edits };
  expect(Buffer.byteLength(JSON.stringify(edits))).toBeGreaterThan(25_000_000);
  const result = validateReleaseSnapshot(snapshot, data);
  for (const edit of edits) {
    const feature = result.map.features.find(
      (f) => f.properties?.id === edit.id,
    )!;
    expect(feature.properties!.reviewedModelRevision).toBe(
      edit.properties.reviewedModelRevision,
    );
    expect(feature.properties!.modelDocument.images).toHaveLength(4);
    expect(feature.properties!.modelDocument.images[0].data.length).toBe(
      3_200_000,
    );
  }
  const published = publicCampus(result);
  expect(Buffer.byteLength(JSON.stringify(published))).toBeLessThan(25_000_000);
  expect(
    published.map.features.every((f) => !f.properties?.modelDocument),
  ).toBe(true);
  expect(result.graph.edges).toEqual(data.graph.edges);
  result.coverage.notes = ['A'.repeat(25_000_000)];
  expect(() => publicationInputs(snapshot).decorate(result)).toThrow('25 MB');
}, 15000);
