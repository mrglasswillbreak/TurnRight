import {
  AmbientLight,
  LineSegments,
  LineBasicMaterial,
  BufferGeometry,
  Camera,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Raycaster,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  MercatorCoordinate,
  type CustomLayerInterface,
  type Map as CampusMap,
  type PointLike,
} from 'maplibre-gl';
import type { CampusData, Position } from './types';
import type {
  BuildingModel,
  SectorModels,
  VisualSector,
  BuildingSelection,
} from './visual-types';
import {
  compatibleVisual,
  detailAtZoom,
  visibleSectors,
  visualLookup,
  validBuildingModel,
} from './building-visuals';
import { hashBytes, ASSET_CACHE } from './offline';
import { buildingOutline } from './building-outline';
import { CAMPUS_MIN_ZOOM } from './world-map';
import { meshMaterialRole, type MaterialRole } from './map-palette';
import { textureKey } from './building-facades';
import { createFacadeTextures } from './facade-textures';
import type { FacadeTextureRecipe } from './visual-types';

export type ModelStatus = 'ready' | 'reduced' | 'unavailable';

export interface ModelOptions {
  data: CampusData;
  enabled: boolean;
  dark: boolean;
  selectedId: string;
  selection?: BuildingSelection;
  opacity?: number;
  overrides?: {
    model: BuildingModel;
    visual: import('./visual-types').BuildingVisual;
  }[];
  onReady: (ids: string[]) => void;
  onStatus: (status: ModelStatus) => void;
}
/** A single shared WebGL context. Sector meshes are decoded only while in view. */
export function createCampusModels(map: CampusMap, initial: ModelOptions) {
  let options = initial,
    disposed = false,
    reduced = false,
    fallback = false,
    lastFrame = 0,
    slowFrames = 0;
  const scene = new Scene(),
    camera = new Camera(),
    raycaster = new Raycaster();
  const ambient = new AmbientLight('#fff1d5', 1.6),
    sun = new DirectionalLight('#ffffff', 1.8);
  sun.position.set(-80, -120, 220);
  scene.add(ambient, sun);
  const drafts = new Map<string, Group>();
  const loaded = new Map<string, Group>(),
    inflight = new Map<string, AbortController>(),
    failures = new Map<string, number>();
  const materials = new Map<
    string,
    {
      value: MeshLambertMaterial;
      users: number;
      colour: string;
      role: MaterialRole;
      themeKey?: string;
      releaseTexture?: () => void;
      recipe?: FacadeTextureRecipe;
    }
  >();
  let renderer: WebGLRenderer | undefined;
  const textures = createFacadeTextures(() => map.triggerRepaint());
  let indexedData = initial.data,
    visuals = visualLookup(initial.data.visuals),
    features = new Map(
      initial.data.map.features.map((f) => [String(f.properties?.id), f]),
    );
  const anchor: Position = [
    (initial.data.bounds[0][0] + initial.data.bounds[1][0]) / 2,
    (initial.data.bounds[0][1] + initial.data.bounds[1][1]) / 2,
  ];
  const origin = MercatorCoordinate.fromLngLat(anchor),
    scale = origin.meterInMercatorCoordinateUnits();
  const world = new Matrix4()
    .makeTranslation(origin.x, origin.y, origin.z)
    .scale(new Vector3(scale, -scale, scale));
  let readyKey = '';
  const publish = () => {
    const ids = [
      ...loaded.values(),
      ...[...drafts.values()].map((g) => ({
        visible: g.visible,
        children: [g],
      })),
    ]
      .filter((g) => g.visible)
      .flatMap((g) =>
        g.children
          .filter((b) => b.visible)
          .map((b) => String(b.userData.buildingId)),
      )
      .sort();
    const key = ids.join('|');
    if (key !== readyKey) {
      readyKey = key;
      options.onReady(ids);
    }
  };
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
    recipe?: FacadeTextureRecipe,
  ) {
    const key = `${colour}:${role}${recipe ? ':' + textureKey(recipe) : ''}`;
    let entry = materials.get(key);
    if (!entry) {
      entry = {
        value: new MeshLambertMaterial({
          color: colour,
          side: DoubleSide,
          flatShading: true,
        }),
        users: 0,
        colour,
        role,
        recipe,
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
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const role = meshMaterialRole(part.surfaces, part);
      const mesh = new Mesh(
        geometry,
        material(part.colour, role, part.texture),
      );
      mesh.userData = {
        buildingId: model.id,
        detail: part.detail,
        materialKey: `${part.colour}:${role}${part.texture ? ':' + textureKey(part.texture) : ''}`,
        surfaces: part.surfaces,
      };
      group.add(mesh);
    }
    return group;
  }
  async function load(sector: VisualSector) {
    const controller = new AbortController();
    inflight.set(sector.id, controller);
    let group: Group | undefined;
    try {
      if (
        !/^\/packages\/visual-[a-f0-9]+\/[a-z0-9-]+\.json$/.test(sector.url) ||
        sector.bytes > 12 * 1024 * 1024
      )
        throw new Error('Invalid visual sector.');
      const cache = await caches.open(ASSET_CACHE).catch(() => null);
      const response =
        (await cache?.match(sector.url)) ||
        (await fetch(sector.url, {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        }));
      if (!response.ok) throw new Error('Model unavailable');
      const bytes = await response.arrayBuffer();
      if (
        bytes.byteLength !== sector.bytes ||
        (await hashBytes(bytes)) !== sector.sha256
      )
        throw new Error('Model integrity check failed');
      const payload = JSON.parse(
        new TextDecoder().decode(bytes),
      ) as SectorModels;
      if (
        payload.schemaVersion !== 1 ||
        payload.id !== sector.id ||
        !Array.isArray(payload.models) ||
        payload.models.length > 400
      )
        throw new Error('Invalid sector');
      if (disposed || controller.signal.aborted) return;
      group = new Group();
      for (const model of payload.models) {
        if (!sector.buildingIds.includes(model.id))
          throw new Error('Unexpected building identity');
        group.add(building(model));
      }
      loaded.set(sector.id, group);
      scene.add(group);
      failures.delete(sector.id);
    } catch {
      if (group) release(group);
      if (!controller.signal.aborted) failures.set(sector.id, Date.now());
    } finally {
      inflight.delete(sector.id);
      if (!disposed) {
        refresh();
        map.triggerRepaint();
      }
    }
  }
  function refresh() {
    if (disposed) return;
    const mode = detailAtZoom(map.getZoom(), reduced);
    const active =
      options.enabled && !fallback && map.getZoom() >= CAMPUS_MIN_ZOOM;
    const bounds = map.getBounds();
    const catalogue = options.data.visuals;
    const visible =
      mode === 'extrusion'
        ? []
        : visibleSectors(catalogue?.sectors || [], [
            [bounds.getWest(), bounds.getSouth()],
            [bounds.getEast(), bounds.getNorth()],
          ]);
    const wanted = new Set(visible.map((s) => s.id));
    for (const [id, request] of inflight) if (!wanted.has(id)) request.abort();
    for (const [id, group] of loaded)
      if (!wanted.has(id)) {
        release(group);
        loaded.delete(id);
      }
    if (indexedData !== options.data) {
      indexedData = options.data;
      visuals = visualLookup(catalogue);
      features = new Map(
        options.data.map.features.map((f) => [String(f.properties?.id), f]),
      );
    }
    const draftIds = new Set(options.overrides?.map((o) => o.model.id) || []);
    for (const [id, group] of drafts)
      if (!draftIds.has(id)) {
        release(group);
        drafts.delete(id);
      }
    for (const override of options.overrides || []) {
      let group = drafts.get(override.model.id);
      if (group?.userData.draftModel !== override.model) {
        if (group) release(group);
        group = building(override.model);
        group.userData.draftModel = override.model;
        drafts.set(override.model.id, group);
        scene.add(group);
      }
      group.visible = active;
    }
    for (const sector of loaded.values()) {
      sector.visible = active && mode !== 'extrusion';
      for (const child of sector.children) {
        const id = String(child.userData.buildingId),
          feature = features.get(id),
          visual = visuals.get(id);
        child.visible =
          !draftIds.has(id) &&
          !!feature &&
          compatibleVisual(feature, visual) &&
          child.userData.revision ===
            `${visual?.geometryRevision}:${visual?.detailRevision || ''}`;
        for (const mesh of child.children) {
          mesh.visible = !(mesh.userData.detail && mode !== 'detailed');
        }
      }
    }
    ambient.intensity = options.dark ? 1.25 : 1.6;
    sun.intensity = options.dark ? 0.85 : 1.8;
    // Detailed architecture retains its authored colours, including legacy
    // packages and draft surfaces. Only illustrative map blocks use slate grading.
    ambient.color.set(options.dark ? '#ffffff' : '#fff1d5');
    sun.color.set('#ffffff');
    const themeKey = `${options.dark}:${options.opacity ?? 1}`;
    for (const entry of materials.values()) {
      if (entry.themeKey === themeKey) continue;
      entry.themeKey = themeKey;
      entry.value.color.set(entry.value.map ? '#ffffff' : entry.colour);
      entry.value.opacity = options.opacity ?? 1;
      entry.value.transparent = entry.value.opacity < 1;
      entry.value.depthWrite = entry.value.opacity >= 0.7;
    }
    for (const group of [
      ...[...loaded.values()].flatMap((s) => s.children as Group[]),
      ...drafts.values(),
    ]) {
      const selection = options.selection;
      const key = JSON.stringify([selection, group.userData.revision]);
      for (const child of group.children)
        if (child instanceof LineSegments)
          (child.material as LineBasicMaterial).color.set(
            options.dark ? '#89c6ff' : '#1764ed',
          );
      for (const mesh of group.children)
        if (mesh instanceof Mesh)
          mesh.visible = !(
            mesh.userData.detail &&
            mode !== 'detailed' &&
            group.userData.buildingId !== options.selectedId
          );
      if (group.userData.selectionKey === key) continue;
      group.userData.selectionKey = key;
      for (const child of group.children.slice())
        if (child instanceof LineSegments) {
          group.remove(child);
          child.geometry.dispose();
          (child.material as LineBasicMaterial).dispose();
        }
      if (!selection || selection.buildingId !== group.userData.buildingId)
        continue;
      const positions: number[] = [];
      for (const mesh of group.children)
        if (mesh instanceof Mesh && mesh.geometry.index)
          for (const coordinate of buildingOutline(
            {
              positions: mesh.geometry.getAttribute('position').array,
              indices: mesh.geometry.index.array,
              surfaces: mesh.userData.surfaces,
            },
            selection,
          ))
            positions.push(coordinate);
      if (positions.length) {
        const geometry = new BufferGeometry();
        geometry.setAttribute(
          'position',
          new Float32BufferAttribute(positions, 3),
        );
        const line = new LineSegments(
          geometry,
          new LineBasicMaterial({
            color: options.dark ? '#89c6ff' : '#1764ed',
            depthTest: false,
            transparent: true,
            opacity: 0.75,
          }),
        );
        line.renderOrder = 5;
        group.add(line);
      }
    }
    for (const sector of loaded.values())
      for (const child of sector.children)
        for (const object of child.children)
          if (object instanceof Mesh) {
            // A shared material cannot carry per-building selection; selection stays in the map's marker and outline layers.
            object.renderOrder = object.userData.detail ? 1 : 0;
          }
    const visibleMaterials = new Set<string>();
    scene.traverseVisible((object) => {
      if (object instanceof Mesh)
        visibleMaterials.add(object.userData.materialKey);
    });
    for (const [key, entry] of materials) {
      if (entry.recipe && visibleMaterials.has(key) && !entry.releaseTexture) {
        entry.releaseTexture = textures.acquire(
          entry.recipe,
          options.data,
          (texture) => {
            entry.value.map = texture;
            entry.value.color.set('#ffffff');
            entry.value.needsUpdate = true;
          },
        );
      } else if (entry.releaseTexture && !visibleMaterials.has(key)) {
        entry.releaseTexture();
        entry.releaseTexture = undefined;
        entry.value.map = null;
        entry.value.color.set(entry.colour);
        entry.value.needsUpdate = true;
      }
    }
    publish();
    for (const sector of visible)
      if (
        active &&
        inflight.size < 3 &&
        !loaded.has(sector.id) &&
        !inflight.has(sector.id) &&
        Date.now() - (failures.get(sector.id) || 0) > 30000
      )
        void load(sector);
  }
  function movementEnded() {
    if (disposed) return;
    lastFrame = 0;
    slowFrames = 0;
    if (reduced && !fallback) {
      reduced = false;
      options.onStatus('ready');
    }
    // The last zoom event can leave the scene at a temporary detail level.
    // Restore the current zoom's detail and explicitly draw the settled view.
    refresh();
    map.triggerRepaint();
  }
  const layer: CustomLayerInterface = {
    id: 'campus-models',
    type: 'custom',
    renderingMode: '3d',
    onAdd(_map, gl) {
      renderer = new WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl as WebGL2RenderingContext,
      });
      renderer.autoClear = false;
      refresh();
    },
    render(_gl, args) {
      if (
        !renderer ||
        disposed ||
        fallback ||
        !options.enabled ||
        map.getZoom() < CAMPUS_MIN_ZOOM
      ) {
        lastFrame = 0;
        slowFrames = 0;
        return;
      }
      camera.projectionMatrix
        .fromArray(args.defaultProjectionData.mainMatrix)
        .multiply(world);
      renderer.resetState();
      try {
        renderer.render(scene, camera);
      } catch {
        fallback = true;
        options.onStatus('unavailable');
        refresh();
        map.triggerRepaint();
      }
      renderer.resetState();
      if (map.isMoving()) {
        const now = performance.now(),
          interval = now - lastFrame,
          hadFrame = lastFrame > 0;
        lastFrame = now;
        if (hadFrame && interval > 38 && interval < 250) slowFrames++;
        else slowFrames = Math.max(0, slowFrames - 1);
        if (slowFrames >= 12 && !reduced) {
          reduced = true;
          options.onStatus('reduced');
          refresh();
        }
        // Slow movement may reduce decorative detail, but never silently
        // disable architecture. Editor work and background pauses also cause
        // long frame intervals; they are not evidence of a renderer failure.
      } else {
        if (reduced && !fallback) movementEnded();
        else {
          lastFrame = 0;
          slowFrames = 0;
        }
      }
    },
    onRemove() {
      renderer?.dispose();
    },
  };
  map.addLayer(layer, 'barriers');
  map.on('moveend', movementEnded);
  map.on('zoom', refresh);
  return {
    update(next: ModelOptions) {
      options = next;
      refresh();
      map.triggerRepaint();
    },
    pick(point: PointLike): BuildingSelection | undefined {
      if (
        !options.enabled ||
        fallback ||
        !readyKey ||
        map.getZoom() < CAMPUS_MIN_ZOOM
      )
        return;
      const p = Array.isArray(point) ? { x: point[0], y: point[1] } : point;
      const x = (p.x / map.getCanvas().clientWidth) * 2 - 1,
        y = 1 - (p.y / map.getCanvas().clientHeight) * 2;
      const inverse = camera.projectionMatrix.clone().invert();
      const near = new Vector3(x, y, -1).applyMatrix4(inverse),
        far = new Vector3(x, y, 1).applyMatrix4(inverse);
      raycaster.ray.set(near, far.sub(near).normalize());
      scene.updateMatrixWorld(true);
      const objects = [...loaded.values()]
        .filter((s) => s.visible)
        .flatMap((s) => s.children.filter((c) => c.visible));
      objects.push(...[...drafts.values()].filter((g) => g.visible));
      const hit = raycaster
        .intersectObjects(objects, true)
        .find((hit) => hit.object instanceof Mesh && hit.object.visible);
      if (!hit) return;
      const surface = hit.object.userData.surfaces?.find(
        (s: { start: number; count: number }) =>
          hit.faceIndex! >= s.start && hit.faceIndex! < s.start + s.count,
      );
      return {
        buildingId: hit.object.userData.buildingId,
        partId: surface?.partId,
        wallId: surface?.wallId,
        role: surface?.role,
        face: hit.faceIndex ?? undefined,
        roofTriangle:
          surface?.role === 'roof' ? hit.faceIndex! - surface.start : undefined,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      map.off('moveend', movementEnded);
      map.off('zoom', refresh);
      for (const c of inflight.values()) c.abort();
      for (const group of loaded.values()) release(group);
      loaded.clear();
      for (const group of drafts.values()) release(group);
      drafts.clear();
      textures.dispose();
      if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      options.onReady([]);
    },
  };
}
