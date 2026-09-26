/** Private editable source. Render triangles are derived and never serve as editing identities. */
export type Vec3 = [number, number, number];
export type Vec2 = [number, number];
export interface ModelCorner {
  vertex: string;
  uv?: Vec2;
  normal?: Vec3;
}
export interface ModelFace {
  id: string;
  corners: ModelCorner[];
  material: string;
}
export interface ModelTransform {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}
export interface ModelMaterial {
  id: string;
  name: string;
  colour: string;
  opacity: number;
  roughness: number;
  metalness: number;
  doubleSided: boolean;
  baseMap?: string;
  normalMap?: string;
  roughnessMap?: string;
  metalnessMap?: string;
  emissive?: string;
  emissiveMap?: string;
  alphaTest?: number;
  textureSettings?: Partial<
    Record<
      'baseMap' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'emissiveMap',
      {
        flipY: boolean;
        wrapS: number;
        wrapT: number;
        offset: Vec2;
        repeat: Vec2;
        rotation: number;
      }
    >
  >;
}
export interface ModelImage {
  id: string;
  name: string;
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  /** Normalized image bytes; the publisher extracts them into verified package assets. */
  data: string;
}
export type ModelCurveSegment =
  | { id: string; kind: 'line'; end: Vec3 }
  | { id: string; kind: 'bezier'; control1: Vec3; control2: Vec3; end: Vec3 }
  | { id: string; kind: 'arc'; through: Vec3; end: Vec3 };
export interface ModelCurve {
  start: Vec3;
  segments: ModelCurveSegment[];
  closed: boolean;
  depth: number;
}
export interface ModelObject {
  id: string;
  name: string;
  parentId?: string;
  hidden: boolean;
  locked: boolean;
  transform: ModelTransform;
  vertices: Record<string, Vec3>;
  faces: ModelFace[];
  curve?: ModelCurve;
  source?: { kind: 'native' | 'import'; name: string };
}
export interface ArchitecturalCurve {
  id: string;
  partId: string;
  ringId: string;
  startVertexId: string;
  endVertexId: string;
  wallIds: string[];
  vertexIds: string[];
  start: Vec3;
  segment: ModelCurveSegment;
}
export interface ModelDocument {
  version: 1;
  origin: [number, number];
  objects: ModelObject[];
  materials: ModelMaterial[];
  images: ModelImage[];
  curves: ArchitecturalCurve[];
  replaceVisual: boolean;
}
export interface ModelAssetReference {
  version: 1;
  id: string;
  sha256: string;
  bytes: number;
}
export interface MeshSelection {
  objectId: string;
  kind: 'object' | 'vertex' | 'edge' | 'face';
  ids: string[];
}
export const MODEL_LIMITS = {
  objects: 100,
  vertices: 100000,
  faces: 200000,
  documentBytes: 25 * 1024 * 1024,
  imageBytes: 4 * 1024 * 1024,
  images: 32,
};
export const modelId = () => crypto.randomUUID();
export const identityTransform = (): ModelTransform => ({
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
});
export const defaultModelMaterial = (): ModelMaterial => ({
  id: 'default',
  name: 'Surface',
  colour: '#c6cbd1',
  opacity: 1,
  roughness: 0.8,
  metalness: 0,
  doubleSided: false,
});
export const newModelDocument = (origin: [number, number]): ModelDocument => ({
  version: 1,
  origin,
  objects: [],
  materials: [defaultModelMaterial()],
  images: [],
  curves: [],
  replaceVisual: false,
});
export const edgeId = (a: string, b: string) => [a, b].sort().join('|');
export function modelEdges(object: ModelObject) {
  const edges = new Map<
    string,
    { id: string; vertices: [string, string]; faces: string[] }
  >();
  for (const face of object.faces)
    for (let i = 0; i < face.corners.length; i++) {
      const a = face.corners[i].vertex,
        b = face.corners[(i + 1) % face.corners.length].vertex,
        id = edgeId(a, b);
      const edge = edges.get(id) || {
        id,
        vertices: [a, b] as [string, string],
        faces: [],
      };
      edge.faces.push(face.id);
      edges.set(id, edge);
    }
  return [...edges.values()];
}
export function selectedVertices(
  object: ModelObject,
  selection: MeshSelection,
) {
  if (selection.kind === 'object') return Object.keys(object.vertices);
  if (selection.kind === 'vertex')
    return selection.ids.filter((id) => object.vertices[id]);
  if (selection.kind === 'edge')
    return [
      ...new Set(
        modelEdges(object)
          .filter((e) => selection.ids.includes(e.id))
          .flatMap((e) => e.vertices),
      ),
    ];
  return [
    ...new Set(
      object.faces
        .filter((f) => selection.ids.includes(f.id))
        .flatMap((f) => f.corners.map((c) => c.vertex)),
    ),
  ];
}
export const add3 = (a: Vec3, b: Vec3): Vec3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
export const scale3 = (a: Vec3, n: number): Vec3 => [
  a[0] * n,
  a[1] * n,
  a[2] * n,
];
export const length3 = (a: Vec3) => Math.hypot(...a);
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const normal3 = (a: Vec3): Vec3 => scale3(a, 1 / (length3(a) || 1));
export function centre3(points: Vec3[]): Vec3 {
  return scale3(points.reduce(add3, [0, 0, 0]), 1 / (points.length || 1));
}
export function rotate3(p: Vec3, degrees: Vec3): Vec3 {
  let [x, y, z] = p;
  for (let axis = 0; axis < 3; axis++) {
    const r = (degrees[axis] * Math.PI) / 180,
      c = Math.cos(r),
      s = Math.sin(r);
    if (axis === 0) [y, z] = [y * c - z * s, y * s + z * c];
    else if (axis === 1) [x, z] = [x * c + z * s, -x * s + z * c];
    else [x, y] = [x * c - y * s, x * s + y * c];
  }
  return [x, y, z];
}
export function transformPoint(point: Vec3, transform: ModelTransform): Vec3 {
  return add3(
    rotate3(
      point.map((n, i) => n * transform.scale[i]) as Vec3,
      transform.rotation,
    ),
    transform.position,
  );
}
export function inverseTransformPoint(
  point: Vec3,
  transform: ModelTransform,
): Vec3 {
  let result = sub3(point, transform.position);
  for (let axis = 2; axis >= 0; axis--) {
    const angles: Vec3 = [0, 0, 0];
    angles[axis] = -transform.rotation[axis];
    result = rotate3(result, angles);
  }
  return result.map((n, i) => n / transform.scale[i]) as Vec3;
}
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
    if (entries.some(([key, p]) => !id(key) || !vector(p)))
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
  if (
    d.replaceVisual &&
    !d.objects.some((o) => !o.hidden && (o.faces.length || o.curve))
  )
    return ['A replacement visual needs at least one visible object.'];
  return [];
}
