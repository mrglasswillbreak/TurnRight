import { expect, it } from 'vitest';
import { newModelDocument, type ModelImage } from '../src/model-document';
import { primitive } from '../src/model-primitives';
import { modelDocumentRevision } from '../src/model-document-revision';
import { projectModelTexture } from '../src/model-texture-projection';
import { validModelPhotoEvidence } from '../src/model-photo-evidence';

const image: ModelImage = {
  id: 'photo-derivative',
  name: 'Wall photograph',
  mime: 'image/png',
  data: 'AQID',
  evidence: {
    photoId: 'approved-photo',
    corners: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    modifications: 'Perspective crop',
  },
};
it('rejects crossed, reversed and degenerate photo provenance crops', () => {
  expect(validModelPhotoEvidence(image.evidence)).toBe(true);
  for (const corners of [
    [
      [0, 0],
      [1, 1],
      [1, 0],
      [0, 1],
    ],
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ],
    [
      [0, 0],
      [0, 0],
      [1, 1],
      [0, 1],
    ],
  ])
    expect(
      validModelPhotoEvidence({
        ...image.evidence!,
        corners: corners as [number, number][],
      }),
    ).toBe(false);
});
it('projects selected planar faces without changing other faces or the source document', () => {
  const document = newModelDocument([3.2, 6.46]),
    object = primitive('box');
  document.objects.push(object);
  const before = structuredClone(document),
    face = object.faces[0];
  const next = projectModelTexture(
    document,
    { objectId: object.id, kind: 'face', ids: [face.id, object.faces[1].id] },
    image,
  );
  expect(document).toEqual(before);
  expect(next.objects[0].faces.slice(2)).toEqual(object.faces.slice(2));
  expect(
    new Set(
      next.objects[0].faces
        .slice(0, 2)
        .flatMap((f) => f.corners.map((c) => JSON.stringify(c.uv))),
    ),
  ).toEqual(new Set(['[0,0]', '[0,1]', '[1,0]', '[1,1]']));
  expect(next.materials.at(-1)?.baseMap).toBe(image.id);
  expect(next.images[0].evidence).toEqual(image.evidence);
  expect(modelDocumentRevision(next)).not.toBe(modelDocumentRevision(document));
});
it('rejects locked, empty, and non-coplanar selections', () => {
  const document = newModelDocument([0, 0]),
    object = primitive('box');
  document.objects.push(object);
  expect(() =>
    projectModelTexture(
      document,
      { objectId: object.id, kind: 'object', ids: [] },
      image,
    ),
  ).toThrow(/one plane/);
  expect(() =>
    projectModelTexture(
      document,
      { objectId: object.id, kind: 'face', ids: [] },
      image,
    ),
  ).toThrow(/at least one/);
  object.locked = true;
  expect(() =>
    projectModelTexture(
      document,
      { objectId: object.id, kind: 'face', ids: [object.faces[0].id] },
      image,
    ),
  ).toThrow(/unlocked/);
});
