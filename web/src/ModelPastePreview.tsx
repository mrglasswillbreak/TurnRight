import { X as ActionX } from 'lucide-react';
import {
  modelFeature,
  placementErrors,
  wallLength,
  wallMetrics,
} from './model-authoring';
import { ModelButton } from './ModelButton';
import { ModelField } from './ModelField';

import type { ModelDetailCommandsBindings } from './useModelDetailCommands';
import type { ModelWorkspaceSelectionBindings } from './useModelWorkspaceSelection';
import type { ModelWorkspaceStateBindings } from './useModelWorkspaceState';

type Props = Pick<
  ModelWorkspaceStateBindings,
  | 'edit'
  | 'data'
  | 'paste'
  | 'setPaste'
  | 'targetBuilding'
  | 'setTargetBuilding'
  | 'targetWall'
  | 'setTargetWall'
  | 'pasteTransform'
  | 'setPasteTransform'
> &
  Pick<
    ModelWorkspaceSelectionBindings,
    'buildings' | 'targetEdit' | 'targetWalls'
  > &
  Pick<ModelDetailCommandsBindings, 'confirmPaste' | 'copiedPlacement'>;
export function ModelPastePreview(props: Props) {
  const {
    edit,
    data,
    paste,
    setPaste,
    targetBuilding,
    setTargetBuilding,
    targetWall,
    setTargetWall,
    pasteTransform,
    setPasteTransform,
    buildings,
    targetEdit,
    targetWalls,
    confirmPaste,
    copiedPlacement,
  } = props;
  return (
    paste && (
      <section
        className="model-paste-preview"
        aria-label="Copy placement preview"
      >
        <h3>Copy {paste.elements.length} detail records</h3>
        <div className="model-properties-grid">
          {(['x', 'y', 'scale'] as const).map((key) => (
            <ModelField
              key={key}
              label={
                key === 'x'
                  ? 'Horizontal offset (m)'
                  : key === 'y'
                    ? 'Vertical offset (m)'
                    : 'Explicit size multiplier'
              }
              value={pasteTransform[key]}
              buildingId={edit.id}
              field={`paste:${key}`}
              min={key === 'scale' ? 0.01 : -150}
              max={key === 'scale' ? 10 : 150}
              onCommit={(v) => {
                setPasteTransform((t) => ({
                  ...t,
                  [key]: Number(v),
                }));
                return true;
              }}
            />
          ))}
        </div>
        <p>
          Dimensions and spacing stay in metres. New placements require owner
          review.
        </p>
        <label>
          Target building
          <select
            aria-label="Target building"
            value={targetBuilding}
            onChange={(e) => {
              setTargetBuilding(e.target.value);
              setTargetWall('');
            }}
          >
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Target wall
          <select
            aria-label="Target wall"
            value={targetWall || targetWalls[0]?.wallId || ''}
            onChange={(e) => setTargetWall(e.target.value)}
          >
            {targetWalls.map((w) => (
              <option key={w.wallId} value={w.wallId}>
                {w.label} · {wallLength(w.coordinates).toFixed(2)} m
              </option>
            ))}
          </select>
        </label>
        <p>
          First detail centre:{' '}
          {(paste.elements[0]?.x * paste.wallLength).toFixed(2)} m from A;
          height {paste.elements[0]?.bottom.toFixed(2)} m.
        </p>
        {targetEdit &&
          targetWalls.length > 0 &&
          (() => {
            const id = targetWall || targetWalls[0].wallId,
              m = wallMetrics(
                modelFeature(targetEdit),
                id,
                data.visuals?.buildings.find((v) => v.id === targetEdit.id),
              ),
              values = copiedPlacement(paste, m.length),
              bad = new Set(
                placementErrors(values, m.length, m.eaves).map((e) => e.id),
              );
            return (
              <svg
                className="model-copy-canvas"
                aria-label="Copied layout preview on target wall"
                viewBox={`-1 ${-m.eaves - 1} ${m.length + 2} ${m.eaves + 2}`}
              >
                <rect
                  x={0}
                  y={-m.eaves}
                  width={m.length}
                  height={m.eaves}
                  fill={m.style.wallColour || '#ddd6c5'}
                />
                {values.flatMap((e) =>
                  Array.from({ length: e.count }, (_, i) => (
                    <rect
                      key={`${e.id}:${i}`}
                      x={
                        (e.x + (i - (e.count - 1) / 2) * e.spacing) * m.length -
                        e.width / 2
                      }
                      y={-e.bottom - e.height}
                      width={e.width}
                      height={e.height}
                      fill={bad.has(e.id) ? '#db3535' : e.colour}
                      stroke="#168aff"
                      strokeWidth={0.08}
                    />
                  )),
                )}
              </svg>
            );
          })()}
        <ModelButton variant="outline" onClick={confirmPaste}>
          Confirm placement
        </ModelButton>
        <ModelButton
          variant="outline"
          icon={<ActionX />}
          onClick={() => setPaste(null)}
        >
          Cancel copy
        </ModelButton>
      </section>
    )
  );
}
