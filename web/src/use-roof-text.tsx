/* SVG text handles share the roof application surface and its numeric alternatives. */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Plus, Copy, Trash2, Type } from 'lucide-react';
import type { MapEdit, Position } from './types';
import type { RoofText } from './visual-types';
import type { RoofSurface } from './custom-roof';
import type { EditorWorkspace } from './editor-workspace';
import { validateEdit } from './editor-model';
import { ModelField } from './ModelField';
import { ModelButton } from './ModelButton';
import { useModelMobile } from './model-mobile';

/** Roof text uses the same planar coordinates and command boundary as roof points. */
export function useRoofText({
  edit,
  partId,
  roof,
  project,
  unproject,
  svg,
  workspace,
  onApply,
  selectedId,
  onSelect,
}: {
  edit: MapEdit;
  partId: string;
  roof: RoofSurface | null;
  project: (point: number[]) => number[];
  unproject: (x: number, y: number) => Position;
  svg: RefObject<SVGSVGElement | null>;
  workspace?: EditorWorkspace;
  onApply: (edit: MapEdit) => void;
  selectedId?: string;
  onSelect: (id?: string) => void;
}) {
  const mobile = useModelMobile();
  const labels = edit.properties.appearance?.roofTexts?.[partId] || [];
  const [preview, setPreview] = useState<RoofText[] | null>(null);
  const current = useRef(preview);
  const drag = useRef<{
    id: string;
    start: Position;
    labels: RoofText[];
    pointer: number;
  } | null>(null);
  const [error, setError] = useState('');
  const shown = preview || labels,
    active = shown.find((t) => t.id === selectedId);
  const command = (next: RoofText[]): MapEdit => ({
    ...edit,
    properties: {
      ...edit.properties,
      appearance: {
        ...edit.properties.appearance,
        roofTexts: { ...edit.properties.appearance?.roofTexts, [partId]: next },
      },
    },
  });
  const previewEdit = useMemo(
    () =>
      preview
        ? {
            ...edit,
            properties: {
              ...edit.properties,
              appearance: {
                ...edit.properties.appearance,
                roofTexts: {
                  ...edit.properties.appearance?.roofTexts,
                  [partId]: preview,
                },
              },
            },
          }
        : null,
    [preview, edit, partId],
  );
  const cancel = () => {
    drag.current = null;
    current.current = null;
    setPreview(null);
  };
  useEffect(() => {
    cancel();
  }, [mobile.tool]);
  useEffect(() => {
    if (drag.current && drag.current.id !== selectedId) cancel();
  }, [selectedId]);
  const apply = (next: MapEdit) => {
    const errors = validateEdit(next);
    if (errors.length) {
      setError(errors.join(' '));
      return false;
    }
    setError('');
    onApply(next);
    return true;
  };
  const patch = (patch: Partial<RoofText>) => {
    if (!active) return false;
    return apply(
      command(labels.map((t) => (t.id === active.id ? { ...t, ...patch } : t))),
    );
  };
  const add = () => {
    if (!roof?.triangles.length || labels.length >= 20) return;
    const k = (Math.PI / 180) * 6371008.8;
    const candidates = roof.triangles
      .map((triangle) => {
        const p = triangle.map((i) => roof.points[i]),
          sx = k * Math.cos((p[0][1] * Math.PI) / 180);
        const lengths = [0, 1, 2].map((i) =>
          Math.hypot(
            (p[(i + 1) % 3][0] - p[(i + 2) % 3][0]) * sx,
            (p[(i + 1) % 3][1] - p[(i + 2) % 3][1]) * k,
          ),
        );
        const perimeter = lengths.reduce((a, b) => a + b, 0);
        const area2 =
          Math.abs(
            (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) -
              (p[2][0] - p[0][0]) * (p[1][1] - p[0][1]),
          ) *
          sx *
          k;
        return {
          radius: area2 / perimeter,
          coordinates: [0, 1].map(
            (axis) =>
              p.reduce((sum, point, i) => sum + point[axis] * lengths[i], 0) /
              perimeter,
          ) as Position,
        };
      })
      .sort((a, b) => b.radius - a.radius);
    const place = candidates[0];
    if (!place || place.radius < 0.1) {
      setError('This roof has no room for a readable text label.');
      return;
    }
    const label: RoofText = {
      id: crypto.randomUUID(),
      text: 'Building name',
      coordinates: place.coordinates,
      width: Math.min(4, place.radius * 1.2),
      height: Math.min(1, place.radius * 0.6),
      rotation: 0,
      colour: '#172b36',
      textWeight: 'bold',
      textAlign: 'center',
    };
    if (apply(command([...labels, label]))) onSelect(label.id);
  };
  const location = (x: number, y: number) => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    const p = new DOMPoint(x, y).matrixTransform(matrix.inverse());
    return unproject(p.x, p.y);
  };
  const field = (
    key: 'width' | 'height' | 'rotation',
    label: string,
    min: number,
    max: number,
  ) =>
    active && (
      <ModelField
        label={label}
        value={active[key]}
        buildingId={edit.id}
        field={`roof-text:${active.id}:${key}`}
        workspace={workspace}
        min={min}
        max={max}
        onCommit={(v) => patch({ [key]: Number(v) })}
      />
    );
  return {
    cancel,
    preview: previewEdit,
    properties: (
      <section className="model-roof-text-properties" aria-label="Roof text">
        <ModelButton
          icon={<Plus />}
          disabled={!roof || labels.length >= 20}
          onClick={add}
        >
          Add roof text
        </ModelButton>
        {error && <p role="alert">{error}</p>}
        {!!labels.length && (
          <label>
            Roof text label
            <select
              aria-label="Roof text label"
              value={selectedId || ''}
              onChange={(e) => onSelect(e.target.value || undefined)}
            >
              <option value="">Choose text</option>
              {labels.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.text}
                </option>
              ))}
            </select>
          </label>
        )}
        {active && (
          <>
            <ModelField
              label="Roof surface text"
              type="text"
              value={active.text}
              buildingId={edit.id}
              field={`roof-text:${active.id}:text`}
              workspace={workspace}
              onCommit={(text) => patch({ text })}
            />
            <div className="model-properties-grid">
              {field('width', 'Text width (m)', 0.01, 50)}
              {field('height', 'Text height (m)', 0.01, 50)}
              {field('rotation', 'Text rotation (degrees)', -360, 360)}
            </div>
            <ModelField
              label="Text longitude"
              value={active.coordinates[0]}
              buildingId={edit.id}
              field={`roof-text:${active.id}:longitude`}
              workspace={workspace}
              step={0.000001}
              min={-180}
              max={180}
              onCommit={(v) =>
                patch({ coordinates: [Number(v), active.coordinates[1]] })
              }
            />
            <ModelField
              label="Text latitude"
              value={active.coordinates[1]}
              buildingId={edit.id}
              field={`roof-text:${active.id}:latitude`}
              workspace={workspace}
              step={0.000001}
              min={-90}
              max={90}
              onCommit={(v) =>
                patch({ coordinates: [active.coordinates[0], Number(v)] })
              }
            />
            <ModelField
              label="Roof text colour"
              type="color"
              value={active.colour}
              buildingId={edit.id}
              field={`roof-text:${active.id}:colour`}
              workspace={workspace}
              onCommit={(colour) => patch({ colour })}
            />
            <label>
              Text weight
              <select
                aria-label="Roof text weight"
                value={active.textWeight || 'bold'}
                onChange={(e) =>
                  patch({ textWeight: e.target.value as 'regular' | 'bold' })
                }
              >
                <option value="regular">Regular</option>
                <option value="bold">Bold</option>
              </select>
            </label>
            <label>
              Text alignment
              <select
                aria-label="Roof text alignment"
                value={active.textAlign || 'center'}
                onChange={(e) =>
                  patch({
                    textAlign: e.target.value as 'left' | 'center' | 'right',
                  })
                }
              >
                <option value="left">Left</option>
                <option value="center">Centre</option>
                <option value="right">Right</option>
              </select>
            </label>
            <div className="model-toolbar">
              <ModelButton
                icon={<Copy />}
                disabled={labels.length >= 20}
                title={
                  labels.length >= 20
                    ? 'Each wing supports up to 20 text labels'
                    : 'Duplicate selected text'
                }
                onClick={() => {
                  const next = { ...active, id: crypto.randomUUID() };
                  if (apply(command([...labels, next]))) onSelect(next.id);
                }}
              >
                Duplicate text
              </ModelButton>
              <ModelButton
                icon={<Trash2 />}
                variant="destructive"
                onClick={() => {
                  apply(command(labels.filter((t) => t.id !== active.id)));
                  onSelect(undefined);
                }}
              >
                Delete text
              </ModelButton>
            </div>
          </>
        )}
        {!active && (
          <p className="small-note">
            <Type size={14} /> Text follows the roof surface. Select it to
            change its wording or placement.
          </p>
        )}
      </section>
    ),
    overlay: (
      <g className="model-roof-text-overlay">
        {shown.map((label) => {
          const [x, y] = project(label.coordinates),
            k = (Math.PI / 180) * 6371008.8;
          const px =
            project([
              label.coordinates[0] +
                label.width /
                  (k * Math.cos((label.coordinates[1] * Math.PI) / 180)),
              label.coordinates[1],
            ])[0] - x;
          const py =
            y -
            project([
              label.coordinates[0],
              label.coordinates[1] + label.height / k,
            ])[1];
          return (
            <g
              key={label.id}
              data-roof-text={label.id}
              transform={`translate(${x} ${y}) rotate(${-label.rotation})`}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                onSelect(label.id);
                if (mobile.compact && mobile.tool !== 'move') return;
                const start = location(e.clientX, e.clientY);
                if (!start) return;
                drag.current = {
                  id: label.id,
                  start,
                  labels,
                  pointer: e.pointerId,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d || d.pointer !== e.pointerId) return;
                const p = location(e.clientX, e.clientY);
                if (!p) return;
                e.stopPropagation();
                const next = d.labels.map((t) =>
                  t.id === d.id
                    ? {
                        ...t,
                        coordinates: [
                          t.coordinates[0] + p[0] - d.start[0],
                          t.coordinates[1] + p[1] - d.start[1],
                        ] as Position,
                      }
                    : t,
                );
                current.current = next;
                setPreview(next);
              }}
              onPointerUp={(e) => {
                if (!drag.current) return;
                e.stopPropagation();
                if (current.current) apply(command(current.current));
                cancel();
              }}
              onPointerCancel={cancel}
            >
              <rect
                x={-px / 2}
                y={-py / 2}
                width={px}
                height={py}
                fill="transparent"
                stroke={label.id === selectedId ? '#087cf0' : '#687a89'}
                strokeWidth={label.id === selectedId ? 2 : 0.7}
                strokeDasharray="3 2"
              />
              <text
                className="model-roof-text-label"
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.min(
                  py * 0.8,
                  (px / Math.max(1, label.text.length)) * 1.6,
                )}
                fontWeight={label.textWeight === 'regular' ? 400 : 700}
                fill={label.colour}
                pointerEvents="none"
              >
                {label.text}
              </text>
            </g>
          );
        })}
      </g>
    ),
  };
}
