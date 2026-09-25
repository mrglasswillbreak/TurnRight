/* The interactive SVG has equivalent vertex-selection and numeric controls below it. */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { MapEdit } from './types';
import type { EditorWorkspace } from './editor-workspace';
import { polygonsOf, remapBuildingSurfaces } from './building-surfaces';
import { ModelField } from './ModelField';
import {
  ModelPlanPortal,
  ModelPlanTools,
  useModelMobile,
  useModelPlanNavigation,
  useModelSvgUnits,
} from './model-mobile';

export function ModelOutlineCanvas({
  edit,
  workspace,
  onCommit,
}: {
  edit: MapEdit;
  workspace?: EditorWorkspace;
  onCommit: (edit: MapEdit) => boolean;
}) {
  const polygons = useMemo(() => polygonsOf(edit.geometry), [edit.geometry]),
    points = polygons.flat(2),
    origin = points[0];
  const k = (6371008.8 * Math.PI) / 180,
    sx = k * Math.cos((origin[1] * Math.PI) / 180);
  const xy = (p: number[]) => [
    (p[0] - origin[0]) * sx,
    -(p[1] - origin[1]) * k,
  ];
  const local = points.map(xy),
    west = Math.min(...local.map((p) => p[0])) - 2,
    east = Math.max(...local.map((p) => p[0])) + 2,
    north = Math.min(...local.map((p) => p[1])) - 2,
    south = Math.max(...local.map((p) => p[1])) + 2;
  const svg = useRef<SVGSVGElement>(null),
    drag = useRef<number[] | null>(null),
    [selected, setSelected] = useState<number[]>([0, 0, 0]),
    [preview, setPreview] = useState<MapEdit | null>(null);
  const shown = preview || edit,
    shownPolygons = polygonsOf(shown.geometry),
    pixel = (east - west) / 600;
  const update = (indices: number[], point: number[]) => {
    const next = structuredClone(polygons),
      [p, r, v] = indices;
    next[p][r][v] = point;
    if (v === 0) next[p][r][next[p][r].length - 1] = [...point];
    return remapBuildingSurfaces(
      edit,
      edit.geometry.type === 'Polygon'
        ? { type: 'Polygon', coordinates: next[0] }
        : { type: 'MultiPolygon', coordinates: next },
    );
  };
  const location = (event: ReactPointerEvent) => {
    const matrix = svg.current!.getScreenCTM()!;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    return [origin[0] + p.x / sx, origin[1] - p.y / k];
  };
  const [p, r, v] = selected,
    active = polygons[p]?.[r]?.[v];
  const mobile = useModelMobile();
  const cancel = () => {
    drag.current = null;
    setPreview(null);
  };
  const navigation = useModelPlanNavigation(
    [west, north, east - west, south - north],
    cancel,
    (target) =>
      mobile.tool === 'move' && !!target.closest('[data-outline-vertex]'),
  );
  const [handleUnit] = useModelSvgUnits(svg, navigation.viewBox);
  return (
    <section aria-label="Building outline plan">
      <p>
        North ↑ · Drag mapped vertices, or enter coordinates. Outline changes
        retain wall identities where possible and flag affected details for
        review.
      </p>
      <ModelPlanPortal>
        <div className="model-plan-navigation">
          <ModelPlanTools navigation={navigation} />
          <svg
            ref={svg}
            className="model-outline-canvas"
            viewBox={navigation.viewBox}
            {...navigation.handlers}
            aria-label="Top-down building outline"
            role="application"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && drag.current) {
                event.preventDefault();
                event.stopPropagation();
                drag.current = null;
                setPreview(null);
              }
            }}
            tabIndex={0}
            onPointerMove={(e) => {
              if (drag.current) setPreview(update(drag.current, location(e)));
            }}
            onPointerUp={() => {
              if (preview) onCommit(preview);
              drag.current = null;
              setPreview(null);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setPreview(null);
            }}
          >
            {shownPolygons.map((polygon, p) => (
              <g key={p}>
                {polygon.map((ring, r) => (
                  <g key={r}>
                    <polygon
                      points={ring.map((p) => xy(p).join(',')).join(' ')}
                      fill={r ? 'var(--background)' : '#9dac98'}
                      stroke="currentColor"
                      strokeWidth={pixel}
                    />
                    {ring.slice(0, -1).map((point, v) => {
                      const [x, y] = xy(point);
                      return (
                        <circle
                          key={v}
                          cx={x}
                          cy={y}
                          r={mobile.compact ? handleUnit * 22 : pixel * 7}
                          data-outline-vertex={`${p}:${r}:${v}`}
                          fill={
                            selected.join(':') === [p, r, v].join(':')
                              ? '#087cf0'
                              : '#ffffff'
                          }
                          stroke="#087cf0"
                          strokeWidth={pixel * 2}
                          onPointerDown={(e) => {
                            svg.current!.focus();
                            if (!mobile.compact || mobile.tool === 'move') {
                              drag.current = [p, r, v];
                              setSelected([p, r, v]);
                              svg.current!.setPointerCapture(e.pointerId);
                            }
                          }}
                          onClick={() => setSelected([p, r, v])}
                        />
                      );
                    })}
                  </g>
                ))}
              </g>
            ))}
          </svg>
          {mobile.compact && (
            <output>
              Vertex {v + 1} ·{' '}
              {mobile.tool === 'move'
                ? 'Move point enabled'
                : 'Tap a vertex, then choose Move point'}
            </output>
          )}
        </div>
      </ModelPlanPortal>
      <label>
        Outline vertex
        <select
          value={selected.join(':')}
          onChange={(e) => setSelected(e.target.value.split(':').map(Number))}
        >
          {polygons.flatMap((polygon, p) =>
            polygon.flatMap((ring, r) =>
              ring.slice(0, -1).map((_, v) => (
                <option key={`${p}:${r}:${v}`} value={`${p}:${r}:${v}`}>
                  Wing {p + 1} · {r ? `Courtyard ${r}` : 'Outside'} · vertex{' '}
                  {v + 1}
                </option>
              )),
            ),
          )}
        </select>
      </label>
      {active && (
        <div className="model-properties-grid">
          {(['Longitude', 'Latitude'] as const).map((label, axis) => (
            <ModelField
              key={`${selected}:${axis}`}
              label={label}
              value={active[axis]}
              buildingId={edit.id}
              field={`outline:${selected}:${axis}`}
              workspace={workspace}
              step={0.000001}
              onCommit={(value) => {
                const next = [...active];
                next[axis] = Number(value);
                return onCommit(update(selected, next));
              }}
            />
          ))}
        </div>
      )}
      <div className="model-toolbar">
        <button
          onClick={() => {
            const next = structuredClone(polygons),
              ring = next[p][r],
              b = ring[(v + 1) % (ring.length - 1)];
            ring.splice(v + 1, 0, [
              (active[0] + b[0]) / 2,
              (active[1] + b[1]) / 2,
            ]);
            onCommit(
              remapBuildingSurfaces(
                edit,
                edit.geometry.type === 'Polygon'
                  ? { type: 'Polygon', coordinates: next[0] }
                  : { type: 'MultiPolygon', coordinates: next },
              ),
            );
          }}
        >
          Insert midpoint after vertex
        </button>
        <button
          disabled={!active || polygons[p][r].length <= 4}
          onClick={() => {
            const next = structuredClone(polygons),
              ring = next[p][r];
            ring.splice(v, 1);
            if (v === 0) ring[ring.length - 1] = [...ring[0]];
            if (
              onCommit(
                remapBuildingSurfaces(
                  edit,
                  edit.geometry.type === 'Polygon'
                    ? { type: 'Polygon', coordinates: next[0] }
                    : { type: 'MultiPolygon', coordinates: next },
                ),
              )
            )
              setSelected([p, r, 0]);
          }}
        >
          Remove vertex
        </button>
      </div>
    </section>
  );
}
