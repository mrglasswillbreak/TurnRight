import { X as ActionX } from 'lucide-react';
import { ModelButton } from './ModelButton';
import { ModelNudge } from './model-mobile';
import { moveElements } from './model-authoring';
import { useWallCanvas, type WallCanvasProps } from './useWallCanvas';
import { WallCanvasToolbar } from './WallCanvasToolbar';
import { WallCanvasDrawing } from './WallCanvasDrawing';

export function ModelWallCanvas(props: WallCanvasProps) {
  const state = useWallCanvas(props);
  const {
    region,
    selected,
    actions,
    actionPosition,
    m,
    reverse,
    overlap,
    onSelect,
    setOverlap,
    detailName,
    elements,
    mobile,
    locked,
    candidate,
    grid,
    setPreview,
    onCommit,
    invalid,
    shown,
  } = state;

  return (
    <section
      ref={region}
      className="model-wall-view"
      aria-label="Measured wall editor"
    >
      {!!selected.length && actions && (
        <div className="model-item-actions" style={actionPosition}>
          {actions}
        </div>
      )}
      <WallCanvasToolbar state={state} />
      <p className="small-note">
        {m.length.toFixed(2)} m wide · {m.eaves.toFixed(2)} m to eaves ·{' '}
        {reverse ? 'B → A' : 'A → B'} ({m.direction}). Floor guides are
        estimates. Arrow keys move; Shift ×10; Alt disables snapping.
      </p>
      <WallCanvasDrawing state={state} />
      {overlap.length > 0 && (
        <fieldset
          className="model-overlap-picker"
          aria-label="Overlapping details"
        >
          <strong>Choose a detail</strong>
          {overlap.map(({ id, instance }) => (
            <ModelButton
              variant="outline"
              key={`${id}:${instance}`}
              onClick={() => {
                onSelect([id], instance);
                setOverlap([]);
              }}
            >
              {detailName(elements.find((e) => e.id === id)!)} · {instance + 1}
            </ModelButton>
          ))}
          <ModelButton
            variant="outline"
            icon={<ActionX />}
            onClick={() => setOverlap([])}
          >
            Cancel selection
          </ModelButton>
        </fieldset>
      )}
      {mobile.compact &&
        selected.some((id) => !locked.includes(id)) &&
        mobile.tool === 'move' && (
          <ModelNudge
            onNudge={(x, y) => {
              candidate.current = moveElements(
                candidate.current || elements,
                selected.filter((id) => !locked.includes(id)),
                x * grid,
                y * grid,
                m.length,
              );
              setPreview(candidate.current);
            }}
            onFinish={() => {
              if (candidate.current) onCommit(candidate.current);
              candidate.current = null;
              setPreview(null);
            }}
            onCancel={() => {
              candidate.current = null;
              setPreview(null);
            }}
          />
        )}
      <output aria-live="polite">
        {invalid.size
          ? `${invalid.size} detail(s) need repositioning or resizing.`
          : `${selected.length} selected · ${shown.reduce((n, e) => n + e.count, 0)} details`}
      </output>
    </section>
  );
}

export type { WallView } from './wall-canvas-types';
