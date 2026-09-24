import { createRoot } from 'react-dom/client';
import { useState, useSyncExternalStore } from 'react';
import { EditorWorkspace } from '../../src/editor-workspace';
import type { BuildingSelection } from '../../src/visual-types';
import { openDB } from 'idb';
import { PhotoModelPreview } from '../../src/PhotoModelPreview';
import PhotoModelWorkspace from '../../src/PhotoModelWorkspace';
import { photoModelProposals } from '../../src/photo-model-proposals';
import type { CampusData } from '../../src/types';
import '../../src/styles.css';
import '../../src/editor.css';
import { MapView } from '../../src/MapView';
import type { Map as MapInstance } from 'maplibre-gl';
const base: CampusData = await (await fetch('/fixture-campus.json')).json();
const updated = structuredClone(base);
for (const { edit } of photoModelProposals(base))
  if (edit) {
    const f = updated.map.features.find((f) => f.properties?.id === edit.id)!;
    f.properties = { ...edit.properties, id: edit.id };
  }
declare global {
  interface Window {
    modelMetrics: unknown[];
    modelCandidate: CampusData;
  }
}
window.modelMetrics = [];
window.modelCandidate = updated;
const parameters = new URLSearchParams(location.search);
if (parameters.has('map'))
  updated.visuals = await (await fetch('/fixture-visuals.json')).json();
declare global {
  interface Window {
    benchmarkMap: MapInstance;
  }
}
function MapHarness() {
  const [dark, setDark] = useState(false),
    [simple, setSimple] = useState(false);
  return (
    <main
      className="app-shell"
      style={{ height: '100dvh', position: 'relative' }}
    >
      <MapView
        data={parameters.has('after') ? updated : base}
        threeD
        simple={simple}
        dark={dark}
        onSelect={() => {}}
        onReady={(map) => {
          window.benchmarkMap = map;
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 3,
          background: 'var(--background)',
          padding: 10,
        }}
      >
        <button
          onClick={() =>
            window.benchmarkMap.jumpTo({
              center: [3.2, 6.46],
              zoom: 0,
              pitch: 0,
            })
          }
        >
          Globe
        </button>
        <button
          onClick={() =>
            window.benchmarkMap.jumpTo({
              center: [3.1992, 6.4693],
              zoom: 18,
              pitch: 45,
            })
          }
        >
          Campus
        </button>
        <button onClick={() => setDark(!dark)}>Theme</button>
        <button onClick={() => setSimple(!simple)}>Detail</button>
      </div>
    </main>
  );
}
function Harness() {
  const [workspace] = useState(
    () =>
      new EditorWorkspace(
        [],
        async (batch) =>
          batch.edits.map(({ edit }) => ({
            ...edit,
            updated_at: new Date().toISOString(),
          })),
        async (state) => {
          const db = await openDB('model-benchmark-recovery', 1, {
            upgrade(db) {
              db.createObjectStore('drafts');
            },
          });
          await db.put('drafts', state, 'fixture-owner');
          db.close();
        },
      ),
  );
  useSyncExternalStore(workspace.subscribe, workspace.getRevision);
  const [selection, setSelection] = useState<BuildingSelection>();
  const [id, setId] = useState(base.photos![0].buildingId),
    [after, setAfter] = useState(false),
    [editing, setEditing] = useState(false);
  const data = after ? updated : base,
    feature = data.map.features.find((f) => f.properties?.id === id)!,
    photos = base.photos!.filter((p) => p.buildingId === id);
  return (
    <main style={{ padding: 20 }}>
      <label>
        Building
        <select
          aria-label="Building"
          value={id}
          onChange={(e) => setId(e.target.value)}
        >
          {[...new Set(base.photos!.map((p) => p.buildingId))].map((id) => (
            <option key={id} value={id}>
              {
                base.map.features.find((f) => f.properties?.id === id)
                  ?.properties?.name
              }
            </option>
          ))}
        </select>
      </label>
      <button onClick={() => setAfter((v) => !v)}>
        {after ? 'After' : 'Before'}
      </button>
      <button onClick={() => setEditing(true)}>Open workspace</button>
      <h1>
        {String(feature.properties?.name)} · {after ? 'After' : 'Before'}
      </h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          {photos.map((p) => (
            <figure key={p.id}>
              <img
                src={p.url}
                alt={p.alt}
                style={{
                  maxWidth: '100%',
                  maxHeight: 220,
                  objectFit: 'contain',
                }}
              />
              <figcaption>
                {p.caption} · {p.attribution}
              </figcaption>
            </figure>
          ))}
        </div>
        <PhotoModelPreview
          key={id}
          feature={feature}
          visual={data.visuals?.buildings.find((v) => v.id === id)}
          data={data}
          onMetrics={(m) => window.modelMetrics.push(m)}
        />
      </div>
      {editing && (
        <PhotoModelWorkspace
          edit={{
            id,
            kind: 'building',
            geometry: feature.geometry,
            properties: feature.properties!,
          }}
          data={data}
          workspace={workspace}
          selection={selection}
          onSelection={setSelection}
          onHistory={(redo) => {
            if (redo) workspace.redo();
            else workspace.undo();
            void workspace.flush();
          }}
          onEdit={(edit) => {
            workspace.commit([edit]);
            void workspace.flush();
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  parameters.has('map') ? <MapHarness /> : <Harness />,
);
