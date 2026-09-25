import {
  Check as ActionCheck,
  Plus as ActionPlus,
  Trash2 as ActionTrash2,
} from 'lucide-react';
import { ModelButton } from './ModelButton';
/* The roof SVG supports spatial gestures; point lists and numeric fields provide equivalent keyboard controls. */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
import { useRoofText } from './use-roof-text';
import { useModelSurface } from './model-surface';
import { ModelField } from './ModelField';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapEdit, Position } from './types';
import type {
  BuildingTopology,
  CustomRoof,
  RoofDraft,
  RoofPoint,
} from './visual-types';
import { customRoofSurface, type RoofSurface } from './custom-roof';
import { buildingDisplay } from './map-display';
import { buildingTopology } from './building-surfaces';
import { proposeHipRoof } from './roof-proposal';
import {
  ModelPlanPortal,
  ModelPlanTools,
  useModelMobile,
  useModelPlanNavigation,
  useModelSvgUnits,
} from './model-mobile';

export function RoofPlanEditor({
  edit,
  partId,
  polygon,
  topology,
  height,
  illustrative,
  draft,
  onDraft,
  onApply,
  onSurface,
  focusedSurface,
  focusedText,
  onTextSelect,
  autoSave = false,
  workspace,
}: {
  edit: MapEdit;
  partId: string;
  polygon: number[][][];
  topology: BuildingTopology['parts'][number];
  height: number;
  illustrative?: boolean;
  draft: RoofDraft | null;
  onDraft: (value: RoofDraft | null) => void;
  onApply: (edit: MapEdit) => void;
  onSurface: (index: number | undefined) => void;
  focusedSurface?: number;
  focusedText?: string;
  onTextSelect: (id?: string) => void;
  autoSave?: boolean;
  workspace?: import('./editor-workspace').EditorWorkspace;
}) {
  const mobile = useModelMobile();
  const [tool, setTool] = useState<'select' | 'point' | 'ridge' | 'valley'>(
    'select',
  );
  const [proposalError, setProposalError] = useState('');
  useEffect(() => {
    if (mobile.compact && mobile.tool === 'move') setTool('select');
  }, [mobile.compact, mobile.tool]);
  const [selected, setSelected] = useState(''),
    [from, setFrom] = useState(''),
    [surface, setSurface] = useState<number | null>(null);
  useEffect(() => setSurface(focusedSurface ?? null), [focusedSurface]);
  const svg = useRef<SVGSVGElement>(null),
    dragging = useRef<string | null>(null),
    lastValid = useRef<RoofSurface | null>(null);
  const latestRoof = useRef<CustomRoof | null>(null);
  const gestureRoof = useRef<CustomRoof | null>(null);
  const editButton = useRef<HTMLButtonElement>(null),
    selectTool = useRef<HTMLButtonElement>(null),
    hadDraft = useRef(!!draft);
  const hasDraft = !!draft;
  useEffect(() => {
    if (hadDraft.current !== hasDraft)
      (hasDraft ? selectTool.current : editButton.current)?.focus();
    hadDraft.current = hasDraft;
  }, [hasDraft]);
  const existing = edit.properties.appearance?.roofs?.[partId];
  const roof = useMemo(
    () =>
      draft?.roof ||
      existing || {
        eaves: Math.max(0.1, height - Math.min(1.8, height * 0.18)),
        points: [],
        lines: [],
      },
    [draft?.roof, existing, height],
  );
  const result = useMemo(() => {
    try {
      return { generated: customRoofSurface(polygon, roof, height), error: '' };
    } catch (e) {
      return { generated: null, error: (e as Error).message };
    }
  }, [polygon, roof, height]);
  const generated = result.generated;
  let error = result.error;
  if (generated) lastValid.current = generated;
  if (draft && draft.geometryRevision !== JSON.stringify(edit.geometry))
    error =
      'The wing outline changed. Cancel this roof draft and reopen it against the current outline.';
  const shown = generated || lastValid.current;
  const points = polygon.flat(),
    west = Math.min(...points.map((p) => p[0])),
    east = Math.max(...points.map((p) => p[0])),
    south = Math.min(...points.map((p) => p[1])),
    north = Math.max(...points.map((p) => p[1]));
  const sx = Math.cos((((south + north) / 2) * Math.PI) / 180),
    span = Math.max((east - west) * sx, north - south, 0.000001),
    scale = 260 / span;
  const project = (p: number[]) => [
    20 + (p[0] - west) * sx * scale,
    280 - (p[1] - south) * scale,
  ];
  const unproject = (x: number, y: number): Position => [
    west + (x - 20) / scale / sx,
    south + (280 - y) / scale,
  ];
  const update = (next: CustomRoof, continuous = false) => {
    latestRoof.current = next;
    onDraft({
      buildingId: edit.id,
      partId,
      geometryRevision: JSON.stringify(edit.geometry),
      roof: next,
    });
    if (autoSave && !continuous && !dragging.current) apply(next);
  };
  const start = () => update(structuredClone(roof));
  const location = (clientX: number, clientY: number) => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return unproject(p.x, p.y);
  };
  const snap = (
    coordinates: Position,
  ): Pick<RoofPoint, 'coordinates' | 'vertexId'> => {
    const xy = project(coordinates);
    for (let r = 0; r < polygon.length; r++)
      for (let v = 0; v < polygon[r].length - 1; v++) {
        const q = project(polygon[r][v]);
        if (Math.hypot(xy[0] - q[0], xy[1] - q[1]) < 9)
          return {
            coordinates: polygon[r][v] as Position,
            vertexId: topology.rings[r].vertexIds[v],
          };
      }
    return { coordinates };
  };
  const pick = (id: string, current = roof) => {
    setSelected(id);
    setSurface(null);
    onSurface(undefined);
    if (tool === 'ridge' || tool === 'valley') {
      if (from && from !== id && current.points.some((p) => p.id === from)) {
        update({
          ...current,
          lines: [
            ...current.lines,
            { id: crypto.randomUUID(), from, to: id, kind: tool },
          ],
        });
        setFrom('');
      } else setFrom(id);
    }
  };
  const add = (coordinates: Position) => {
    const near = roof.points.find(
      (p) =>
        Math.hypot(
          ...project(p.coordinates).map((v, i) => v - project(coordinates)[i]),
        ) < 9,
    );
    if (near) {
      pick(near.id);
      return;
    }
    const attached = snap(coordinates),
      point: RoofPoint = {
        id: crypto.randomUUID(),
        ...attached,
        elevation: attached.vertexId ? roof.eaves : height,
      };
    const next = { ...roof, points: [...roof.points, point] };
    update(next);
    pick(point.id, next);
  };
  const active = roof.points.find((p) => p.id === selected);
  const textTools = useRoofText({
    edit,
    partId,
    roof: shown,
    project,
    unproject,
    svg,
    workspace,
    onApply,
    selectedId: focusedText,
    onSelect: onTextSelect,
  });
  const cancel = () => {
    textTools.cancel();
    dragging.current = null;
    if (gestureRoof.current) update(gestureRoof.current, true);
    latestRoof.current = null;
    gestureRoof.current = null;
  };
  const navigation = useModelPlanNavigation(
    [0, 0, 300, 300],
    cancel,
    (target) =>
      mobile.tool === 'move' &&
      !!target.closest('[data-roof-point], [data-roof-text]'),
  );
  const [handleUnit] = useModelSvgUnits(svg, navigation.viewBox + hasDraft);
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  useEffect(() => {
    cancelRef.current();
  }, [tool]);
  const patch = (value: Partial<RoofPoint>) =>
    update({
      ...roof,
      points: roof.points.map((p) =>
        p.id === selected ? { ...p, ...value } : p,
      ),
    });
  const apply = (candidate = roof) => {
    if (!draft && !autoSave) return;
    try {
      customRoofSurface(polygon, candidate, height);
    } catch {
      return;
    }
    const appearance = structuredClone(edit.properties.appearance || {});
    (appearance.roofs ||= {})[partId] = structuredClone(candidate);
    if (
      !appearance.parts?.[partId]?.heightMode &&
      !appearance.parts?.[partId]?.height &&
      height !== buildingDisplay(edit.properties).metres
    ) {
      (appearance.parts ||= {})[partId] = {
        ...appearance.parts?.[partId],
        height,
        heightMode: 'metres',
        confidence: 'inferred',
        provenance:
          'Total wing height adopted from the current visual reference when applying this roof.',
      };
    }
    onApply({
      ...edit,
      properties: {
        ...edit.properties,
        appearance,
        buildingTopology: buildingTopology({
          type: 'Feature',
          geometry: edit.geometry,
          properties: { ...edit.properties, id: edit.id },
        }),
      },
    });
  };
  useModelSurface(
    svg,
    partId,
    'roof',
    (x, y) => [...unproject(x, y), roof.eaves],
    navigation.viewBox + JSON.stringify([west, south, scale, roof.eaves]),
    cancel,
    textTools.preview
      ? { edit: textTools.preview }
      : draft
        ? { roof: draft }
        : null,
  );
  return (
    <section className="roof-plan" aria-label="Wing roof plan">
      <p className="small-note">
        Elevations are metres above ground; total wing height is {height} m
        {illustrative ? ' (illustrative; actual height unknown)' : ''}. Boundary
        points follow outline vertices. Courtyards remain open.
      </p>
      {textTools.properties}
      {!draft ? (
        <>
          <ModelButton
            variant="outline"
            ref={editButton}
            className="editor-primary"
            onClick={start}
          >
            {existing ? 'Edit custom roof' : 'Create custom roof'}
          </ModelButton>
          {!existing && (
            <ModelButton
              variant="outline"
              className="editor-secondary"
              onClick={() => {
                try {
                  update(proposeHipRoof(polygon, height));
                  setProposalError('');
                } catch (e) {
                  setProposalError((e as Error).message);
                }
              }}
            >
              Preview approximate hip roof
            </ModelButton>
          )}
          {proposalError && (
            <p className="form-error" role="alert">
              {proposalError}
            </p>
          )}
          {existing && (
            <ModelButton
              variant="outline"
              icon={<ActionCheck />}
              onClick={() => {
                const appearance = structuredClone(edit.properties.appearance!);
                delete appearance.roofs?.[partId];
                onApply({
                  ...edit,
                  properties: { ...edit.properties, appearance },
                });
              }}
            >
              Use standard roof
            </ModelButton>
          )}
        </>
      ) : (
        <>
          <fieldset className="roof-tools" aria-label="Roof drawing tools">
            {(['select', 'point', 'ridge', 'valley'] as const).map((t) => (
              <ModelButton
                variant="outline"
                key={t}
                ref={t === 'select' ? selectTool : undefined}
                aria-pressed={tool === t}
                onClick={() => {
                  setTool(t);
                  setFrom('');
                  if (mobile.compact) {
                    mobile.openPanel('none');
                    mobile.setTool('select');
                  }
                }}
              >
                {t === 'select'
                  ? mobile.compact
                    ? 'Select point'
                    : 'Select / move'
                  : t === 'point'
                    ? 'Add point'
                    : `Draw ${t}`}
              </ModelButton>
            ))}
          </fieldset>
          <output className="small-note">
            {from
              ? 'Choose the second endpoint.'
              : tool === 'select'
                ? 'Select a point to move it, or a surface to read its slope.'
                : tool === 'point'
                  ? 'Tap the plan to add a control point.'
                  : 'Tap two points to draw a roof line.'}
          </output>
          {autoSave ? (
            <ModelField
              label="Eaves elevation (m)"
              value={roof.eaves}
              buildingId={edit.id}
              workspace={workspace}
              field={`roof:${partId}:eaves`}
              min={0.1}
              max={height}
              step={0.1}
              onCommit={(value) => {
                const eaves = Number(value);
                update({
                  ...roof,
                  eaves,
                  points: roof.points.map((p) =>
                    p.vertexId ? { ...p, elevation: eaves } : p,
                  ),
                });
                return true;
              }}
            />
          ) : (
            <label className="field-label">
              Eaves elevation (m)
              <input
                type="number"
                min={0.1}
                max={height}
                step={0.1}
                value={roof.eaves}
                onChange={(e) => {
                  const eaves = Number(e.target.value);
                  update({
                    ...roof,
                    eaves,
                    points: roof.points.map((p) =>
                      p.vertexId ? { ...p, elevation: eaves } : p,
                    ),
                  });
                }}
              />
            </label>
          )}
        </>
      )}
      {roof.provenance && <p className="small-note">{roof.provenance}</p>}
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
      {error && (
        <p role="alert" className="notice">
          {error} Last valid roof preview is retained. Correct the plan before
          applying.
        </p>
      )}
      <label className="field-label">
        Roof surface
        <select
          aria-label="Roof surface"
          value={surface ?? ''}
          onChange={(e) => {
            const index =
              e.target.value === '' ? undefined : Number(e.target.value);
            setSurface(index ?? null);
            onSurface(index);
          }}
        >
          <option value="">Select a roof surface</option>
          {shown?.slopes.map((s, i) => (
            <option key={i} value={i}>
              Surface {i + 1} · {s.toFixed(1)}° slope
            </option>
          ))}
        </select>
      </label>
      {surface !== null && shown?.slopes[surface] !== undefined && (
        <output>
          Surface {surface + 1}: {shown.slopes[surface].toFixed(1)}° calculated
          slope
        </output>
      )}
      {draft && (
        <>
          <label className="field-label">
            Control point
            <select value={selected} onChange={(e) => pick(e.target.value)}>
              <option value="">Select a control point</option>
              {roof.points.map((p, i) => (
                <option key={p.id} value={p.id}>
                  Point {i + 1} · {p.elevation} m
                  {p.vertexId ? ' · attached to outline' : ''}
                </option>
              ))}
            </select>
          </label>
          <ModelButton
            variant="default"
            icon={<ActionPlus />}
            onClick={() => {
              const c: Position = [(west + east) / 2, (south + north) / 2];
              add(c);
            }}
          >
            Add point with coordinates
          </ModelButton>
          {active && (
            <>
              {autoSave ? (
                <>
                  <ModelField
                    label="Point elevation (m)"
                    value={active.elevation}
                    disabled={!!active.vertexId}
                    buildingId={edit.id}
                    workspace={workspace}
                    field={`roof:${partId}:${active.id}:elevation`}
                    min={0.1}
                    max={height}
                    onCommit={(v) => {
                      patch({ elevation: Number(v) });
                      return true;
                    }}
                  />
                  {(['Longitude', 'Latitude'] as const).map((label, i) => (
                    <ModelField
                      key={`${active.id}:${i}`}
                      label={label}
                      value={active.coordinates[i]}
                      disabled={!!active.vertexId}
                      buildingId={edit.id}
                      workspace={workspace}
                      field={`roof:${partId}:${active.id}:${i}`}
                      step={0.000001}
                      onCommit={(v) => {
                        const coordinates = [...active.coordinates] as Position;
                        coordinates[i] = Number(v);
                        patch({ coordinates });
                        return true;
                      }}
                    />
                  ))}
                </>
              ) : (
                <>
                  {' '}
                  <label className="field-label">
                    Point elevation (m)
                    <input
                      type="number"
                      disabled={!!active.vertexId}
                      min={0.1}
                      max={height}
                      step={0.1}
                      value={active.elevation}
                      onChange={(e) =>
                        patch({ elevation: Number(e.target.value) })
                      }
                    />
                  </label>
                  {(['Longitude', 'Latitude'] as const).map((name, i) => (
                    <label className="field-label" key={name}>
                      {name}
                      <input
                        type="number"
                        step="0.000001"
                        disabled={!!active.vertexId}
                        value={active.coordinates[i]}
                        onChange={(e) => {
                          const coordinates = [
                            ...active.coordinates,
                          ] as Position;
                          coordinates[i] = Number(e.target.value);
                          patch({ coordinates });
                        }}
                      />
                    </label>
                  ))}
                </>
              )}
              {active.vertexId && (
                <ModelButton
                  variant="outline"
                  onClick={() => patch({ vertexId: undefined })}
                >
                  Detach from outline vertex
                </ModelButton>
              )}
              <ModelButton
                variant="destructive"
                icon={<ActionTrash2 />}
                onClick={() => {
                  update({
                    ...roof,
                    points: roof.points.filter((p) => p.id !== selected),
                    lines: roof.lines.filter(
                      (l) => l.from !== selected && l.to !== selected,
                    ),
                  });
                  setSelected('');
                  setFrom('');
                }}
              >
                Remove selected point and its lines
              </ModelButton>
            </>
          )}
          <ul className="roof-line-list">
            {roof.lines.map((l, i) => (
              <li key={l.id}>
                {l.kind} {i + 1}
                <ModelButton
                  variant="destructive"
                  icon={<ActionTrash2 />}
                  aria-label={`Remove ${l.kind} ${i + 1}`}
                  onClick={() =>
                    update({
                      ...roof,
                      lines: roof.lines.filter((line) => line.id !== l.id),
                    })
                  }
                >
                  Remove
                </ModelButton>
              </li>
            ))}
          </ul>
          <div className="roof-apply">
            <ModelButton
              variant="outline"
              className="editor-primary"
              disabled={!!error}
              onClick={() => apply()}
            >
              {autoSave ? 'Save valid roof' : 'Apply roof'}
            </ModelButton>
            <ModelButton
              variant="outline"
              onClick={() => {
                onDraft(null);
                setFrom('');
                setSelected('');
              }}
            >
              {autoSave ? 'Done editing roof' : 'Cancel roof'}
            </ModelButton>
          </div>
          <p className="small-note">
            {autoSave
              ? 'Completed valid actions save to the draft. Incomplete plans remain in local recovery.'
              : 'This unfinished plan is saved in local recovery. Apply commits it as one undo step.'}
          </p>
        </>
      )}
    </section>
  );
}
