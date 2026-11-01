import {
  assertSimpleProfile,
  curvePoint,
  curveProfile,
} from './model-curves.js';
import { validModelPhotoEvidence } from './model-photo-evidence.js';
import {
  type Vec3,
  type ModelCurveSegment,
  type ModelDocument,
  MODEL_LIMITS,
  transformPoint,
} from './model-document.js';
export function validTextureSettings(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(
    ([slot, s]) =>
      [
        'baseMap',
        'normalMap',
        'roughnessMap',
        'metalnessMap',
        'emissiveMap',
      ].includes(slot) &&
      s &&
      typeof s.flipY === 'boolean' &&
      [1000, 1001, 1002].includes(s.wrapS) &&
      [1000, 1001, 1002].includes(s.wrapT) &&
      [s.offset, s.repeat].every(
        (v) =>
          Array.isArray(v) &&
          v.length === 2 &&
          v.every((n) => Number.isFinite(n) && Math.abs(n) < 1e6),
      ) &&
      Number.isFinite(s.rotation) &&
      Math.abs(s.rotation) < 1e6,
  );
}

export function modelDocumentErrors(value: unknown): string[] {
  if (value === undefined) return [];
  const d = value as ModelDocument;
  const vector = (v: unknown, limit = 2000): v is Vec3 =>
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((n) => Number.isFinite(n) && Math.abs(n) <= limit);
  const id = (v: unknown): v is string =>
    typeof v === 'string' &&
    /^[\w:.-]{1,240}$/.test(v) &&
    !['__proto__', 'constructor', 'prototype'].includes(v);
  const colour = (v: unknown) =>
    typeof v === 'string' && /^#[a-f\d]{6}$/i.test(v);
  if (
    !d ||
    d.version !== 1 ||
    !Array.isArray(d.origin) ||
    d.origin.length !== 2 ||
    !d.origin.every(Number.isFinite) ||
    Math.abs(d.origin[0]) > 180 ||
    Math.abs(d.origin[1]) > 85 ||
    !Array.isArray(d.objects) ||
    !Array.isArray(d.materials) ||
    !Array.isArray(d.images) ||
    !Array.isArray(d.curves) ||
    typeof d.replaceVisual !== 'boolean'
  )
    return ['Invalid editable model document.'];
  if (
    d.objects.length > MODEL_LIMITS.objects ||
    d.materials.length > 200 ||
    d.images.length > MODEL_LIMITS.images ||
    d.curves.length > 1000
  )
    return [
      'The editable model exceeds its object, curve, material, or image limit.',
    ];
  const unique = (items: { id: string }[]) =>
    items.every((i) => i && id(i.id)) &&
    new Set(items.map((i) => i.id)).size === items.length;
  if (![d.objects, d.materials, d.images, d.curves].every(unique))
    return [
      'Model object, material, image, and curve identities must be unique.',
    ];
  if (
    d.images.some(
      (i) =>
        !['image/png', 'image/jpeg', 'image/webp'].includes(i.mime) ||
        typeof i.name !== 'string' ||
        typeof i.data !== 'string' ||
        (i.evidence !== undefined && !validModelPhotoEvidence(i.evidence)) ||
        i.data.length > (MODEL_LIMITS.imageBytes * 4) / 3 + 4 ||
        !/^[a-z\d+/]*={0,2}$/i.test(i.data),
    )
  )
    return ['Model textures must be bounded PNG, JPEG, or WebP images.'];
  const images = new Set(d.images.map((i) => i.id)),
    materials = new Set(d.materials.map((m) => m.id));
  if (
    d.materials.some(
      (m) =>
        typeof m.name !== 'string' ||
        m.name.length > 240 ||
        !colour(m.colour) ||
        ![m.opacity, m.roughness, m.metalness].every(
          (n) => Number.isFinite(n) && n >= 0 && n <= 1,
        ) ||
        typeof m.doubleSided !== 'boolean' ||
        !validTextureSettings(m.textureSettings) ||
        [
          m.baseMap,
          m.normalMap,
          m.roughnessMap,
          m.metalnessMap,
          m.emissiveMap,
        ].some((v) => v !== undefined && !images.has(v)) ||
        (m.emissive !== undefined && !colour(m.emissive)) ||
        (m.alphaTest !== undefined &&
          (!Number.isFinite(m.alphaTest) ||
            m.alphaTest < 0 ||
            m.alphaTest > 1)),
    )
  )
    return ['Check model materials and texture references.'];
  const segment = (s: ModelCurveSegment) =>
    s &&
    id(s.id) &&
    vector(s.end) &&
    (s.kind === 'line' ||
      (s.kind === 'bezier' && vector(s.control1) && vector(s.control2)) ||
      (s.kind === 'arc' && vector(s.through)));
  let vertices = 0,
    faces = 0;
  for (const object of d.objects) {
    if (
      typeof object.name !== 'string' ||
      (object.detailTier !== undefined &&
        !['structure', 'facade', 'fine'].includes(object.detailTier)) ||
      object.name.length > 240 ||
      typeof object.hidden !== 'boolean' ||
      typeof object.locked !== 'boolean' ||
      !object.transform ||
      !vector(object.transform.position) ||
      !vector(object.transform.rotation, 36000) ||
      !vector(object.transform.scale, 1000) ||
      object.transform.scale.some((n) => Math.abs(n) < 0.00001) ||
      !object.vertices ||
      typeof object.vertices !== 'object' ||
      Array.isArray(object.vertices) ||
      !Array.isArray(object.faces) ||
      !unique(object.faces)
    )
      return ['Check mesh names, transforms, and face identities.'];
    const entries = Object.entries(object.vertices);
    vertices += entries.length;
    faces += object.faces.length;
    if (
      entries.some(
        ([key, p]) =>
          !id(key) ||
          !vector(p) ||
          !vector(transformPoint(p, object.transform)),
      )
    )
      return [
        'Mesh vertices must have stable identities and finite local coordinates within 2 km.',
      ];
    if (
      object.faces.some(
        (f) =>
          !materials.has(f.material) ||
          !Array.isArray(f.corners) ||
          f.corners.length < 3 ||
          f.corners.length > 128 ||
          new Set(f.corners.map((c) => c?.vertex)).size !== f.corners.length ||
          f.corners.some(
            (c) =>
              !c ||
              !Object.hasOwn(object.vertices, c.vertex) ||
              (c.uv !== undefined &&
                (!Array.isArray(c.uv) ||
                  c.uv.length !== 2 ||
                  !c.uv.every(
                    (n) => Number.isFinite(n) && Math.abs(n) < 1e6,
                  ))) ||
              (c.normal !== undefined && !vector(c.normal, 2)),
          ),
      )
    )
      return ['A mesh face has invalid vertices, UVs, normals, or material.'];
    if (
      object.curve &&
      (!vector(object.curve.start) ||
        !Array.isArray(object.curve.segments) ||
        !object.curve.segments.length ||
        object.curve.segments.length > 500 ||
        !unique(object.curve.segments) ||
        !object.curve.segments.every(segment) ||
        typeof object.curve.closed !== 'boolean' ||
        !Number.isFinite(object.curve.depth) ||
        object.curve.depth < 0 ||
        object.curve.depth > 500)
    )
      return ['Check the curve profile and extrusion depth.'];
    if (
      object.parentId &&
      (!d.objects.some((o) => o.id === object.parentId) ||
        object.parentId === object.id)
    )
      return ['Missing model parent.'];
    if (object.curve) {
      try {
        const points = curveProfile(object.curve);
        assertSimpleProfile(points);
        if (
          !object.curve.closed ||
          points.length < 3 ||
          points.length > 4096 ||
          points.some(
            (p) =>
              !vector(transformPoint(p, object.transform)) ||
              !vector(
                transformPoint(
                  [p[0], p[1], p[2] + object.curve!.depth],
                  object.transform,
                ),
              ) ||
              Math.abs(p[2] - points[0][2]) > 0.001,
          )
        )
          return [
            'A curve profile needs a closed horizontal outline within the model bounds, with at most 4096 points.',
          ];
        let area = 0;
        for (let i = 0; i < points.length; i++)
          area +=
            points[i][0] * points[(i + 1) % points.length][1] -
            points[(i + 1) % points.length][0] * points[i][1];
        if (Math.abs(area) < 0.0002)
          return ['The curve profile has no surface area.'];
      } catch (error) {
        return [
          error instanceof Error ? error.message : 'Invalid curve profile.',
        ];
      }
    }
    const visited = new Set([object.id]);
    let parent = object.parentId;
    while (parent) {
      if (visited.has(parent)) return ['Model hierarchy contains a cycle.'];
      visited.add(parent);
      parent = d.objects.find((o) => o.id === parent)?.parentId;
    }
  }
  if (vertices > MODEL_LIMITS.vertices || faces > MODEL_LIMITS.faces)
    return ['The editable model exceeds 100,000 vertices or 200,000 faces.'];
  if (
    d.curves.some(
      (c) =>
        !id(c.partId) ||
        !id(c.ringId) ||
        !id(c.startVertexId) ||
        !id(c.endVertexId) ||
        !Array.isArray(c.wallIds) ||
        !c.wallIds.every(id) ||
        !Array.isArray(c.vertexIds) ||
        !c.vertexIds.every(id) ||
        !vector(c.start) ||
        !segment(c.segment),
    )
  )
    return ['Invalid architectural curve references.'];
  try {
    for (const curve of d.curves) curvePoint(curve.start, curve.segment, 0.5);
  } catch (error) {
    return [
      error instanceof Error ? error.message : 'Invalid architectural curve.',
    ];
  }
  if (
    d.replaceVisual &&
    !d.objects.some((o) => !o.hidden && (o.faces.length || o.curve))
  )
    return ['A replacement visual needs at least one visible object.'];
  return [];
}
