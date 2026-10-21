import {
  LineSegments,
  LineBasicMaterial,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Scene,
} from 'three';
import { createModelRenderMaterial } from './model-render-material';
import type { ModelRenderMaterial } from './model-render-types';
import { MercatorCoordinate, type Map as CampusMap } from 'maplibre-gl';
import type { BuildingModel } from './visual-types';
import { validBuildingModel } from './building-visuals';
import { meshMaterialRole, type MaterialRole } from './map-palette';
import { textureKey } from './building-facades';
import type { FacadeTextureRecipe, SurfaceTextRecipe } from './visual-types';
export function createCampusModelMeshes(
  scene: Scene,
  map: CampusMap,
  origin: MercatorCoordinate,
  scale: number,
) {
  const materials = new Map<
    string,
    {
      value: MeshLambertMaterial | MeshStandardMaterial;
      authoredOpacity?: number;
      users: number;
      colour: string;
      role: MaterialRole;
      themeKey?: string;
      releaseTexture?: () => void;
      recipe?: FacadeTextureRecipe | SurfaceTextRecipe;
    }
  >();
  function release(group: Group) {
    scene.remove(group);
    group.traverse((object) => {
      if (object instanceof LineSegments) {
        object.geometry.dispose();
        (object.material as LineBasicMaterial).dispose();
      }
      if (object instanceof Mesh) {
        object.geometry.dispose();
        const entry = materials.get(object.userData.materialKey);
        if (entry && --entry.users === 0) {
          entry.releaseTexture?.();
          entry.value.dispose();
          materials.delete(object.userData.materialKey);
        }
      }
    });
  }
  function material(
    colour: string,
    role: MaterialRole,
    recipe?: FacadeTextureRecipe | SurfaceTextRecipe,
    authored?: ModelRenderMaterial,
  ) {
    const key = `${colour}:${role}${recipe ? ':' + ('text' in recipe ? JSON.stringify(recipe) : textureKey(recipe)) : ''}${authored ? ':' + JSON.stringify(authored) : ''}`;
    let entry = materials.get(key);
    if (!entry) {
      const custom = authored
        ? createModelRenderMaterial(authored, () => map.triggerRepaint())
        : undefined;
      entry = {
        value:
          custom?.material ||
          new MeshLambertMaterial({
            color: colour,
            side: DoubleSide,
            flatShading: true,
          }),
        users: 0,
        colour,
        role,
        recipe,
        releaseTexture: custom?.release,
        authoredOpacity: authored?.opacity,
      };
      materials.set(key, entry);
    }
    entry.users++;
    return entry.value;
  }
  function building(model: BuildingModel) {
    if (!validBuildingModel(model))
      throw new Error('Invalid campus model geometry.');
    const group = new Group(),
      at = MercatorCoordinate.fromLngLat(model.origin);
    group.userData.buildingId = model.id;
    group.userData.revision = `${model.geometryRevision}:${model.detailRevision || ''}`;
    group.position.set(
      (at.x - origin.x) / scale,
      -(at.y - origin.y) / scale,
      0,
    );
    group.scale.setScalar(at.meterInMercatorCoordinateUnits() / scale);
    for (const part of model.meshes) {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        'position',
        new Float32BufferAttribute(part.positions, 3),
      );
      geometry.setIndex(part.indices);
      if (part.uvs)
        geometry.setAttribute('uv', new Float32BufferAttribute(part.uvs, 2));
      if (part.normals)
        geometry.setAttribute(
          'normal',
          new Float32BufferAttribute(part.normals, 3),
        );
      else geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const role = meshMaterialRole(part.surfaces, part);
      const mesh = new Mesh(
        geometry,
        material(part.colour, role, part.texture || part.text, part.material),
      );
      mesh.userData = {
        buildingId: model.id,
        detail: part.detail,
        minZoom: part.minZoom,
        materialKey: `${part.colour}:${role}${part.text ? ':' + JSON.stringify(part.text) : part.texture ? ':' + textureKey(part.texture) : ''}${part.material ? ':' + JSON.stringify(part.material) : ''}`,
        surfaces: part.surfaces,
      };
      group.add(mesh);
    }
    return group;
  }
  return { materials, release, building };
}
