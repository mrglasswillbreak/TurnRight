import { useState } from 'react';
import type { Map as MapInstance } from 'maplibre-gl';
import type { CampusData, CampusPackage } from './types';
import { requestedCampus } from './campus-context';
import { renderMapLayout, downloadLayout, printLayout } from './gis-layout';
import './gis-workspace.css';

export default function PublicMapLayout({
  map,
  data,
  manifest,
}: {
  map: MapInstance;
  data: CampusData;
  manifest: CampusPackage;
}) {
  const [open, setOpen] = useState(true),
    [title, setTitle] = useState('Released campus map'),
    [paper, setPaper] = useState<'A4' | 'A3'>('A4'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  if (!open) return null;
  const expected = new URLSearchParams(location.search).get('layoutVersion');
  const mismatch = !!expected && expected !== manifest.version;
  const render = () =>
    renderMapLayout(
      map,
      data.gisPresentation || [],
      title,
      paper,
      data.sources
        .map((s) => s.attribution)
        .filter(Boolean)
        .join(' · '),
      {
        version: manifest.version,
        createdAt: manifest.createdAt,
        campusId: manifest.campus?.id || requestedCampus(),
        assets: manifest.assets,
      },
    );
  const exportMap = async (popup?: Window) => {
    setBusy(true);
    setError('');
    try {
      const canvas = await render();
      if (popup) printLayout(popup, canvas, paper, title);
      else await downloadLayout(canvas, title);
    } catch (e) {
      popup?.close();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <aside
      className="gis-workspace gis-public-layout"
      aria-label="Released map layout"
    >
      <header>
        <h2>Released map layout</h2>
        <button
          aria-label="Close map layout"
          onClick={() => {
            const url = new URL(location.href);
            url.searchParams.delete('mapLayout');
            url.searchParams.delete('layoutVersion');
            history.replaceState(null, '', url);
            setOpen(false);
          }}
        >
          ×
        </button>
      </header>
      <p>
        Release {manifest.version} · package date{' '}
        {manifest.createdAt.slice(0, 10)}. Exports include the immutable package
        hashes. Pan and zoom to frame the map.
      </p>
      {mismatch && (
        <p role="alert">
          This package differs from the requested release. Open its exact
          published deployment before exporting.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <label>
        Map title
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Paper
        <select
          value={paper}
          onChange={(e) => setPaper(e.target.value as 'A4' | 'A3')}
        >
          <option>A4</option>
          <option>A3</option>
        </select>
      </label>
      <div className="gis-toolbar">
        <button onClick={() => map.jumpTo({ pitch: 0, bearing: 0 })}>
          Set flat view
        </button>
        <button disabled={busy || mismatch} onClick={() => void exportMap()}>
          Export released PNG
        </button>
        <button
          disabled={busy || mismatch}
          onClick={() => {
            const popup = window.open('', '_blank');
            if (!popup) {
              setError('Allow the print window to export PDF.');
              return;
            }
            popup.opener = null;
            void exportMap(popup);
          }}
        >
          Print released map / Save as PDF
        </button>
      </div>
    </aside>
  );
}
