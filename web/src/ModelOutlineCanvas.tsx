import { Trash2 as ActionTrash2 } from 'lucide-react';
import { ModelButton } from './ModelButton';
/* The interactive SVG has equivalent vertex-selection and numeric controls below it. */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { MapEdit } from './types';
import type { EditorWorkspace } from './editor-workspace';
import {
  buildingTopology,
  polygonsOf,
  remapBuildingSurfaces,
} from './building-surfaces';
import { modelFeature } from './model-authoring';
import { useModelSurface } from './model-surface';
import { ModelField } from './ModelField';
import { useOutlineTools } from './use-outline-tools';
import { moveBoundaryVertex } from './model-architecture';
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
  const [error, setError] = useState('');
  const topology = buildingTopology(modelFeature(edit)),
    curves = edit.properties.modelDocument?.curves || [];
  const vertexId = (p: number, r: number, v: number) =>
    topology.parts[p]?.rings[r]?.vertexIds[v];
  const generated = (p: number, r: number, v: number) =>
    curves.some(
      (c) =>
        c.vertexIds.includes(vertexId(p, r, v)) &&
        c.startVertexId !== vertexId(p, r, v) &&
        c.endVertexId !== vertexId(p, r, v),
    );
  const affectsCurve = (p: number, r: number, v: number) =>
    curves.some((c) => c.vertexIds.includes(vertexId(p, r, v)));
  const tapStart = useRef<{
    x: number;
    y: number;
    id: number;
    point: number[];
    exact: boolean;
  } | null>(null);
  useEffect(() => {
    if (!polygons[selected[0]]?.[selected[1]]?.[selected[2]])
      setSelected([0, 0, 0]);
  }, [polygons, selected]);
  const tools = useOutlineTools(edit, selected, onCommit, workspace);
  const shown = preview || edit,
    shownPolygons = polygonsOf(shown.geometry),
    pixel = (east - west) / 600;
  const update = (indices: number[], point: number[]) => {
    const [p, r, v] = indices;
    return moveBoundaryVertex(edit, p, r, v, point);
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
  useModelSurface(
    svg,
    edit.id,
    'footprint',
    (x, y) => [origin[0] + x / sx, origin[1] - y / k, 0],
    navigation.viewBox + JSON.stringify(origin),
    cancel,
    preview || tools.preview ? { edit: (preview || tools.preview)! } : null,
  );
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
              if (event.key === 'Escape' && tools.drawing) {
                event.preventDefault();
                event.stopPropagation();
                tools.cancel();
                return;
              }
              if (event.key === 'Escape' && drag.current) {
                event.preventDefault();
                event.stopPropagation();
                drag.current = null;
                setPreview(null);
              }
            }}
            tabIndex={0}
            onPointerDownCapture={(e) => {
              if (!tools.drawing || e.button !== 0) return;
              if (!e.isPrimary) {
                tapStart.current = null;
                return;
              }
              const id = (e.target as Element).getAttribute(
                'data-outline-vertex',
              );
              const point = id ? id.split(':').map(Number) : null;
              tapStart.current = {
                x: e.clientX,
                y: e.clientY,
                id: e.pointerId,
                point: point
                  ? polygons[point[0]][point[1]][point[2]]
                  : location(e),
                exact: !!point,
              };
              svg.current?.setPointerCapture(e.pointerId);
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerMove={(e) => {
              if (drag.current)
                try {
                  setPreview(update(drag.current, location(e)));
                  setError('');
                } catch (error) {
                  setError(
                    error instanceof Error ? error.message : String(error),
                  );
                }
            }}
            onPointerUp={(e) => {
              const tap = tapStart.current;
              tapStart.current = null;
              if (
                tap &&
                tap.id === e.pointerId &&
                Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 8
              )
                tools.tap(tap.point, tap.exact);
              if (preview) onCommit(preview);
              drag.current = null;
              setPreview(null);
            }}
            onPointerCancel={() => {
              tapStart.current = null;
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
                      data-surface-background
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
                            if (
                              (!mobile.compact || mobile.tool === 'move') &&
                              !generated(p, r, v)
                            ) {
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
            {tools.drawing && (
              <g pointerEvents="none">
                <polyline
                  points={tools.path.map((p) => xy(p).join(',')).join(' ')}
                  fill="none"
                  stroke="#1764ed"
                  strokeWidth={pixel * 3}
                  strokeDasharray={`${pixel * 8} ${pixel * 4}`}
                />
                {tools.path.map((p, i) => {
                  const [x, y] = xy(p);
                  return (
                    <circle
                      key={i}
                      cx={x}
                      cy={y}
                      r={pixel * 5}
                      fill="#1764ed"
                    />
                  );
                })}
              </g>
            )}
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
      {tools.controls}
      {generated(p, r, v) && (
        <p>
          This point is generated by a curve. Use Curves and rounded corners to
          edit its controls.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
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
              disabled={generated(p, r, v)}
              onCommit={(value) => {
                const next = [...active];
                next[axis] = Number(value);
                try {
                  return onCommit(update(selected, next));
                } catch (error) {
                  setError(
                    error instanceof Error ? error.message : String(error),
                  );
                  return false;
                }
              }}
            />
          ))}
        </div>
      )}
      <div className="model-toolbar">
        <ModelButton
          variant="outline"
          disabled={!active || affectsCurve(p, r, v)}
          title={
            affectsCurve(p, r, v)
              ? 'Edit the parametric curve or change it to Straight before inserting points.'
              : undefined
          }
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
        </ModelButton>
        <ModelButton
          variant="destructive"
          icon={<ActionTrash2 />}
          disabled={
            !active || polygons[p][r].length <= 4 || affectsCurve(p, r, v)
          }
          title={
            affectsCurve(p, r, v)
              ? 'Change the adjoining curves to Straight before removing their anchor.'
              : undefined
          }
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
        </ModelButton>
      </div>
    </section>
  );
}
