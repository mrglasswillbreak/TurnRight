import {
  modelDocumentErrors,
  type ModelDocument,
  type Vec3,
} from './model-document';
import type { ModelImport, ModelImportOptions } from './model-file-types';
export function placeImportedModel(
  current: ModelDocument,
  result: ModelImport,
  options: ModelImportOptions,
): ModelDocument {
  if (
    !Number.isFinite(options.scale) ||
    options.scale <= 0 ||
    options.scale > 1000
  )
    throw new Error('Choose finite import units.');
  const imported = structuredClone(result.document);
  const convert = (p: Vec3): Vec3 =>
    (options.up === 'y' ? [p[0], -p[2], p[1]] : p).map(
      (n) => n * options.scale,
    ) as Vec3;
  const points = imported.objects.flatMap((o) =>
    Object.values(o.vertices).map(convert),
  );
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const p of points)
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p[i]);
      max[i] = Math.max(max[i], p[i]);
    }
  const offset = options.centre
    ? [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, min[2]]
    : [0, 0, 0];
  for (const object of imported.objects) {
    for (const [id, p] of Object.entries(object.vertices))
      object.vertices[id] = convert(p).map((n, i) => n - offset[i]) as Vec3;
    for (const face of object.faces)
      for (const corner of face.corners)
        if (corner.normal && options.up === 'y')
          corner.normal = [
            corner.normal[0],
            -corner.normal[2],
            corner.normal[1],
          ];
  }
  const next = {
    ...current,
    objects: [...current.objects, ...imported.objects],
    materials: [...current.materials, ...imported.materials],
    images: [...current.images, ...imported.images],
  };
  const errors = modelDocumentErrors(next);
  if (errors.length) throw new Error(errors.join(' '));
  return next;
}
