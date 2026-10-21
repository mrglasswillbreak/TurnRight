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
  imagePixels: 16 * 1024 * 1024,
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
export {
  validTextureSettings,
  modelDocumentErrors,
} from './model-document-validation.js';
