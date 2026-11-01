import { createHash } from 'node:crypto';
import {
  MODEL_LIMITS,
  modelDocumentErrors,
  type ModelDocument,
  type Vec2,
  type Vec3,
} from '../../web/src/model-document';
import { compileModelDocument } from '../../web/src/model-document-compiler';

const round = (values: number[], decimals: number) =>
  values.map((value) => Number(value.toFixed(decimals)));
const distance = (a: number[], b: number[]) =>
  Math.hypot(...a.map((value, i) => value - b[i]));
const cross = ([p, q, r]: Vec3[]): Vec3 => {
  const a = q.map((n, i) => n - p[i]),
    b = r.map((n, i) => n - p[i]);
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
};
const geometry = (document: ModelDocument) => {
  const meshes = compileModelDocument(document, document.origin);
  const bounds = [0, 1, 2].map(() => [Infinity, -Infinity]);
  for (const mesh of meshes)
    for (let i = 0; i < mesh.positions.length; i++) {
      bounds[i % 3][0] = Math.min(bounds[i % 3][0], mesh.positions[i]);
      bounds[i % 3][1] = Math.max(bounds[i % 3][1], mesh.positions[i]);
    }
  return {
    bounds,
    triangles: meshes.reduce((sum, mesh) => sum + mesh.indices.length / 3, 0),
  };
};

/** Numeric compaction only: editable identities, connectivity and image bytes stay intact. */
export function quantizeImportedMesh(source: ModelDocument) {
  const errors = modelDocumentErrors(source);
  if (errors.length) throw Error(errors.join(' '));
  if (
    source.curves.length ||
    source.objects.some(
      (object) =>
        object.curve ||
        object.transform.position.some((n) => n !== 0) ||
        object.transform.rotation.some((n) => n !== 0) ||
        object.transform.scale.some((n) => n !== 1),
    )
  )
    throw Error(
      'Compaction requires imported meshes with identity transforms.',
    );
  const document = structuredClone(source);
  let maxPositionErrorMetres = 0,
    maxNormalError = 0,
    maxUvError = 0;
  for (const [index, object] of document.objects.entries()) {
    const original = source.objects[index];
    for (const [id, point] of Object.entries(original.vertices)) {
      const compact = round(point, 6) as Vec3;
      object.vertices[id] = compact;
      maxPositionErrorMetres = Math.max(
        maxPositionErrorMetres,
        distance(point, compact),
      );
    }
    for (const face of object.faces) {
      for (const corner of face.corners) {
        if (corner.normal) {
          const compact = round(corner.normal, 8) as Vec3;
          maxNormalError = Math.max(
            maxNormalError,
            distance(corner.normal, compact),
          );
          if (Math.abs(Math.hypot(...compact) - 1) > 0.001)
            throw Error('Compaction changed a unit normal.');
          corner.normal = compact;
        }
        if (corner.uv) {
          const compact = round(corner.uv, 8) as Vec2;
          maxUvError = Math.max(maxUvError, distance(corner.uv, compact));
          corner.uv = compact;
        }
      }
      const before = cross(
        face.corners.slice(0, 3).map((c) => original.vertices[c.vertex]),
      );
      const after = cross(
        face.corners.slice(0, 3).map((c) => object.vertices[c.vertex]),
      );
      const area = Math.hypot(...after);
      if (
        area < 1e-18 ||
        before.reduce((sum, n, i) => sum + n * after[i], 0) <= 0 ||
        (face.corners[0].normal &&
          after.reduce((sum, n, i) => sum + n * face.corners[0].normal![i], 0) /
            area <
            -0.001)
      )
        throw Error('Compaction would degenerate or reverse a face.');
    }
  }
  const before = geometry(source),
    after = geometry(document);
  const maxBoundsErrorMetres = Math.max(
    ...before.bounds.flatMap((range, axis) =>
      range.map((n, side) => Math.abs(n - after.bounds[axis][side])),
    ),
  );
  if (
    maxPositionErrorMetres >= 1e-6 ||
    maxBoundsErrorMetres >= 1e-6 ||
    maxNormalError > 1e-8 ||
    maxUvError > 1e-8 ||
    before.triangles !== after.triangles
  )
    throw Error('Compaction exceeded its precision or topology tolerance.');
  const compactErrors = modelDocumentErrors(document);
  if (compactErrors.length) throw Error(compactErrors.join(' '));
  return {
    document,
    verification: {
      positionGridMetres: 1e-6,
      normalGrid: 1e-8,
      uvGrid: 1e-8,
      maxPositionErrorMetres,
      maxNormalError,
      maxUvError,
      maxBoundsErrorMetres,
      boundsBeforeMetres: before.bounds,
      boundsAfterMetres: after.bounds,
      trianglesBefore: before.triangles,
      trianglesAfter: after.triangles,
      topologyAndIdentitiesPreserved: true,
      normalsAndWindingVerified: true,
    },
  };
}

/** Preserve full precision unless the finished document exceeds the existing upload limit. */
export function compactImportedModel(source: ModelDocument) {
  const original = JSON.stringify(source);
  const bytesBefore = Buffer.byteLength(original);
  if (bytesBefore <= MODEL_LIMITS.documentBytes)
    return { document: source, quantization: undefined };
  const { document, verification } = quantizeImportedMesh(source);
  const bytesAfter = Buffer.byteLength(JSON.stringify(document));
  if (bytesAfter > MODEL_LIMITS.documentBytes)
    throw Error(
      'Compacted editable model still exceeds the 25 MiB upload limit.',
    );
  return {
    document,
    quantization: {
      ...verification,
      method: 'decimal-mesh-v1',
      sourceDocumentSha256: createHash('sha256').update(original).digest('hex'),
      bytesBefore,
      bytesAfter,
      uploadLimitBytes: MODEL_LIMITS.documentBytes,
    },
  };
}
