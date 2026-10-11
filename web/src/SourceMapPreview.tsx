import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type {
  GeoJSONSource,
  Map as MapInstance,
  MapMouseEvent,
} from 'maplibre-gl';
import { api } from './supabase';
import { proposalBounds, proposalFeatures } from './source-map-preview';
import type {
  SourceCursor,
  SourceFilters,
  SourceMapPage,
  SourceMapRow,
} from './source-updates';

const source = 'source-proposals';
const layers = [
  'source-proposals-fill',
  'source-proposals-line',
  'source-proposals-before',
  'source-proposals-points',
];
export default function SourceMapPreview({
  mapRef,
  filters,
  revision,
  onFocus,
  onClose,
}: {
  mapRef: RefObject<MapInstance | null>;
  filters: SourceFilters;
  revision: number;
  onFocus: (id: string) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<SourceMapRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [showBefore, setShowBefore] = useState(false);
  const [asOf, setAsOf] = useState('');
  const panelRef = useRef<HTMLElement>(null);
  const filterKey = JSON.stringify(filters);
  const focusRef = useRef(onFocus);
  focusRef.current = onFocus;
  useEffect(() => {
    const abort = new AbortController();
    setRows([]);
    setLoading(true);
    setError('');
    setTotal(0);
    setAsOf('');
    const load = async () => {
      let cursor: SourceCursor | null = null;
      let cutoff: string | undefined;
      const collected = new Map<string, SourceMapRow>();
      try {
        do {
          const page: SourceMapPage = await api(
            'source-updates-map',
            {
              filters: JSON.parse(filterKey),
              cursor,
              ...(cutoff ? { asOf: cutoff } : {}),
            },
            { signal: abort.signal },
          );
          if (abort.signal.aborted) return;
          cutoff = page.asOf;
          for (const row of page.rows) collected.set(row.id, row);
          setRows([...collected.values()]);
          setTotal(page.total);
          setAsOf(cutoff);
          if (
            page.nextCursor &&
            JSON.stringify(page.nextCursor) === JSON.stringify(cursor)
          )
            throw new Error(
              'Preview stopped at an unchanged page. Refresh to try again.',
            );
          cursor = page.nextCursor;
          if (cursor)
            await new Promise<void>((resolve) => {
              const finish = () => {
                clearTimeout(timer);
                abort.signal.removeEventListener('abort', finish);
                resolve();
              };
              const timer = setTimeout(finish, 100);
              abort.signal.addEventListener('abort', finish, { once: true });
            });
        } while (cursor && !abort.signal.aborted);
        if (!abort.signal.aborted) setLoading(false);
      } catch (e) {
        if (!abort.signal.aborted) {
          setError((e as Error).message);
          setLoading(false);
        }
      }
    };
    const timer = setTimeout(() => void load(), 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [filterKey, revision, reload]);
  const features = useMemo(
    () => proposalFeatures(rows, showBefore),
    [rows, showBefore],
  );
  const featuresRef = useRef(features);
  featuresRef.current = features;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const draw = () => {
      if (!map.getSource(source))
        map.addSource(source, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      if (!map.getLayer(layers[0])) {
        map.addLayer({
          id: layers[0],
          source,
          type: 'fill',
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.16 },
        });
        map.addLayer({
          id: layers[1],
          source,
          type: 'line',
          filter: [
            'all',
            ['!=', ['geometry-type'], 'Point'],
            ['==', ['get', 'side'], 'after'],
          ],
          paint: { 'line-color': ['get', 'color'], 'line-width': 3 },
        });
        map.addLayer({
          id: layers[2],
          source,
          type: 'line',
          filter: [
            'all',
            ['!=', ['geometry-type'], 'Point'],
            ['==', ['get', 'side'], 'before'],
          ],
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 3,
            'line-dasharray': [2, 2],
          },
        });
        map.addLayer({
          id: layers[3],
          source,
          type: 'circle',
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-color': ['get', 'color'],
            'circle-radius': 6,
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 2,
          },
        });
      }
      (map.getSource(source) as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: featuresRef.current,
      });
    };
    const click = (event: MapMouseEvent) => {
      const visible = layers.filter((id) => map.getLayer(id));
      if (!visible.length) return;
      const feature = map.queryRenderedFeatures(event.point, {
        layers: visible,
      })[0];
      if (typeof feature?.properties?.proposalId === 'string')
        focusRef.current(feature.properties.proposalId);
    };
    if (map.isStyleLoaded()) draw();
    else map.once('idle', draw);
    map.on('style.load', draw);
    map.on('click', click);
    return () => {
      map.off('style.load', draw);
      map.off('idle', draw);
      map.off('click', click);
      for (const id of [...layers].reverse())
        if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(source)) map.removeSource(source);
    };
  }, [mapRef]);
  useEffect(() => {
    (mapRef.current?.getSource(source) as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features,
    });
  }, [features, mapRef]);
  const missing = rows.filter((r) => !r.before && !r.after).length;
  const simplified = rows.filter(
    (r) => r.before?.simplified || r.after?.simplified,
  ).length;
  const fit = () => {
    const bounds = proposalBounds(features);
    const map = mapRef.current;
    if (!bounds || !map) return;
    const canvas = map.getContainer().getBoundingClientRect();
    const panel = panelRef.current?.getBoundingClientRect();
    const padding = { top: 48, bottom: 32, left: 48, right: 32 };
    if (panel) {
      if (canvas.width < 600)
        padding.top = Math.min(
          canvas.height * 0.55,
          panel.bottom - canvas.top + 16,
        );
      else
        padding.left = Math.min(
          canvas.width * 0.55,
          panel.right - canvas.left + 24,
        );
    }
    map.fitBounds(bounds, { padding, maxZoom: 18 });
  };
  return (
    <section
      ref={panelRef}
      className="source-map-preview"
      aria-label="Proposed changes map preview"
    >
      <header>
        <strong>Proposed changes</strong>
        <button onClick={onClose} aria-label="Close map preview">
          ×
        </button>
      </header>
      <output aria-live="polite">
        {loading ? 'Loading' : error ? 'Partial preview' : 'Preview ready'} ·{' '}
        {rows.length.toLocaleString()}
        {loading ? ` / ${total.toLocaleString()}` : ''} updates ·{' '}
        {missing.toLocaleString()} without a map location
      </output>
      <div className="source-preview-key">
        <span className="add">Additions</span>
        <span className="modify">Changes</span>
        <span className="remove">Removals (dashed)</span>
      </div>
      <label>
        <input
          type="checkbox"
          checked={showBefore}
          onChange={(e) => setShowBefore(e.target.checked)}
        />{' '}
        Show previous shapes (grey dashed)
      </label>
      <div className="source-inline-actions">
        <button onClick={fit} disabled={!features.length}>
          Fit all changes
        </button>
        <button onClick={() => setReload((n) => n + 1)}>Refresh preview</button>
      </div>
      {error && <p role="alert">{error}</p>}
      <details>
        <summary>About this preview</summary>
        <small>
          Current inbox filters · read-only source overlay. Saved corrections
          still take precedence. Click a shape or use the inbox to inspect it.
          {simplified > 0
            ? ` ${simplified.toLocaleString()} complex shapes are simplified; open details for exact outlines.`
            : ''}
          {asOf
            ? ` Loaded from ${new Date(asOf).toLocaleTimeString()}; refresh after source changes.`
            : ''}
        </small>
      </details>
    </section>
  );
}
