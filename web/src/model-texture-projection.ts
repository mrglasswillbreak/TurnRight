import { faceNormal } from './model-mesh-commands';
import {
  cross3,
  normal3,
  sub3,
  modelId,
  modelDocumentErrors,
  type MeshSelection,
  type ModelDocument,
  type ModelImage,
  type Vec3,
} from './model-document';

/** Assign a separate material only to the selected coplanar faces. No shared material is overwritten. */
export function projectModelTexture(
  document: ModelDocument,
  selection: MeshSelection,
  image: ModelImage,
): ModelDocument {
  const next = structuredClone(document),
    object = next.objects.find((o) => o.id === selection.objectId);
  if (!object || object.locked || object.curve)
    throw new Error(
      'Select unlocked mesh faces; convert a curve to a mesh first.',
    );
  if (!['object', 'face'].includes(selection.kind))
    throw new Error('Select faces for photographic projection.');
  const faces =
    selection.kind === 'face'
      ? object.faces.filter((f) => selection.ids.includes(f.id))
      : object.faces;
  if (!faces.length) throw new Error('Select at least one face.');
  const normal = faceNormal(object, faces[0]),
    origin = object.vertices[faces[0].corners[0].vertex];
  const dot = (a: Vec3, b: Vec3) => a.reduce((n, v, i) => n + v * b[i], 0);
  if (
    faces.some(
      (f) =>
        dot(faceNormal(object, f), normal) < 0.999 ||
        f.corners.some(
          (c) =>
            Math.abs(dot(sub3(object.vertices[c.vertex], origin), normal)) >
            0.01,
        ),
    )
  )
    throw new Error(
      'Choose faces on one plane with the same outward direction.',
    );
  const u = normal3(
      cross3(Math.abs(normal[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1], normal),
    ),
    v = normal3(cross3(normal, u));
  const points = faces.flatMap((f) =>
    f.corners.map((c) => object.vertices[c.vertex]),
  );
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const point of points) {
    const x = dot(point, u),
      y = dot(point, v);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const width = maxX - minX,
    height = maxY - minY;
  if (width < 0.001 || height < 0.001)
    throw new Error('The selected surface has no usable area.');
  const source = next.materials.find((m) => m.id === faces[0].material)!;
  const material = {
    ...source,
    id: modelId(),
    name: `${source.name.slice(0, 220)} · photograph`,
    colour: '#ffffff',
    baseMap: image.id,
    textureSettings: {
      ...source.textureSettings,
      baseMap: {
        flipY: true,
        wrapS: 1001,
        wrapT: 1001,
        offset: [0, 0] as [number, number],
        repeat: [1, 1] as [number, number],
        rotation: 0,
      },
    },
  };
  next.images.push(image);
  next.materials.push(material);
  for (const face of faces) {
    face.material = material.id;
    for (const corner of face.corners) {
      const point = object.vertices[corner.vertex];
      corner.uv = [
        (dot(point, u) - minX) / width,
        (dot(point, v) - minY) / height,
      ];
    }
  }
  const errors = modelDocumentErrors(next);
  if (errors.length) throw new Error(errors.join(' '));
  return next;
}
