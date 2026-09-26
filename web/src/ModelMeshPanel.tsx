import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Copy,
  Eye,
  EyeOff,
  LockKeyhole,
  LockKeyholeOpen,
  Plus,
  Trash2,
  Check,
  X,
  Spline,
  Move,
  RotateCw,
  Maximize2,
  ArrowUp,
  Minimize2,
  Grid2X2,
  Merge,
} from 'lucide-react';
import { ModelButton } from './ModelButton';
import { ModelField } from './ModelField';
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
  type Vec3,
} from './model-document';
import { meshCommand, type MeshCommand } from './model-mesh-commands';
import {
  primitive,
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
import ModelFilePanel from './ModelFilePanel';
import { modelDocumentRevision } from './model-document-revision';
import {
  modelDescendants,
  transformModelHierarchy,
} from './model-object-transform';
import { bakeNativeModelMeshes } from './model-native-export';
import { ModelCurveProfileForm } from './ModelCurveProfileForm';

export default function ModelMeshPanel({
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
}: {
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
}) {
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
  return (
    <section
      className="model-mesh-panel"
      data-mobile-panel="mode"
      aria-label="Mesh editing tools"
    >
      <p>
        Architectural footprints remain separate from mesh geometry. Select
        parts in the model or structure tree.
      </p>
      {disabled && (
        <output>
          Mesh editing requires an available 3D view and your current changes.
        </output>
      )}
      {pending && (
        <div className="model-notice">
          <p>A model candidate is retained locally.</p>
          <ModelButton icon={<Check />} onClick={() => commit(pending)}>
            Apply pending model
          </ModelButton>
          <ModelButton
            icon={<X />}
            onClick={() => {
              setPending(null);
              workspace?.recoverModelInput(edit.id, 'mesh:candidate');
              onPreview(null);
            }}
          >
            Discard pending model
          </ModelButton>
        </div>
      )}
      <ModelFilePanel
        buildingId={edit.id}
        workspace={workspace}
        document={document}
        selection={selection}
        onCommit={commit}
        onPreview={onPreview}
        disabled={disabled}
        native={async () => {
          const feature = modelFeature({
            ...edit,
            properties: { ...edit.properties, modelDocument: undefined },
          });
          const native = createBuildingModel(
            feature as Feature<Polygon | MultiPolygon>,
            resolveBuildingVisual(
              feature,
              data.visuals?.buildings.find((v) => v.id === edit.id),
            ),
            { previewUnreviewed: true },
          );
          const k = (Math.PI / 180) * 6371008.8,
            offset = [
              (native.origin[0] - document.origin[0]) *
                k *
                Math.cos((document.origin[1] * Math.PI) / 180),
              (native.origin[1] - document.origin[1]) * k,
              0,
            ];
          return bakeNativeModelMeshes(
            native.meshes.map((m) => ({
              ...m,
              positions: m.positions.map((n, i) => n + offset[i % 3]),
            })),
            data,
          );
        }}
      />
      <fieldset disabled={disabled}>
        <legend>Add geometry</legend>
        <label>
          Primitive
          <select
            value={shape}
            onChange={(e) => setShape(e.target.value as PrimitiveKind)}
          >
            {[
              'box',
              'plane',
              'cylinder',
              'cone',
              'sphere',
              'torus',
              'ellipse',
            ].map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <ModelButton
          icon={<Plus />}
          variant="secondary"
          onClick={() =>
            attempt(() => {
              const object = primitive(shape),
                material = {
                  ...defaultModelMaterial(),
                  id: modelId(),
                  name: `${object.name} surface`,
                };
              object.faces.forEach((f) => (f.material = material.id));
              object.transform.position[2] =
                Number(edit.properties.height) || 6;
              if (
                commit({
                  ...document,
                  objects: [...document.objects, object],
                  materials: [...document.materials, material],
                })
              )
                select({ objectId: object.id, kind: 'object', ids: [] });
            })
          }
        >
          Add primitive
        </ModelButton>
        <ModelButton icon={<Copy />} onClick={copyNative}>
          Create editable mesh copy
        </ModelButton>
        <ModelCurveProfileForm
          buildingId={edit.id}
          workspace={workspace}
          onAdd={(object) => {
            const material = {
              ...defaultModelMaterial(),
              id: modelId(),
              name: 'Profile surface',
            };
            object.faces.forEach((f) => (f.material = material.id));
            if (
              !commit({
                ...document,
                objects: [...document.objects, object],
                materials: [...document.materials, material],
              })
            )
              return false;
            select({ objectId: object.id, kind: 'object', ids: [] });
            return true;
          }}
        />
        <label>
          <input
            type="checkbox"
            checked={document.replaceVisual}
            onChange={(e) =>
              commit({ ...document, replaceVisual: e.target.checked })
            }
          />
          Replace building visual
        </label>
      </fieldset>
      <label>
        Model object
        <select
          value={object?.id || ''}
          onChange={(e) =>
            select({ objectId: e.target.value, kind: 'object', ids: [] })
          }
        >
          <option value="">Choose an object</option>
          {document.objects.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
              {o.locked ? ' · locked' : ''}
              {o.hidden ? ' · hidden' : ''}
            </option>
          ))}
        </select>
      </label>
      {object && (
        <>
          <ModelField
            label="Object name"
            type="text"
            value={object.name}
            buildingId={edit.id}
            field={`mesh:${object.id}:name`}
            workspace={workspace}
            onCommit={(name) => changeObject({ ...object, name })}
          />
          <div className="model-toolbar">
            <ModelButton
              icon={object.hidden ? <Eye /> : <EyeOff />}
              onClick={() =>
                changeObject({ ...object, hidden: !object.hidden })
              }
            >
              {object.hidden ? 'Show object' : 'Hide object'}
            </ModelButton>
            <ModelButton
              icon={object.locked ? <LockKeyholeOpen /> : <LockKeyhole />}
              onClick={() =>
                changeObject({ ...object, locked: !object.locked })
              }
            >
              {object.locked ? 'Unlock object' : 'Lock object'}
            </ModelButton>
          </div>
          <fieldset disabled={disabled || object.locked}>
            <legend>Selection and transforms</legend>
            <label>
              Mesh selection
              <select
                value={kind}
                onChange={(e) =>
                  select({
                    objectId: object.id,
                    kind: e.target.value as MeshSelection['kind'],
                    ids: [],
                  })
                }
              >
                {['object', 'vertex', 'edge', 'face'].map((value) => (
                  <option key={value} value={value}>
                    {value[0].toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={multi}
                onChange={(e) => setMulti(e.target.checked)}
              />
              Add to selection (or Shift-click)
            </label>
            {kind !== 'object' && (
              <label>
                Mesh component
                <select
                  value={selection?.ids[0] || ''}
                  onChange={(e) =>
                    select({
                      objectId: object.id,
                      kind,
                      ids: e.target.value ? [e.target.value] : [],
                    })
                  }
                >
                  <option value="">Select in viewport</option>
                  {components.slice(0, 300).map((id, i) => (
                    <option key={id} value={id}>
                      {kind} {i + 1}
                    </option>
                  ))}
                </select>
                <small>
                  {components.length} components. The first 300 are listed; all
                  are selectable in the viewport.
                </small>
              </label>
            )}
            <label>
              Pointer tool
              <select
                value={tool}
                onChange={(e) => setTool(e.target.value as typeof tool)}
              >
                <option value="select">Select / navigate</option>
                <option value="move">Move selection</option>
                <option value="rotate">Rotate selection</option>
                <option value="scale">Scale selection</option>
              </select>
            </label>
            <label>
              Transform axis
              <select
                value={axis}
                onChange={(e) => setAxis(e.target.value as typeof axis)}
              >
                <option value="free">Free / uniform</option>
                <option value="x">X · east</option>
                <option value="y">Y · north</option>
                <option value="z">Z · up</option>
              </select>
            </label>
            <label>
              Mesh snap grid
              <select
                value={grid}
                onChange={(e) => setGrid(Number(e.target.value))}
              >
                <option value={0}>Off</option>
                <option value={0.01}>0.01 m</option>
                <option value={0.1}>0.1 m</option>
                <option value={1}>1 m</option>
              </select>
            </label>
            <div className="model-properties-grid">
              {values.map((value, i) => (
                <label key={i}>
                  {['X', 'Y', 'Z'][i]} amount
                  <input
                    aria-label={`Mesh ${['X', 'Y', 'Z'][i]} amount`}
                    type="number"
                    step="0.1"
                    value={value}
                    onChange={(e) =>
                      setValues((old) =>
                        old.map((v, j) => (i === j ? e.target.value : v)),
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <div className="model-toolbar">
              {(['move', 'rotate', 'scale'] as const).map((kind) => (
                <ModelButton
                  key={kind}
                  variant="outline"
                  icon={
                    kind === 'move' ? (
                      <Move />
                    ) : kind === 'rotate' ? (
                      <RotateCw />
                    ) : (
                      <Maximize2 />
                    )
                  }
                  onClick={() =>
                    command({ kind, value: values.map(Number) as Vec3 })
                  }
                >
                  {kind === 'move'
                    ? 'Move (m)'
                    : kind === 'rotate'
                      ? 'Rotate (°)'
                      : 'Scale (factor)'}
                </ModelButton>
              ))}
            </div>
            {object.curve ? (
              <>
                <ModelField
                  label="Profile extrusion (m)"
                  value={object.curve.depth}
                  min={0}
                  max={500}
                  step={0.1}
                  buildingId={edit.id}
                  field={`mesh:${object.id}:depth`}
                  workspace={workspace}
                  onCommit={(value) =>
                    changeObject({
                      ...object,
                      curve: { ...object.curve!, depth: Number(value) },
                    })
                  }
                />
                {object.curve.segments.map((segment, i) => (
                  <details key={segment.id}>
                    <summary>
                      Curve segment {i + 1} · {segment.kind}
                    </summary>
                    {(
                      [
                        'end',
                        ...(segment.kind === 'bezier'
                          ? ['control1', 'control2']
                          : segment.kind === 'arc'
                            ? ['through']
                            : []),
                      ] as const
                    ).map((key) => {
                      const point = (
                        segment as unknown as Record<string, Vec3>
                      )[key];
                      return (
                        <div key={key}>
                          {[0, 1].map((axis) => (
                            <ModelField
                              key={axis}
                              label={`${key} ${axis ? 'north' : 'east'} (m)`}
                              value={point[axis]}
                              step={0.1}
                              buildingId={edit.id}
                              field={`mesh:${object.id}:${segment.id}:${key}:${axis}`}
                              workspace={workspace}
                              onCommit={(value) => {
                                const curve = structuredClone(object.curve!);
                                (
                                  curve.segments[i] as unknown as Record<
                                    string,
                                    Vec3
                                  >
                                )[key][axis] = Number(value);
                                return changeObject({ ...object, curve });
                              }}
                            />
                          ))}
                        </div>
                      );
                    })}
                  </details>
                ))}
                <ModelButton
                  icon={<Spline />}
                  onClick={() =>
                    attempt(() =>
                      changeObject({
                        ...curveMesh(
                          object.curve!,
                          object.name,
                          object.faces[0]?.material,
                        ),
                        id: object.id,
                        transform: object.transform,
                        source: object.source,
                      }),
                    )
                  }
                >
                  Convert curve to mesh
                </ModelButton>
              </>
            ) : (
              <>
                <label>
                  Surface operation distance (m)
                  <input
                    type="number"
                    step="0.1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <div className="model-toolbar">
                  <ModelButton
                    variant="outline"
                    icon={<ArrowUp />}
                    onClick={() =>
                      command({ kind: 'extrude', amount: Number(amount) })
                    }
                  >
                    Extrude faces
                  </ModelButton>
                  <ModelButton
                    variant="outline"
                    icon={<Minimize2 />}
                    onClick={() =>
                      command({ kind: 'inset', amount: Number(amount) })
                    }
                  >
                    Inset face
                  </ModelButton>
                  <ModelButton
                    variant="outline"
                    icon={<Grid2X2 />}
                    onClick={() => command({ kind: 'subdivide' })}
                  >
                    Subdivide
                  </ModelButton>
                  <ModelButton
                    variant="outline"
                    icon={<Merge />}
                    onClick={() => command({ kind: 'merge' })}
                  >
                    Merge vertices
                  </ModelButton>
                </div>
              </>
            )}
            <div className="model-toolbar">
              <ModelButton
                icon={<Copy />}
                onClick={() => command({ kind: 'duplicate' })}
              >
                Duplicate selection
              </ModelButton>
              <ModelButton
                icon={<Trash2 />}
                variant="destructive"
                onClick={() => command({ kind: 'delete' })}
              >
                Delete selection
              </ModelButton>
            </div>
          </fieldset>
          {material && (
            <fieldset disabled={disabled || object.locked}>
              <legend>Material</legend>
              <label>
                Surface colour
                <input
                  type="color"
                  value={material.colour}
                  onChange={(e) =>
                    commit({
                      ...document,
                      materials: document.materials.map((m) =>
                        m.id === material.id
                          ? { ...m, colour: e.target.value }
                          : m,
                      ),
                    })
                  }
                />
              </label>
              {(['opacity', 'roughness', 'metalness'] as const).map((key) => (
                <ModelField
                  key={key}
                  label={`Material ${key}`}
                  value={material[key]}
                  min={0}
                  max={1}
                  step={0.05}
                  buildingId={edit.id}
                  field={`material:${material.id}:${key}`}
                  workspace={workspace}
                  onCommit={(value) =>
                    commit({
                      ...document,
                      materials: document.materials.map((m) =>
                        m.id === material.id
                          ? { ...m, [key]: Number(value) }
                          : m,
                      ),
                    })
                  }
                />
              ))}
            </fieldset>
          )}
        </>
      )}
      {!document.objects.length && (
        <p>
          <Box size={16} /> Add a primitive, copy the building, or import a
          model to begin.
        </p>
      )}
      {edit.properties.modelDocument && (
        <div className="model-notice">
          <p>
            {edit.properties.reviewedModelRevision ===
            modelDocumentRevision(document)
              ? 'Authored geometry reviewed. Publication still requires a release preview.'
              : 'Authored geometry needs review before it can be published.'}
          </p>
          <ModelButton
            icon={<Check />}
            disabled={
              disabled ||
              !!pending ||
              edit.properties.reviewedModelRevision ===
                modelDocumentRevision(document)
            }
            onClick={() =>
              onCommit({
                ...edit,
                properties: {
                  ...edit.properties,
                  reviewedModelRevision: modelDocumentRevision(document),
                },
              })
            }
          >
            Mark authored model reviewed
          </ModelButton>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
