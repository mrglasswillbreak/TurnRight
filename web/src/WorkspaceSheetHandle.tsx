import { useRef } from 'react';
/* eslint-disable jsx-a11y/prefer-tag-over-role -- This pointer-captured resize grip follows the existing SheetHandle slider pattern and supports arrow, Home and End keys. */

export const clampWorkspaceSheet = (height: number) =>
  Math.min(85, Math.max(20, height));
export function WorkspaceSheetHandle({
  height,
  onResize,
  onCommit,
  onCancel,
}: {
  height: number;
  onResize: (value: number) => void;
  onCommit: (value: number) => void;
  onCancel: () => void;
}) {
  const drag = useRef<{
    id: number;
    y: number;
    height: number;
    frame: number;
    current: number;
  } | null>(null);
  return (
    <div
      className="workspace-sheet-handle"
      role="slider"
      tabIndex={0}
      aria-label="Resize editing panel"
      aria-orientation="vertical"
      aria-valuemin={20}
      aria-valuemax={85}
      aria-valuenow={Math.round(height)}
      aria-valuetext={`${Math.round(height)}% of the workspace`}
      title="Drag to resize. Arrow keys adjust; Home shrinks and End expands."
      onKeyDown={(e) => {
        const value =
          e.key === 'Home'
            ? 20
            : e.key === 'End'
              ? 85
              : ['ArrowUp', 'ArrowRight'].includes(e.key)
                ? height + 5
                : ['ArrowDown', 'ArrowLeft'].includes(e.key)
                  ? height - 5
                  : null;
        if (value === null) return;
        e.preventDefault();
        e.stopPropagation();
        onCommit(clampWorkspaceSheet(value));
      }}
      onPointerDown={(e) => {
        if (!e.isPrimary || e.button !== 0) return;
        const frame = e.currentTarget
          .closest('.workspace-frame')
          ?.getBoundingClientRect().height;
        if (!frame) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = {
          id: e.pointerId,
          y: e.clientY,
          height,
          frame,
          current: height,
        };
      }}
      onPointerMove={(e) => {
        const start = drag.current;
        if (!start || start.id !== e.pointerId) return;
        start.current = clampWorkspaceSheet(
          start.height + ((start.y - e.clientY) / start.frame) * 100,
        );
        onResize(start.current);
      }}
      onPointerUp={(e) => {
        if (drag.current?.id !== e.pointerId) return;
        onCommit(drag.current.current);
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
        onCancel();
      }}
      onLostPointerCapture={() => {
        if (drag.current) onCancel();
        drag.current = null;
      }}
    >
      <span aria-hidden="true" />
      <small>Drag to resize</small>
    </div>
  );
}
