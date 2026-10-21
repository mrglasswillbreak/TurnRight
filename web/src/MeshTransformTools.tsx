import {
  Copy,
  Trash2,
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
import { type MeshSelection, type Vec3 } from './model-document';
import { curveMesh } from './model-primitives';
import type { ModelMeshState } from './useModelMesh';

export function MeshTransformTools({ state }: { state: ModelMeshState }) {
  const {
    disabled,
    object,
    kind,
    select,
    multi,
    setMulti,
    selection,
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
    edit,
    workspace,
    changeObject,
    attempt,
    amount,
    setAmount,
  } = state;
  if (!object) return null;

  return (
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
            {components.length} components. The first 300 are listed; all are
            selectable in the viewport.
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
        <select value={grid} onChange={(e) => setGrid(Number(e.target.value))}>
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
            onClick={() => command({ kind, value: values.map(Number) as Vec3 })}
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
                const point = (segment as unknown as Record<string, Vec3>)[key];
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
                            curve.segments[i] as unknown as Record<string, Vec3>
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
              onClick={() => command({ kind: 'inset', amount: Number(amount) })}
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
  );
}
