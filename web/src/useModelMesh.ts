import { useEffect, useMemo, useState } from 'react';
import type { CampusData, MapEdit } from './types';
import type { EditorWorkspace } from './editor-workspace';
import type { ModelPreviewScene } from './model-preview-scene';
import { documentForBuilding } from './model-architecture';
import {
  defaultModelMaterial,
  modelDocumentErrors,
  modelEdges,
  modelId,
  type MeshSelection,
  type ModelDocument,
  type ModelObject,
} from './model-document';
import { meshCommand, type MeshCommand } from './model-mesh-commands';
import {
  curveMesh,
  objectFromGeometry,
  type PrimitiveKind,
} from './model-primitives';
import { useMeshViewport } from './use-mesh-viewport';
import { createBuildingModel } from './building-model';
import { resolveBuildingVisual } from './building-surfaces';
import { modelFeature } from './model-authoring';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import {
  modelDescendants,
  transformModelHierarchy,
} from './model-object-transform';
import { bakeNativeModelMeshes } from './model-native-export';

export type ModelMeshProps = {
  edit: MapEdit;
  data: CampusData;
  scene: ModelPreviewScene | null;
  selection: MeshSelection | null;
  onSelection: (s: MeshSelection) => void;
  onCommit: (edit: MapEdit) => boolean;
  onPreview: (d: ModelDocument | null) => void;
  workspace?: EditorWorkspace;
  view: string;
  disabled: boolean;
};
export function useModelMesh({
  edit,
  data,
  scene,
  selection,
  onSelection,
  onCommit,
  onPreview,
  workspace,
  view,
  disabled,
}: ModelMeshProps) {
  const document = useMemo(() => documentForBuilding(edit), [edit]);

  const [error, setError] = useState(''),
    [kind, setKind] = useState<MeshSelection['kind']>('object'),
    [tool, setTool] = useState<'select' | 'move' | 'rotate' | 'scale'>(
      'select',
    ),
    [axis, setAxis] = useState<'free' | 'x' | 'y' | 'z'>('free'),
    [grid, setGrid] = useState(0.1),
    [multi, setMulti] = useState(false),
    [shape, setShape] = useState<PrimitiveKind>('box');

  const [values, setValues] = useState(['1', '0', '0']),
    [amount, setAmount] = useState('1');

  const [pending, setPending] = useState<ModelDocument | null>(null);

  const object = document.objects.find((o) => o.id === selection?.objectId),
    material = document.materials.find(
      (m) => m.id === object?.faces[0]?.material,
    );

  useEffect(() => {
    if (selection) setKind(selection.kind);
  }, [selection]);

  const savedCandidate = workspace?.modelInputs[edit.id]?.['mesh:candidate'];

  useEffect(() => {
    const value = savedCandidate;
    if (value)
      try {
        setPending(JSON.parse(value));
      } catch {
        setError(
          'The recovered model needs repair. Download recovery before discarding it.',
        );
      }
  }, [edit.id, savedCandidate]);

  const commit = (next: ModelDocument) => {
    const errors = modelDocumentErrors(next);
    if (!errors.length) {
      try {
        next = {
          ...next,
          objects: next.objects.map((o) => {
            if (!o.curve) return o;
            const mesh = curveMesh(
              o.curve,
              o.name,
              o.faces[0]?.material || next.materials[0]?.id,
            );
            return { ...o, vertices: mesh.vertices, faces: mesh.faces };
          }),
        };
        errors.push(...modelDocumentErrors(next));
      } catch (error) {
        errors.push(
          error instanceof Error
            ? error.message
            : 'The curve could not be tessellated.',
        );
      }
    }
    if (errors.length) {
      setError(errors.join(' '));
      setPending(next);
      workspace?.recoverModelInput(
        edit.id,
        'mesh:candidate',
        JSON.stringify(next),
      );
      return false;
    }
    if (
      onCommit({
        ...edit,
        properties: { ...edit.properties, modelDocument: next },
      })
    ) {
      setError('');
      setPending(null);
      onPreview(null);
      workspace?.recoverModelInput(edit.id, 'mesh:candidate');
      return true;
    }
    setPending(next);
    workspace?.recoverModelInput(
      edit.id,
      'mesh:candidate',
      JSON.stringify(next),
    );
    setError(
      'The model was kept locally. Resolve the validation notice before applying it.',
    );
    return false;
  };

  const attempt = (run: () => unknown) => {
    try {
      void Promise.resolve(run()).catch((e) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const changeObject = (next: ModelObject) =>
    commit({
      ...document,
      objects: document.objects.map((o) => (o.id === next.id ? next : o)),
    });

  const select = (s: MeshSelection) => {
    setKind(s.kind);
    onSelection(s);
  };

  const command = (command: MeshCommand) =>
    attempt(() => {
      if (!object || !selection) throw new Error('Select an object first.');
      if (selection.kind === 'object' && 'value' in command) {
        commit(
          transformModelHierarchy(
            document,
            object.id,
            command.kind,
            command.value,
          ),
        );
        return;
      }
      if (command.kind === 'delete' && selection.kind === 'object') {
        if (modelDescendants(document, object.id).some((o) => o.locked))
          throw new Error('Unlock the object before deleting it.');
        const children = new Set([object.id]);
        let count = -1;
        while (count !== children.size) {
          count = children.size;
          for (const o of document.objects)
            if (o.parentId && children.has(o.parentId)) children.add(o.id);
        }
        commit({
          ...document,
          objects: document.objects.filter((o) => !children.has(o.id)),
          replaceVisual:
            document.replaceVisual &&
            document.objects.some((o) => !children.has(o.id) && !o.hidden),
        });
        return;
      }
      if (command.kind === 'duplicate' && selection.kind === 'object') {
        const members = modelDescendants(document, object.id);
        if (members.some((o) => o.locked))
          throw new Error('Unlock the object before duplicating it.');
        const ids = new Map(members.map((o) => [o.id, modelId()]));
        const copies = members.map((o) => {
          const next = structuredClone(o);
          next.id = ids.get(o.id)!;
          next.parentId = o.parentId
            ? ids.get(o.parentId) || o.parentId
            : undefined;
          next.name = `${next.name} copy`;
          next.transform.position[0] += 1;
          return next;
        });
        if (commit({ ...document, objects: [...document.objects, ...copies] }))
          select({ objectId: ids.get(object.id)!, kind: 'object', ids: [] });
        return;
      }
      const result = meshCommand(object, selection, command);
      if (changeObject(result.object))
        select(command.kind === 'delete' ? selection : result.selection);
    });

  useMeshViewport({
    scene,
    document,
    selection,
    kind,
    tool,
    axis,
    grid,
    multi,
    surface: view === 'surface',
    disabled: disabled || view === 'photo',
    onSelect: select,
    onCommit: commit,
    onPreview,
    onError: setError,
  });

  const copyNative = () =>
    attempt(async () => {
      const feature = modelFeature({
          ...edit,
          properties: { ...edit.properties, modelDocument: undefined },
        }),
        visual = resolveBuildingVisual(
          feature,
          data.visuals?.buildings.find((v) => v.id === edit.id),
        );
      if (
        feature.geometry.type !== 'Polygon' &&
        feature.geometry.type !== 'MultiPolygon'
      )
        throw new Error('Choose a building footprint first.');
      const native = createBuildingModel(
        feature as Feature<Polygon | MultiPolygon>,
        visual,
        { previewUnreviewed: true },
      );
      const origin = document.origin,
        k = (Math.PI / 180) * 6371008.8,
        dx =
          (native.origin[0] - origin[0]) *
          k *
          Math.cos((origin[1] * Math.PI) / 180),
        dy = (native.origin[1] - origin[1]) * k;
      const next = structuredClone(document);
      for (const mesh of await bakeNativeModelMeshes(native.meshes, data)) {
        const geometry = new BufferGeometry();
        geometry.setAttribute(
          'position',
          new Float32BufferAttribute(mesh.positions, 3),
        );
        geometry.setIndex(mesh.indices);
        if (mesh.uvs)
          geometry.setAttribute('uv', new Float32BufferAttribute(mesh.uvs, 2));
        const materialId = modelId(),
          material = {
            ...defaultModelMaterial(),
            ...mesh.material,
            id: materialId,
            name: 'Architectural surface',
            colour: mesh.material?.colour || mesh.colour,
          };
        for (const [slot, url] of Object.entries(mesh.material?.maps || {})) {
          const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(url);
          if (match) {
            const id = modelId();
            next.images.push({
              id,
              name: 'Architectural texture',
              mime: `image/${match[1]}` as 'image/png',
              data: match[2],
            });
            material[slot as 'baseMap'] = id;
          }
        }
        delete (material as { maps?: unknown }).maps;
        next.materials.push(material);
        const object = objectFromGeometry(
          geometry,
          `${String(edit.properties.name || 'Building')} mesh`,
          materialId,
          true,
        );
        object.transform.position = [dx, dy, 0];
        object.source = {
          kind: 'native',
          name: String(edit.properties.name || 'Building'),
        };
        next.objects.push(object);
        geometry.dispose();
      }
      if (commit(next))
        select({
          objectId: next.objects.at(-1)?.id || '',
          kind: 'object',
          ids: [],
        });
    });

  const components = object
    ? kind === 'vertex'
      ? Object.keys(object.vertices)
      : kind === 'edge'
        ? modelEdges(object).map((e) => e.id)
        : kind === 'face'
          ? object.faces.map((f) => f.id)
          : []
    : [];
  return {
    disabled,
    pending,
    commit,
    setPending,
    workspace,
    edit,
    onPreview,
    document,
    selection,
    data,
    shape,
    setShape,
    attempt,
    select,
    copyNative,
    object,
    changeObject,
    kind,
    multi,
    setMulti,
    components,
    tool,
    setTool,
    axis,
    setAxis,
    grid,
    setGrid,
    values,
    setValues,
    command,
    amount,
    setAmount,
    material,
    onCommit,
    error,
  };
}
export type ModelMeshState = ReturnType<typeof useModelMesh>;
