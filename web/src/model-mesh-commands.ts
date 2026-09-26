import {
  add3,
  centre3,
  cross3,
  edgeId,
  length3,
  modelEdges,
  modelId,
  normal3,
  rotate3,
  scale3,
  selectedVertices,
  sub3,
  transformPoint,
  inverseTransformPoint,
  identityTransform,
  type MeshSelection,
  type ModelCorner,
  type ModelFace,
  type ModelObject,
  type Vec3,
} from './model-document.js';

export type MeshCommand =
  | { kind: 'move' | 'rotate' | 'scale'; value: Vec3 }
  | { kind: 'extrude' | 'inset'; amount: number }
  | { kind: 'subdivide' | 'merge' | 'delete' | 'duplicate' };
export interface MeshCommandResult {
  object: ModelObject;
  selection: MeshSelection;
}
export function faceNormal(object: ModelObject, face: ModelFace): Vec3 {
  const points = face.corners.map((c) => object.vertices[c.vertex]);
  let result: Vec3 = [0, 0, 0];
  for (let i = 0; i < points.length; i++)
    result = add3(result, cross3(points[i], points[(i + 1) % points.length]));
  return normal3(result);
}
const uvBetween = (a: ModelCorner, b: ModelCorner): Pick<ModelCorner, 'uv'> =>
  a.uv && b.uv
    ? { uv: [(a.uv[0] + b.uv[0]) / 2, (a.uv[1] + b.uv[1]) / 2] }
    : {};
function uvAtPoint(object: ModelObject, corners: ModelCorner[], point: Vec3) {
  if (!corners.every((c) => c.uv)) return undefined;
  const dot = (a: Vec3, b: Vec3) => a.reduce((n, v, i) => n + v * b[i], 0),
    a = object.vertices[corners[0].vertex];
  for (let i = 1; i < corners.length - 1; i++) {
    const b = object.vertices[corners[i].vertex],
      c = object.vertices[corners[i + 1].vertex],
      u = sub3(b, a),
      v = sub3(c, a),
      p = sub3(point, a),
      uu = dot(u, u),
      uv = dot(u, v),
      vv = dot(v, v),
      denominator = uu * vv - uv * uv;
    if (Math.abs(denominator) < 1e-10) continue;
    const w1 = (dot(p, u) * vv - dot(p, v) * uv) / denominator,
      w2 = (dot(p, v) * uu - dot(p, u) * uv) / denominator,
      w0 = 1 - w1 - w2;
    if (Math.min(w0, w1, w2) >= -1e-6)
      return [0, 1].map(
        (j) =>
          corners[0].uv![j] * w0 +
          corners[i].uv![j] * w1 +
          corners[i + 1].uv![j] * w2,
      ) as [number, number];
  }
  return undefined;
}

export function meshCommand(
  source: ModelObject,
  selection: MeshSelection,
  command: MeshCommand,
): MeshCommandResult {
  if (source.locked) throw new Error('Unlock the object before editing it.');
  if (source.curve)
    throw new Error(
      'Convert the curve to an editable mesh before editing vertices or faces.',
    );
  if (
    (command.kind === 'extrude' || command.kind === 'inset') &&
    JSON.stringify(source.transform) !== JSON.stringify(identityTransform())
  ) {
    const world = {
      ...source,
      transform: identityTransform(),
      vertices: Object.fromEntries(
        Object.entries(source.vertices).map(([id, point]) => [
          id,
          transformPoint(point, source.transform),
        ]),
      ),
    };
    const result = meshCommand(world, selection, command);
    result.object.vertices = Object.fromEntries(
      Object.entries(result.object.vertices).map(([id, point]) => [
        id,
        inverseTransformPoint(point, source.transform),
      ]),
    );
    result.object.transform = structuredClone(source.transform);
    return result;
  }
  const object = structuredClone(source),
    ids = selectedVertices(object, selection),
    vertices = new Set(ids);
  const result: MeshCommandResult = {
    object,
    selection: structuredClone(selection),
  };
  if (!ids.length)
    throw new Error('Select an object or mesh components first.');
  if ('value' in command) {
    if (!command.value.every(Number.isFinite))
      throw new Error('Enter finite transform values.');
    if (
      command.kind === 'scale' &&
      command.value.some((v) => Math.abs(v) < 0.00001)
    )
      throw new Error('Scale must not collapse an axis.');
    const centre = centre3(
      ids.map((id) => transformPoint(object.vertices[id], object.transform)),
    );
    for (const id of ids) {
      const point = transformPoint(object.vertices[id], object.transform),
        local = sub3(point, centre);
      object.vertices[id] = inverseTransformPoint(
        command.kind === 'move'
          ? add3(point, command.value)
          : add3(
              centre,
              command.kind === 'rotate'
                ? rotate3(local, command.value)
                : (local.map((v, i) => v * command.value[i]) as Vec3),
            ),
        object.transform,
      );
    }
    // Imported normals no longer describe the modified surface.
    for (const face of object.faces)
      if (face.corners.some((c) => vertices.has(c.vertex)))
        face.corners.forEach((c) => {
          delete c.normal;
        });
    return result;
  }
  if (command.kind === 'delete') {
    if (selection.kind === 'object') {
      object.faces = [];
      object.vertices = {};
    } else if (selection.kind === 'face')
      object.faces = object.faces.filter((f) => !selection.ids.includes(f.id));
    else if (selection.kind === 'edge') {
      const affected = new Set(
        modelEdges(object)
          .filter((e) => selection.ids.includes(e.id))
          .flatMap((e) => e.faces),
      );
      object.faces = object.faces.filter((f) => !affected.has(f.id));
    } else
      object.faces = object.faces.filter(
        (f) => !f.corners.some((c) => vertices.has(c.vertex)),
      );
    prune(object);
    result.selection.ids = [];
    return result;
  }
  if (command.kind === 'merge') {
    if (selection.kind !== 'vertex' || ids.length < 2)
      throw new Error('Select at least two vertices to merge.');
    const retained = ids[0];
    object.vertices[retained] = centre3(ids.map((id) => object.vertices[id]));
    for (const face of object.faces) {
      face.corners = face.corners.map((c) =>
        vertices.has(c.vertex)
          ? { ...c, vertex: retained, normal: undefined }
          : c,
      );
      face.corners = face.corners.filter(
        (c, i, all) => all.findIndex((v) => v.vertex === c.vertex) === i,
      );
    }
    object.faces = object.faces.filter((f) => f.corners.length >= 3);
    prune(object);
    result.selection.ids = object.vertices[retained] ? [retained] : [];
    return result;
  }
  const faces = object.faces.filter(
    (f) =>
      selection.kind === 'object' ||
      (selection.kind === 'face' && selection.ids.includes(f.id)),
  );
  if (!faces.length) throw new Error('Select faces for this operation.');
  if (command.kind === 'duplicate') {
    const replacements = new Map<string, string>();
    const duplicate = faces.map((face) => ({
      ...structuredClone(face),
      id: modelId(),
      corners: face.corners.map((c) => {
        let id = replacements.get(c.vertex);
        if (!id) {
          id = modelId();
          replacements.set(c.vertex, id);
          object.vertices[id] = add3(object.vertices[c.vertex], [1, 0, 0]);
        }
        return { ...structuredClone(c), vertex: id };
      }),
    }));
    object.faces.push(...duplicate);
    result.selection = {
      objectId: object.id,
      kind: 'face',
      ids: duplicate.map((f) => f.id),
    };
    return result;
  }
  if (command.kind === 'subdivide') {
    const selected = new Set(faces.map((f) => f.id)),
      midpoints = new Map<string, string>();
    const next: ModelFace[] = [];
    for (const face of faces) {
      const centre = modelId();
      object.vertices[centre] = centre3(
        face.corners.map((c) => object.vertices[c.vertex]),
      );
      const uv = face.corners.every((c) => c.uv)
        ? face.corners.reduce(
            (a, c) => [
              a[0] + c.uv![0] / face.corners.length,
              a[1] + c.uv![1] / face.corners.length,
            ],
            [0, 0],
          )
        : undefined;
      for (let i = 0; i < face.corners.length; i++) {
        const c = face.corners[i],
          n = face.corners[(i + 1) % face.corners.length],
          p = face.corners[(i + face.corners.length - 1) % face.corners.length];
        const mid = (a: ModelCorner, b: ModelCorner) => {
          const key = edgeId(a.vertex, b.vertex);
          let id = midpoints.get(key);
          if (!id) {
            id = modelId();
            midpoints.set(key, id);
            object.vertices[id] = scale3(
              add3(object.vertices[a.vertex], object.vertices[b.vertex]),
              0.5,
            );
          }
          return { vertex: id, ...uvBetween(a, b) };
        };
        next.push({
          id: i === 0 ? face.id : modelId(),
          material: face.material,
          corners: [
            { ...c, normal: undefined },
            mid(c, n),
            { vertex: centre, ...(uv ? { uv: uv as [number, number] } : {}) },
            mid(p, c),
          ],
        });
      }
    }
    // Split adjacent unselected edges too, avoiding T-junctions.
    object.faces = object.faces
      .filter((f) => !selected.has(f.id))
      .map((f) => ({
        ...f,
        corners: f.corners.flatMap((c, i) => {
          const n = f.corners[(i + 1) % f.corners.length],
            mid = midpoints.get(edgeId(c.vertex, n.vertex));
          return mid ? [c, { vertex: mid, ...uvBetween(c, n) }] : [c];
        }),
      }));
    object.faces.push(...next);
    result.selection = {
      objectId: object.id,
      kind: 'face',
      ids: next.map((f) => f.id),
    };
    return result;
  }
  if (!('amount' in command)) throw new Error('Unsupported mesh operation.');
  if (!Number.isFinite(command.amount) || Math.abs(command.amount) > 500)
    throw new Error('Enter a distance within 500 metres.');
  if (command.kind === 'inset') {
    if (faces.length !== 1) throw new Error('Inset one face at a time.');
    const face = faces[0],
      centre = centre3(face.corners.map((c) => object.vertices[c.vertex]));
    if (command.amount <= 0)
      throw new Error('Inset distance must be positive.');
    const old = structuredClone(face.corners);
    const normal = faceNormal(object, face);
    if (
      old.some(
        (c) =>
          Math.abs(
            sub3(object.vertices[c.vertex], centre).reduce(
              (n, v, i) => n + v * normal[i],
              0,
            ),
          ) > 0.001,
      )
    )
      throw new Error(
        'Inset requires a planar face. Flatten it or select a triangle.',
      );
    face.corners = old.map((c, i) => {
      const p = object.vertices[c.vertex],
        previous =
          object.vertices[old[(i + old.length - 1) % old.length].vertex],
        next = object.vertices[old[(i + 1) % old.length].vertex];
      const inward = normal3(cross3(normal, sub3(next, p))),
        prior = normal3(cross3(normal, sub3(p, previous))),
        direction = normal3(add3(inward, prior));
      const dot = direction.reduce((sum, n, j) => sum + n * inward[j], 0),
        distance = command.amount / dot;
      if (
        dot < 0.00001 ||
        direction.reduce((sum, n, j) => sum + n * (centre[j] - p[j]), 0) <= 0 ||
        distance >= length3(sub3(centre, p)) * 0.9
      )
        throw new Error('Inset requires a convex face and a smaller distance.');
      const id = modelId();
      object.vertices[id] = add3(p, scale3(direction, distance));
      return {
        ...c,
        vertex: id,
        uv: uvAtPoint(source, old, object.vertices[id]) || c.uv,
        normal: undefined,
      };
    });
    old.forEach((c, i) => {
      const j = (i + 1) % old.length;
      object.faces.push({
        id: modelId(),
        material: face.material,
        corners: [c, old[j], face.corners[j], face.corners[i]].map((c) => ({
          ...c,
          normal: undefined,
        })),
      });
    });
    return result;
  }
  // Extrude a selected patch along its averaged normal, leaving shared neighbours intact.
  const selected = new Set(faces.map((f) => f.id)),
    edges = modelEdges(object);
  if (
    edges.some(
      (e) => e.faces.length > 2 && e.faces.some((id) => selected.has(id)),
    )
  )
    throw new Error(
      'Extrusion requires a manifold face selection. Repair intersecting edges first.',
    );
  const normals = faces.map((f) => faceNormal(object, f)),
    normal = normal3(normals.reduce(add3, [0, 0, 0]));
  if (length3(normal) < 0.1)
    throw new Error('Choose faces with a consistent outward direction.');
  const duplicate = new Map<string, string>();
  for (const face of faces)
    for (const c of face.corners)
      if (!duplicate.has(c.vertex)) {
        const id = modelId();
        object.vertices[id] = add3(
          object.vertices[c.vertex],
          scale3(normal, command.amount),
        );
        duplicate.set(c.vertex, id);
      }
  const old = structuredClone(faces);
  for (const face of faces)
    face.corners = face.corners.map((c) => ({
      ...c,
      vertex: duplicate.get(c.vertex)!,
      normal: undefined,
    }));
  for (const face of old)
    for (let i = 0; i < face.corners.length; i++) {
      const a = face.corners[i],
        b = face.corners[(i + 1) % face.corners.length],
        edge = edges.find((e) => e.id === edgeId(a.vertex, b.vertex))!;
      if (edge.faces.filter((id) => selected.has(id)).length !== 1) continue;
      const sideLength = length3(
        sub3(object.vertices[b.vertex], object.vertices[a.vertex]),
      );
      object.faces.push({
        id: modelId(),
        material: face.material,
        corners: [
          { ...a, uv: [0, 0] as [number, number] },
          { ...b, uv: [sideLength, 0] as [number, number] },
          {
            ...b,
            vertex: duplicate.get(b.vertex)!,
            uv: [sideLength, Math.abs(command.amount)] as [number, number],
          },
          {
            ...a,
            vertex: duplicate.get(a.vertex)!,
            uv: [0, Math.abs(command.amount)] as [number, number],
          },
        ].map((c) => ({ ...c, normal: undefined })),
      });
    }
  prune(object);
  return result;
}
function prune(object: ModelObject) {
  const used = new Set(
    object.faces.flatMap((f) => f.corners.map((c) => c.vertex)),
  );
  for (const id of Object.keys(object.vertices))
    if (!used.has(id)) delete object.vertices[id];
}
