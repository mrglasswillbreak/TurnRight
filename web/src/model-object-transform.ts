import { Euler, Quaternion } from 'three';
import {
  add3,
  centre3,
  rotate3,
  sub3,
  transformPoint,
  type ModelObject,
  type ModelDocument,
  type Vec3,
} from './model-document';
import { curveMesh } from './model-primitives';
/** Object transforms preserve parametric curves and their component identities. */
export function transformModelObject(
  source: ModelObject,
  kind: 'move' | 'rotate' | 'scale',
  value: Vec3,
): ModelObject {
  if (source.locked) throw new Error('Unlock the object before editing it.');
  if (!value.every(Number.isFinite))
    throw new Error('Enter finite transform values.');
  const object = structuredClone(source),
    t = object.transform;
  if (kind === 'move') {
    t.position = add3(t.position, value);
    return object;
  }
  const shape = source.curve ? curveMesh(source.curve, source.name) : source,
    centre = centre3(Object.values(shape.vertices)),
    worldCentre = transformPoint(centre, t);
  if (kind === 'rotate') {
    const radians = (v: Vec3) => v.map((n) => (n * Math.PI) / 180) as Vec3;
    const rotation = new Quaternion().setFromEuler(
      new Euler(...radians(t.rotation), 'ZYX'),
    );
    rotation.premultiply(
      new Quaternion().setFromEuler(new Euler(...radians(value), 'ZYX')),
    );
    const e = new Euler().setFromQuaternion(rotation, 'ZYX');
    t.rotation = [e.x, e.y, e.z].map((n) => (n * 180) / Math.PI) as Vec3;
  } else {
    if (value.some((n) => n <= 0.00001 || n > 1000))
      throw new Error(
        'Scale factors must be positive and no greater than 1000.',
      );
    if (
      t.rotation.some((n) => Math.abs(n) > 0.0001) &&
      Math.max(...value) - Math.min(...value) > 0.0001
    )
      throw new Error(
        'Use uniform scale for a rotated parametric object, or convert it to a mesh for component scaling.',
      );
    t.scale = t.scale.map((n, i) => n * value[i]) as Vec3;
  }
  t.position = sub3(
    worldCentre,
    rotate3(centre.map((n, i) => n * t.scale[i]) as Vec3, t.rotation),
  );
  return object;
}

export function modelDescendants(document: ModelDocument, id: string) {
  const ids = new Set([id]);
  let size = -1;
  while (size !== ids.size) {
    size = ids.size;
    for (const object of document.objects)
      if (object.parentId && ids.has(object.parentId)) ids.add(object.id);
  }
  return document.objects.filter((object) => ids.has(object.id));
}

/** Imported hierarchy is organisational; apply world transforms to its descendants once. */
export function transformModelHierarchy(
  document: ModelDocument,
  id: string,
  kind: 'move' | 'rotate' | 'scale',
  value: Vec3,
): ModelDocument {
  const members = modelDescendants(document, id);
  if (members.some((object) => object.locked))
    throw new Error(
      'Unlock the object and its children before editing this group.',
    );
  const worldPoints = (object: ModelObject) =>
    Object.values(
      object.curve
        ? curveMesh(object.curve, object.name).vertices
        : object.vertices,
    ).map((p) => transformPoint(p, object.transform));
  const points = members.flatMap(worldPoints);
  const pivot = points.length ? centre3(points) : ([0, 0, 0] as Vec3);
  const replacements = new Map(
    members.map((object) => {
      const ownPoints = worldPoints(object);
      const centre = ownPoints.length
        ? centre3(ownPoints)
        : object.transform.position;
      const next = transformModelObject(object, kind, value);
      if (kind !== 'move') {
        const offset = sub3(centre, pivot);
        const target = add3(
          pivot,
          kind === 'rotate'
            ? rotate3(offset, value)
            : (offset.map((n, i) => n * value[i]) as Vec3),
        );
        next.transform.position = add3(
          next.transform.position,
          sub3(target, centre),
        );
      }
      return [object.id, next];
    }),
  );
  return {
    ...document,
    objects: document.objects.map(
      (object) => replacements.get(object.id) || object,
    ),
  };
}
