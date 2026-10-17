import { useState } from 'react';
import type { Geometry } from 'geojson';
import type {
  PrecisionSettings,
  SnapKind,
  Constraint,
} from './editor-precision';
import { bearing, geometryLines } from './editor-precision';
import type { Position } from './types';
import './precision-controls.css';

export default function PrecisionControls({
  settings,
  onSettings,
  drawing,
  selection,
  onSegment,
  onRectangle,
  onTrace,
  onClose,
}: {
  settings: PrecisionSettings;
  onSettings: (settings: PrecisionSettings) => void;
  drawing: boolean;
  selection?: Geometry;
  onSegment: (length: number, bearing: number) => void;
  onRectangle: (width: number, depth: number, bearing: number) => void;
  onTrace: (points: Position[]) => void;
  onClose: () => void;
}) {
  const [length, setLength] = useState('10'),
    [depth, setDepth] = useState('8'),
    [angle, setAngle] = useState('0');
  const [reference, setReference] = useState<Position[][]>([]),
    [line, setLine] = useState(0);
  const [start, setStart] = useState('0'),
    [end, setEnd] = useState('1'),
    [reverse, setReverse] = useState(false);
  const [error, setError] = useState('');
  const act = (fn: () => void) => {
    try {
      fn();
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section
      className="precision-controls editor-card"
      aria-label="Precision drawing"
    >
      <header>
        <strong>Precision drawing</strong>
        <button onClick={onClose} aria-label="Close precision drawing">
          ×
        </button>
      </header>
      <label>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) =>
            onSettings({ ...settings, enabled: e.target.checked })
          }
        />
        Reference snapping
      </label>
      <label>
        Snap tolerance (pixels)
        <input
          type="range"
          min="4"
          max="30"
          value={settings.tolerance}
          onChange={(e) =>
            onSettings({ ...settings, tolerance: +e.target.value })
          }
        />
        <output>{settings.tolerance}</output>
      </label>
      <div>
        {(['endpoint', 'vertex', 'midpoint', 'edge'] as SnapKind[]).map(
          (kind) => (
            <label key={kind}>
              <input
                type="checkbox"
                checked={settings.kinds.includes(kind)}
                onChange={(e) =>
                  onSettings({
                    ...settings,
                    kinds: e.target.checked
                      ? [...settings.kinds, kind]
                      : settings.kinds.filter((v) => v !== kind),
                  })
                }
              />
              {kind}
            </label>
          ),
        )}
      </div>
      <label>
        Segment constraint
        <select
          value={settings.constraint}
          onChange={(e) =>
            onSettings({
              ...settings,
              constraint: e.target.value as Constraint,
            })
          }
        >
          <option value="free">Free</option>
          <option value="right-angle">Right angles</option>
          <option value="parallel">Parallel to reference</option>
          <option value="perpendicular">Perpendicular to reference</option>
        </select>
      </label>
      <label>
        Reference bearing (°)
        <input
          type="number"
          value={settings.referenceBearing}
          onChange={(e) => {
            const value = +e.target.value;
            if (Number.isFinite(value))
              onSettings({ ...settings, referenceBearing: value });
          }}
        />
      </label>
      <fieldset>
        <legend>Exact construction</legend>
        <label>
          Length / width (m)
          <input
            type="number"
            min="0.01"
            max="10000"
            step="0.1"
            value={length}
            onChange={(e) => setLength(e.target.value)}
          />
        </label>
        <label>
          Bearing (° clockwise from north)
          <input
            type="number"
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
          />
        </label>
        <button
          disabled={!drawing}
          onClick={() => act(() => onSegment(+length, +angle))}
        >
          Add precise segment
        </button>
        <label>
          Rectangle depth (m)
          <input
            type="number"
            min="0.01"
            max="10000"
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
          />
        </label>
        <button
          disabled={!drawing}
          onClick={() => act(() => onRectangle(+length, +depth, +angle))}
        >
          Construct rectangle from first point
        </button>
        <small>
          Place the first point on the map. Finish commits the drawing; Cancel
          discards it.
        </small>
      </fieldset>
      <fieldset>
        <legend>Trace reference edges</legend>
        <button
          disabled={!selection || drawing}
          onClick={() => {
            const lines = geometryLines(selection!);
            setReference(lines);
            setLine(0);
            setStart('0');
            setEnd(String(Math.max(1, (lines[0]?.length || 2) - 1)));
            if (lines[0]?.length > 1)
              onSettings({
                ...settings,
                referenceBearing: bearing(lines[0][0], lines[0][1]),
              });
          }}
        >
          Use selected feature as reference
        </button>
        {!!reference.length && (
          <>
            <label>
              Part / ring
              <select
                value={line}
                onChange={(e) => {
                  const i = +e.target.value;
                  setLine(i);
                  setStart('0');
                  setEnd(String(reference[i].length - 1));
                }}
              >
                {reference.map((_, i) => (
                  <option key={i} value={i}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <label>
              First vertex (0 based)
              <input
                type="number"
                min="0"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              Last vertex
              <input
                type="number"
                min="1"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={reverse}
                onChange={(e) => setReverse(e.target.checked)}
              />
              Reverse direction
            </label>
            <button
              disabled={!drawing}
              onClick={() =>
                act(() => {
                  const a = +start,
                    b = +end,
                    ring = reference[line];
                  if (
                    !Number.isInteger(a) ||
                    !Number.isInteger(b) ||
                    a < 0 ||
                    b <= a ||
                    b >= ring.length
                  )
                    throw new Error('Select a valid consecutive vertex range.');
                  const points = ring.slice(a, b + 1);
                  onTrace(reverse ? points.reverse() : points);
                })
              }
            >
              Add reference vertices to drawing
            </button>
          </>
        )}
      </fieldset>
      <small>
        Hold Alt to bypass snapping. Reference snaps do not create routing
        connections.
      </small>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
