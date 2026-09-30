import { useEffect, useRef, useState } from 'react';
import type { Geometry } from 'geojson';
import type { CampusData, MapEdit } from './types';
import type { GeometryRequest, GeometryResult } from './layer-geometry-engine';
import { featureEdit } from './editor-features';
import { editableParts } from './geometry-window';
export default function LayerGeometry({
  data,
  edits,
  request,
  onClose,
  onPreview,
  onWindow,
  onDrawCutter,
}: {
  data: CampusData;
  edits: MapEdit[];
  request: GeometryRequest;
  onClose: () => void;
  onPreview: (edits: MapEdit[], title: string) => void;
  onWindow: (part: number, ring: number, start: number) => void;
  onDrawCutter: (request: GeometryRequest) => void;
}) {
  const [mode, setMode] = useState(request.operation),
    [cutter, setCutter] = useState(
      request.cutter ? JSON.stringify(request.cutter) : '',
    ),
    [part, setPart] = useState(0),
    [ring, setRing] = useState(0),
    [start, setStart] = useState(0),
    [replaceManual, setReplaceManual] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState<GeometryResult | null>(null);
  const worker = useRef<Worker | null>(null);
  const input = useRef({ data, edits });
  input.current = { data, edits };
  const resultInput = useRef<{ data: CampusData; edits: MapEdit[] } | null>(
    null,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => () => worker.current?.terminate(), []);
  const key = request.keys[0] || '',
    split = key.indexOf(':'),
    edit = featureEdit(
      data,
      key.slice(0, split) as MapEdit['kind'],
      key.slice(split + 1),
      edits,
    ),
    parts = edit ? editableParts(edit.geometry) : [];
  const cancel = () => {
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
  };
  const preview = () => {
    cancel();
    setError('');
    setResult(null);
    let geometry: Geometry | undefined;
    try {
      if (['split', 'hole'].includes(mode))
        geometry = JSON.parse(cutter) as Geometry;
    } catch {
      setError('Enter a GeoJSON LineString for a split or Polygon for a hole.');
      return;
    }
    const instance = new Worker(
      new URL('./layer-geometry.worker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.current = instance;
    setBusy(true);
    instance.onmessage = (event) => {
      setBusy(false);
      if (input.current.data !== data || input.current.edits !== edits)
        setError(
          'The map changed while calculating. Generate a fresh preview.',
        );
      else if (event.data.error) setError(event.data.error);
      else {
        resultInput.current = { data, edits };
        setResult(event.data.result);
      }
      instance.terminate();
    };
    instance.onerror = () => {
      setError(
        'Geometry worker stopped. Your draft is unchanged; retry the operation.',
      );
      cancel();
    };
    instance.postMessage({
      data,
      edits,
      request: {
        ...request,
        operation: mode,
        cutter: geometry,
        part,
        ring,
        replaceManual,
      },
    });
  };
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      className="layer-geometry editor-card"
      aria-label="Geometry operation"
    >
      <header>
        <h2>Geometry tools</h2>
        <button
          onClick={() => {
            cancel();
            onClose();
          }}
          aria-label="Close geometry tools"
        >
          ×
        </button>
      </header>
      <p>
        {request.keys.length} selected. Preview results on the map before
        applying. Undo restores the complete operation.
      </p>
      <label>
        Operation
        <select
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as typeof mode);
            setResult(null);
          }}
        >
          {[
            'merge',
            'split',
            'hole',
            'remove-hole',
            'remove-part',
            'regenerate',
          ].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      {['split', 'hole'].includes(mode) && (
        <button onClick={() => onDrawCutter({ ...request, operation: mode })}>
          Draw {mode === 'split' ? 'cutting line' : 'hole'} on map
        </button>
      )}
      {parts.length > 0 && (
        <fieldset>
          <legend>Parts and progressive vertex handles</legend>
          <label>
            Part
            <select
              value={part}
              onChange={(e) => {
                setPart(Number(e.target.value));
                setRing(0);
                setStart(0);
              }}
            >
              {parts.map((_, i) => (
                <option key={i} value={i}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          {edit?.geometry.type.includes('Polygon') && (
            <label>
              Ring
              <select
                value={ring}
                onChange={(e) => {
                  setRing(Number(e.target.value));
                  setStart(0);
                }}
              >
                {parts[part]?.map((_, i) => (
                  <option key={i} value={i}>
                    {i === 0 ? 'Exterior' : `Hole ${i}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            First vertex
            <input
              type="number"
              min="0"
              max={Math.max(0, (parts[part]?.[ring]?.length || 1) - 2)}
              value={start}
              onChange={(e) => setStart(Number(e.target.value))}
            />
          </label>
          <button
            onClick={() => {
              onWindow(part, ring, start);
              onClose();
            }}
          >
            Edit next 100 vertices on map
          </button>
          <p>All other vertices and holes are retained exactly.</p>
        </fieldset>
      )}
      {['split', 'hole'].includes(mode) && (
        <label>
          {mode === 'split' ? 'Cutting line' : 'Hole polygon'} (GeoJSON
          geometry)
          <textarea
            rows={5}
            value={cutter}
            onChange={(e) => setCutter(e.target.value)}
            placeholder={
              mode === 'split'
                ? '{"type":"LineString","coordinates":[[longitude,latitude],…]}'
                : '{"type":"Polygon","coordinates":[[[longitude,latitude],…]]}'
            }
          />
        </label>
      )}
      {mode === 'regenerate' && (
        <label>
          <input
            type="checkbox"
            checked={replaceManual}
            onChange={(e) => setReplaceManual(e.target.checked)}
          />
          Replace manually reshaped derived surfaces. Unchecked retains them.
        </label>
      )}
      <button disabled={busy} onClick={preview}>
        Generate preview
      </button>
      {busy && <button onClick={cancel}>Cancel operation</button>}
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <p>
            Area: {result.beforeArea.toFixed(1)} → {result.afterArea.toFixed(1)}{' '}
            m² · UTM projected calculation
          </p>
          <ul>
            {result.report.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <button
            disabled={
              !result.edits.length ||
              resultInput.current?.data !== data ||
              resultInput.current?.edits !== edits
            }
            onClick={() => {
              onPreview(
                result.edits,
                `Review ${mode} · ${request.keys.length} source features`,
              );
              onClose();
            }}
          >
            Review on map
          </button>
        </>
      )}
    </dialog>
  );
}
