/* The spatial SVG is an application surface; the hierarchy and metre fields provide equivalent non-spatial controls. */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
import { detailInstanceId } from './model-instances';
import { moveElements } from './model-authoring';
import type { WallCanvasState } from './useWallCanvas';

export function WallCanvasDrawing({ state }: { state: WallCanvasState }) {
  const {
    svg,
    view,
    interactive,
    pointers,
    cancel,
    pinch,
    begin,
    pan,
    update,
    finish,
    onDelete,
    onDuplicate,
    selected,
    locked,
    grid,
    onCommit,
    elements,
    m,
    pixel,
    xTicks,
    yTicks,
    shown,
    hidden,
    reverse,
    curve,
    projectX,
    invalid,
    mobile,
    marquee,
  } = state;

  return (
    <svg
      ref={svg}
      className="model-wall-canvas"
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      tabIndex={0}
      role="application"
      aria-label="Wall canvas: select and move architectural details"
      onPointerDownCapture={(e) => {
        if (!interactive) return;
        pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
        if (pointers.current.size === 2) {
          cancel();
          const [a, b] = [...pointers.current.values()],
            matrix = svg.current!.getScreenCTM()!.inverse();
          const c = new DOMPoint(
            (a[0] + b[0]) / 2,
            (a[1] + b[1]) / 2,
          ).matrixTransform(matrix);
          pinch.current = {
            distance: Math.hypot(a[0] - b[0], a[1] - b[1]),
            centre: [c.x, c.y],
            view,
            matrix,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      }}
      onPointerDown={(e) => begin(e, pan ? 'pan' : 'marquee')}
      onPointerMove={update}
      onPointerUp={finish}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        pinch.current = null;
        cancel();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancel();
        }
        if (!interactive) return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          onDelete();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          onDuplicate();
        }
        const arrows: Record<string, [number, number]> = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, 1],
          ArrowDown: [0, -1],
        };
        if (arrows[e.key]) {
          e.preventDefault();
          const movable = selected.filter((id) => !locked.includes(id));
          if (!movable.length) return;
          const [x, y] = arrows[e.key],
            step = grid * (e.shiftKey ? 10 : 1);
          onCommit(
            moveElements(elements, movable, x * step, y * step, m.length),
          );
        }
      }}
    >
      <rect
        x={0}
        y={-m.eaves}
        width={m.length}
        height={m.eaves}
        data-surface-background
        fill={m.style.wallColour || '#ddd6c5'}
        stroke="currentColor"
        strokeWidth={pixel}
      />
      <g className="model-grid" strokeWidth={pixel * 0.5}>
        {xTicks.map((x) => (
          <line
            key={`x${x}`}
            x1={x}
            x2={x}
            y1={view.y}
            y2={view.y + view.height}
          />
        ))}
        {yTicks.map((y) => (
          <line
            key={`y${y}`}
            x1={view.x}
            x2={view.x + view.width}
            y1={-y}
            y2={-y}
          />
        ))}
      </g>
      {Array.from({ length: Math.max(0, Math.floor(m.floors) - 1) }, (_, i) => (
        <line
          key={i}
          x1={0}
          x2={m.length}
          y1={(-(i + 1) * m.eaves) / m.floors}
          y2={(-(i + 1) * m.eaves) / m.floors}
          stroke="#536577"
          strokeDasharray={`${pixel * 4} ${pixel * 4}`}
          strokeWidth={pixel}
        />
      ))}
      {shown
        .filter((e) => !hidden.includes(e.id))
        .flatMap((e) =>
          Array.from({ length: e.count }, (_, i) => {
            if (
              hidden.includes(
                detailInstanceId(e.id, reverse ? e.count - 1 - i : i),
              )
            )
              return null;
            const x =
              (e.x + (i - (e.count - 1) / 2) * e.spacing) * m.length -
              e.width / 2;
            if (curve && !curve.visible(x + e.width / 2)) return null;
            const displayX = projectX(x),
              displayWidth = projectX(x + e.width) - displayX;
            if (
              x + e.width < view.x ||
              x > view.x + view.width ||
              -e.bottom < view.y ||
              -e.bottom - e.height > view.y + view.height
            )
              return null;
            return (
              <g key={`${e.id}:${i}`}>
                <rect
                  data-element-id={e.id}
                  data-instance={i}
                  x={displayX}
                  y={-e.bottom - e.height}
                  width={Math.max(0.01, displayWidth)}
                  height={Math.max(0.01, e.height)}
                  fill={e.kind === 'text' ? 'transparent' : e.colour}
                  fillOpacity={locked.includes(e.id) ? 0.45 : 0.85}
                  stroke={
                    invalid.has(e.id)
                      ? '#db3535'
                      : selected.includes(e.id)
                        ? '#087cf0'
                        : '#535b62'
                  }
                  strokeWidth={pixel * (selected.includes(e.id) ? 3 : 1)}
                  onPointerDown={(event) =>
                    begin(event, pan ? 'pan' : 'move', e.id, i)
                  }
                >
                  <title>
                    {e.kind} · {(x + e.width / 2).toFixed(2)} m from{' '}
                    {reverse ? 'B' : 'A'} · {e.bottom.toFixed(2)} m above base
                    {locked.includes(e.id) ? ' · locked' : ''}
                  </title>
                </rect>
                {e.kind === 'text' && (
                  <text
                    className="model-wall-text-label"
                    pointerEvents="none"
                    x={
                      displayX +
                      displayWidth *
                        (e.textAlign === 'left'
                          ? 0.02
                          : e.textAlign === 'right'
                            ? 0.98
                            : 0.5)
                    }
                    y={-e.bottom - e.height / 2}
                    textAnchor={
                      e.textAlign === 'left'
                        ? 'start'
                        : e.textAlign === 'right'
                          ? 'end'
                          : 'middle'
                    }
                    dominantBaseline="central"
                    fontSize={Math.min(
                      e.height * 0.75,
                      (e.width / Math.max(1, (e.text || '').length)) * 1.6,
                    )}
                    fontWeight={e.textWeight === 'regular' ? 400 : 700}
                    fill={e.colour}
                  >
                    {e.text}
                  </text>
                )}
              </g>
            );
          }),
        )}
      {(!mobile.compact || mobile.tool === 'resize') &&
        selected.length === 1 &&
        shown
          .filter(
            (e) =>
              e.id === selected[0] &&
              e.count === 1 &&
              !locked.includes(e.id) &&
              !hidden.includes(e.id),
          )
          .map((e) => (
            <circle
              key={e.id}
              aria-label="Resize selected detail"
              cx={projectX(e.x * m.length + e.width / 2)}
              cy={-e.bottom - e.height}
              r={pixel * (mobile.compact ? 22 : 9)}
              fill="#087cf0"
              stroke="white"
              strokeWidth={pixel * 2}
              onPointerDown={(event) => begin(event, 'resize', e.id)}
            />
          ))}
      {marquee && (
        <rect
          x={marquee[0]}
          y={-marquee[1] - marquee[3]}
          width={marquee[2]}
          height={marquee[3]}
          fill="#087cf0"
          fillOpacity={0.12}
          stroke="#087cf0"
          strokeWidth={pixel}
        />
      )}
      <g fill="currentColor" fontSize={pixel * 11}>
        {xTicks
          .filter((x) => x >= 0 && x <= m.length)
          .map((x) => (
            <text key={x} x={x} y={pixel * 15}>
              {Number(x.toFixed(2))} m
            </text>
          ))}
      </g>
    </svg>
  );
}
