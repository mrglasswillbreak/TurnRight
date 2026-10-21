import type { RefObject } from 'react';
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
} from 'three';
import type { BuildingModel, ModelMesh } from './visual-types';
import type { CampusData } from './types';
import { createFacadeTextures } from './facade-textures';
import { buildingOutline } from './building-outline';
import { detailInstanceId } from './model-instances';
import { createModelRenderMaterial } from './model-render-material';
import type { ModelPreviewScene } from './model-preview-scene';
import { type PhotoPreviewProps } from './photo-preview-types.js';
export function updatePreviewSelection({
  current,
  clearHighlights,
  model,
  group,
  meshPose,
  highlights,
  draw,
}: {
  current: RefObject<PhotoPreviewProps>;
  clearHighlights: () => void;
  model: BuildingModel | undefined;
  group: Group;
  meshPose: Parameters<ModelPreviewScene['alignMesh']>[0];
  highlights: Group;
  draw: () => void;
}): void {
  clearHighlights();
  const {
    selection,
    wallId,
    hidden = [],
    surfaceEditing,
    surface: frame,
  } = current.current;
  if (!model) return;
  for (const mesh of group.children) {
    if (!(mesh instanceof Mesh)) continue;
    const part = mesh.userData.part as ModelMesh;
    if (
      mesh.userData.filterKey !==
      JSON.stringify([hidden, surfaceEditing, frame?.kind, frame?.key])
    ) {
      const triangles: number[] = [],
        excluded = new Set(hidden);
      let surface = 0;
      for (let t = 0; t < part.indices.length / 3; t++) {
        while (
          part.surfaces?.[surface] &&
          t >= part.surfaces[surface].start + part.surfaces[surface].count
        )
          surface++;
        const s = part.surfaces?.[surface];
        const inSurface =
          !surfaceEditing ||
          !frame ||
          frame.kind === 'footprint' ||
          (frame.kind === 'wall'
            ? s?.wallId === frame.key
            : s?.partId === frame.key);
        if (
          inSurface &&
          (!s?.elementId ||
            (!excluded.has(s.elementId) &&
              !excluded.has(
                detailInstanceId(s.elementId, s.instanceIndex || 0),
              )))
        )
          triangles.push(t);
      }
      mesh.geometry.setIndex(
        triangles.flatMap((t) => part.indices.slice(t * 3, t * 3 + 3)),
      );
      mesh.userData.filterKey = JSON.stringify([
        hidden,
        surfaceEditing,
        frame?.kind,
        frame?.key,
      ]);
      mesh.userData.triangles = triangles;
    }
    const material = mesh.material as MeshLambertMaterial;
    const obscuring =
      !!meshPose &&
      !part.surfaces?.some((s) => s.objectId === meshPose!.objectId);
    material.transparent =
      obscuring ||
      !!part.text ||
      (part.material?.opacity ?? 1) < 1 ||
      (!!surfaceEditing && frame?.kind === 'footprint');
    material.opacity = obscuring
      ? 0.12
      : surfaceEditing && frame?.kind === 'footprint'
        ? 0.22
        : (part.material?.opacity ?? 1);
    material.depthWrite = !material.transparent;
    const selected = selection || { buildingId: model.id, wallId };
    if (!selected.wallId && !selected.elementId && !selected.partId) continue;
    const positions = buildingOutline(part, selected);
    if (positions.length) {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        'position',
        new Float32BufferAttribute(positions, 3),
      );
      highlights.add(
        new LineSegments(
          geometry,
          new LineBasicMaterial({ color: '#168aff', depthTest: false }),
        ),
      );
    }
  }
  draw();
}

export function clearPreviewHighlights(highlights: Group): void {
  for (const o of highlights.children.slice()) {
    highlights.remove(o);
    if (o instanceof LineSegments) {
      o.geometry.dispose();
      (o.material as LineBasicMaterial).dispose();
    }
  }
}

export function clearPreviewMeshes(group: Group): void {
  for (const o of group.children.slice()) {
    group.remove(o);
    if (o instanceof Mesh || o instanceof LineSegments) {
      o.geometry.dispose();
      (o.material as MeshLambertMaterial).dispose();
    }
  }
}

export function fillPreviewMeshes({
  model,
  group,
  releases,
  draw,
  textures,
  data,
}: {
  model: BuildingModel;
  group: Group;
  releases: (() => void)[];
  draw: () => void;
  textures: ReturnType<typeof createFacadeTextures>;
  data: CampusData;
}): void {
  for (const part of model!.meshes) {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute(part.positions, 3),
    );
    geometry.setIndex(part.indices);
    if (part.normals)
      geometry.setAttribute(
        'normal',
        new Float32BufferAttribute(part.normals, 3),
      );
    else geometry.computeVertexNormals();
    if (part.uvs)
      geometry.setAttribute('uv', new Float32BufferAttribute(part.uvs, 2));
    const authored = part.material
      ? createModelRenderMaterial(part.material, draw)
      : undefined;
    if (authored) releases.push(authored.release);
    const material =
      authored?.material ||
      new MeshLambertMaterial({
        color: part.colour,
        side: DoubleSide,
      });
    const rendered = new Mesh(geometry, material);
    rendered.userData.part = part;
    group.add(rendered);
    if (part.texture || part.text)
      releases.push(
        textures.acquire((part.texture || part.text)!, data, (t) => {
          material.map = t;
          material.transparent = !!part.text;
          material.alphaTest = part.text ? 0.03 : 0;
          material.color.set('#ffffff');
          material.needsUpdate = true;
        }),
      );
  }
}
