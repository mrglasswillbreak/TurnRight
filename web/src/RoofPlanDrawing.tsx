/* The roof SVG supports spatial gestures; point lists and numeric fields provide equivalent keyboard controls. */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
import { ModelPlanPortal, ModelPlanTools } from './model-mobile';
import type { RoofPlanState } from './useRoofPlan';

export function RoofPlanDrawing({
  state: viewState,
}: {
  state: RoofPlanState;
}) {
  const {
    navigation,
    svg,
    textTools,
    dragging,
    gestureRoof,
    update,
    latestRoof,
    mobile,
    draft,
    tool,
    location,
    add,
    snap,
    roof,
    autoSave,
    apply,
    polygon,
    project,
    shown,
    surface,
    setSurface,
    onSurface,
    setSelected,
    handleUnit,
    selected,
    pick,
    active,
  } = viewState;

  return (
    <ModelPlanPortal>
      <div className="model-plan-navigation">
        <ModelPlanTools navigation={navigation} />
        <svg
          ref={svg}
          viewBox={navigation.viewBox}
          {...navigation.handlers}
          aria-label="Roof plan drawing"
          role="application"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              textTools.cancel();
              e.preventDefault();
              e.stopPropagation();
              dragging.current = null;
              if (gestureRoof.current) update(gestureRoof.current, true);
              latestRoof.current = null;
              gestureRoof.current = null;
            }
          }}
          className="roof-canvas"
          onPointerDown={(e) => {
            e.currentTarget.focus();
            if (mobile.compact) return;
            if (
              !draft ||
              tool === 'select' ||
              (e.target as Element).closest('[data-roof-point]')
            )
              return;
            const coordinates = location(e.clientX, e.clientY);
            if (coordinates) add(coordinates);
          }}
          onClick={(e) => {
            if (
              !mobile.compact ||
              !draft ||
              tool === 'select' ||
              (e.target as Element).closest('[data-roof-point]')
            )
              return;
            const coordinates = location(e.clientX, e.clientY);
            if (coordinates) add(coordinates);
          }}
          onPointerMove={(e) => {
            if (!dragging.current) return;
            const coordinates = location(e.clientX, e.clientY);
            if (coordinates) {
              const attached = snap(coordinates);
              update(
                {
                  ...roof,
                  points: roof.points.map((p) =>
                    p.id === dragging.current
                      ? {
                          ...p,
                          ...attached,
                          vertexId: attached.vertexId,
                          elevation: attached.vertexId
                            ? roof.eaves
                            : p.elevation,
                        }
                      : p,
                  ),
                },
                true,
              );
            }
          }}
          onPointerUp={() => {
            dragging.current = null;
            if (autoSave && latestRoof.current) apply(latestRoof.current);
            latestRoof.current = null;
            gestureRoof.current = null;
          }}
          onPointerCancel={() => {
            dragging.current = null;
            if (gestureRoof.current) update(gestureRoof.current, true);
            latestRoof.current = null;
            gestureRoof.current = null;
          }}
        >
          <path
            d={polygon
              .map(
                (r) =>
                  'M' + r.map((p) => project(p).join(',')).join(' L') + ' Z',
              )
              .join(' ')}
            data-surface-background
            fill="#e8e2cf"
            fillRule="evenodd"
            stroke="#586251"
            strokeWidth="2"
          />
          {shown?.triangles.map((t, i) => (
            <polygon
              key={i}
              points={t
                .map((id) => project(shown.points[id]).join(','))
                .join(' ')}
              fill={i === surface ? '#72b9c988' : '#9bb8a333'}
              stroke="#677c6888"
              strokeWidth="0.8"
              onClick={() => {
                if (tool === 'select') {
                  setSurface(i);
                  onSurface(i);
                  setSelected('');
                }
              }}
            />
          ))}
          {roof.lines.map((line) => {
            const a = roof.points.find((p) => p.id === line.from),
              b = roof.points.find((p) => p.id === line.to);
            if (!a || !b) return null;
            const [x1, y1] = project(a.coordinates),
              [x2, y2] = project(b.coordinates);
            return (
              <line
                key={line.id}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={line.kind === 'ridge' ? '#af4f35' : '#267f9c'}
                strokeWidth="3"
                strokeDasharray={line.kind === 'valley' ? '5 3' : undefined}
                pointerEvents="none"
              />
            );
          })}
          {roof.points.map((p, i) => {
            const [cx, cy] = project(p.coordinates);
            return (
              <g key={p.id} data-roof-point={p.id}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={mobile.compact ? handleUnit * 22 : 10}
                  fill={p.id === selected ? '#fbe87a' : '#ffffff'}
                  stroke="#265b46"
                  strokeWidth="2"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (!draft) return;
                    if (!mobile.compact) pick(p.id);
                    if (
                      tool === 'select' &&
                      (!mobile.compact || mobile.tool === 'move')
                    ) {
                      setSelected(p.id);
                      dragging.current = p.id;
                      gestureRoof.current = structuredClone(roof);
                      svg.current?.setPointerCapture(e.pointerId);
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (mobile.compact && draft) pick(p.id);
                  }}
                />
                <text
                  x={cx}
                  y={cy + 3}
                  textAnchor="middle"
                  fontSize="9"
                  pointerEvents="none"
                >
                  {i + 1}
                </text>
              </g>
            );
          })}
          {textTools.overlay}
        </svg>
        {mobile.compact && (
          <output>
            {active
              ? `Point ${roof.points.indexOf(active) + 1} · ${active.elevation} m`
              : 'Select a roof point'}{' '}
            ·{' '}
            {mobile.tool === 'move'
              ? 'Move point enabled'
              : tool === 'select'
                ? 'Tap to select'
                : tool === 'point'
                  ? 'Tap to add a point'
                  : `Choose two ${tool} endpoints`}
          </output>
        )}
      </div>
    </ModelPlanPortal>
  );
}
