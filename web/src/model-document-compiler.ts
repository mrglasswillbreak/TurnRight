import { ShapeUtils, Vector2 } from 'three';
import type { ModelMesh } from './visual-types.js';
import type { ModelRenderMaterial } from './model-render-types.js';
import {
  add3,
  cross3,
  length3,
  normal3,
  rotate3,
  sub3,
  transformPoint,
  type ModelDocument,
  type Vec3,
} from './model-document.js';
import { curveMesh } from './model-primitives.js';
import { faceNormal } from './model-mesh-commands.js';
export function compileModelDocument(
  document: ModelDocument,
  origin: [number, number],
): ModelMesh[] {
  const k = (Math.PI / 180) * 6371008.8;
  const offset: Vec3 = [
    (document.origin[0] - origin[0]) *
      k *
      Math.cos((origin[1] * Math.PI) / 180),
    (document.origin[1] - origin[1]) * k,
    0,
  ];
  const meshes: ModelMesh[] = [];
  for (const source of document.objects) {
    let parent = source.parentId,
      visible = !source.hidden;
    while (parent) {
      const p = document.objects.find((o) => o.id === parent);
      if (!p) break;
      visible &&= !p.hidden;
      parent = p.parentId;
    }
    if (!visible) continue;
    const object = source.curve
      ? {
          ...curveMesh(source.curve, source.name,source.faces[0]?.material),
          id: source.id,
          transform: source.transform,
        }
      : source;
    const materials = new Map<string, ModelMesh>();
    for (const face of object.faces) {
      const material =
        document.materials.find((m) => m.id === face.material) ||
        document.materials[0];
      if (!material) continue;
      let mesh = materials.get(material.id);
      if (!mesh) {
        const {
          baseMap,
          normalMap,
          roughnessMap,
          metalnessMap,
          emissiveMap,
          ...values
        } = material;
        const render: ModelRenderMaterial = { ...values, maps: {} };
        for (const [slot, id] of Object.entries({
          baseMap,
          normalMap,
          roughnessMap,
          metalnessMap,
          emissiveMap,
        })) {
          const image = document.images.find((i) => i.id === id);
          if (image)
            render.maps![
              slot as keyof NonNullable<ModelRenderMaterial['maps']>
            ] = `data:${image.mime};base64,${image.data}`;
        }
        mesh = {
          positions: [],
          indices: [],
          normals: [],
          uvs: [],
          colour: material.colour,
          material: render,
          surfaces: [],
        };
        materials.set(material.id, mesh);
      }
      const points = face.corners.map((c) =>
        add3(
          transformPoint(object.vertices[c.vertex], object.transform),
          offset,
        ),
      );
      const normal = normal3(
        points
          .slice(1, -1)
          .reduce(
            (n, p, i) =>
              add3(
                n,
                cross3(sub3(p, points[0]), sub3(points[i + 2], points[0])),
              ),
            [0, 0, 0] as Vec3,
          ),
      );
      if (length3(normal) < 0.5) continue;
      const axis = normal
        .map(Math.abs)
        .indexOf(Math.max(...normal.map(Math.abs)));
      const flat = points.map((p) =>
        axis === 0
          ? new Vector2(p[1], p[2])
          : axis === 1
            ? new Vector2(p[0], p[2])
            : new Vector2(p[0], p[1]),
      );
      const triangles = ShapeUtils.triangulateShape(flat, []),
        base = mesh.positions.length / 3,
        start = mesh.indices.length / 3;
      if (!triangles.length) continue;
      const sourceNormal = faceNormal(object, face);
      points.forEach((p, i) => {
        mesh!.positions.push(...p);
        const corner = face.corners[i];
        const n = normal3(
          rotate3(
            (corner.normal || sourceNormal).map(
              (v, j) => v / object.transform.scale[j],
            ) as Vec3,
            object.transform.rotation,
          ),
        );
        mesh!.normals!.push(...n);
        mesh!.uvs!.push(...(corner.uv || [0, 0]));
      });
      for (const t of triangles) {
        const n = cross3(
          sub3(points[t[1]], points[t[0]]),
          sub3(points[t[2]], points[t[0]]),
        );
        if (n.reduce((sum, v, i) => sum + v * normal[i], 0) < 0) t.reverse();
        mesh.indices.push(...t.map((i) => base + i));
      }
      mesh.surfaces!.push({
        start,
        count: triangles.length,
        partId: source.id,
        role: 'trim',
        objectId: source.id,
        faceId: face.id,
      });
    }
    meshes.push(...materials.values());
  }
  return meshes;
}
