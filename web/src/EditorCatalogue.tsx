import { useGisActivity } from './useGisActivity';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Map as MapInstance } from 'maplibre-gl';
import type { CampusLayer, LayerViewState } from './campus-layer-types';
import type { Dataset, FeaturePage } from './gis-types';
import { useEditorSession } from './EditorSession';
import {
  catalogueEntries,
  featureReference,
  selectionKey,
  type CatalogueEntry,
} from './editor-session';
import { DockResize } from './EditorChrome';
import { gisApi } from './gis-api';
import { showGisPage } from './gis-map';

export default function EditorCatalogue({
  layers,
  view,
  onView,
  onProperties,
  onImport,
  map,
  children,
  blocked = false,
}: {
  layers: CampusLayer[];
  view: LayerViewState;
  onView: (view: LayerViewState) => void;
  onProperties: (entry: CatalogueEntry) => void;
  onImport: () => void;
  map: MapInstance | null;
  children?: ReactNode;
  blocked?: boolean;
}) {
  useGisActivity();
  const session = useEditorSession(),
    { state, datasets, refresh, setState } = session;
  const [query, setQuery] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [refresh]);
  const entries = useMemo(
    () => catalogueEntries(layers, datasets),
    [layers, datasets],
  );
  const activate = (entry: CatalogueEntry, table = false) => {
    if (entry.layer)
      onView({
        ...view,
        active: entry.layer.id,
        hidden: (view.hidden || []).filter((id) => id !== entry.layer!.id),
        shown: [...new Set([...(view.shown || []), entry.layer.id])],
      });
    session.setState((s) => ({
      ...s,
      activeEntry: entry.key,
      panel: table ? 'table' : 'catalogue',
      table: {
        open: table || s.table.open,
        kind: entry.dataset ? 'dataset' : 'layer',
        id: entry.dataset?.id || entry.layer?.id,
      },
      datasetVisibility: entry.dataset
        ? [...new Set([...s.datasetVisibility, entry.dataset.id])].slice(-5)
        : s.datasetVisibility,
    }));
  };
  return (
    <>
      <DatasetOverlays map={map} />
      {!state.catalogueOpen ? (
        <button
          className="editor-catalogue-toggle editor-card"
          onClick={() =>
            setState((s) => ({ ...s, catalogueOpen: true, panel: 'catalogue' }))
          }
        >
          Layers and data
        </button>
      ) : (
        <aside
          className="editor-catalogue editor-card"
          aria-label="Layers and datasets"
        >
          <header>
            <h2>Layers and data</h2>
            <button
              aria-label="Collapse catalogue"
              onClick={() =>
                session.setState((s) => ({ ...s, catalogueOpen: false }))
              }
            >
              ×
            </button>
          </header>
          <div className="editor-catalogue-content">
            <input
              type="search"
              aria-label="Search layers and datasets"
              placeholder="Find a layer or dataset"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="editor-catalogue-actions">
              {session.capabilities.capabilities.includes('edit') ? (
                <details>
                  <summary>Add data</summary>
                  <div>
                    <button disabled={blocked} onClick={onImport}>
                      Import spatial data / sources
                    </button>
                    <button
                      disabled={blocked}
                      onClick={() =>
                        session.setState((s) => ({
                          ...s,
                          panel: 'table',
                          table: { ...s.table, kind: 'dataset', open: true },
                        }))
                      }
                    >
                      Import attribute CSV
                    </button>
                    <button
                      disabled={blocked}
                      onClick={() => session.navigate('layer')}
                    >
                      Create layer or folder
                    </button>
                  </div>
                </details>
              ) : (
                <button onClick={onImport}>Switch campus</button>
              )}
              <button
                onClick={() => void refresh().catch((e) => setError(e.message))}
              >
                Refresh
              </button>
            </div>
            {error && <p role="alert">{error}</p>}
            <ul className="editor-catalogue-list">
              {entries
                .filter((entry) =>
                  (
                    entry.name +
                    ' ' +
                    (entry.layer?.sourceName ||
                      entry.dataset?.provenance.source ||
                      '')
                  )
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((entry) => {
                  const visible = entry.layer
                    ? !view.hidden?.includes(entry.layer.id) &&
                      (entry.layer.editorVisible ||
                        !!view.shown?.includes(entry.layer.id))
                    : state.datasetVisibility.includes(entry.dataset!.id);
                  return (
                    <li
                      key={entry.key}
                      className={
                        state.activeEntry === entry.key ? 'active' : ''
                      }
                    >
                      <label title="Temporary map visibility">
                        <input
                          type="checkbox"
                          aria-label={'Show ' + entry.name}
                          checked={visible}
                          onChange={(e) => {
                            if (entry.dataset)
                              session.setState((s) => ({
                                ...s,
                                datasetVisibility: e.target.checked
                                  ? [
                                      ...new Set([
                                        ...s.datasetVisibility,
                                        entry.dataset!.id,
                                      ]),
                                    ].slice(-5)
                                  : s.datasetVisibility.filter(
                                      (id) => id !== entry.dataset!.id,
                                    ),
                              }));
                            if (entry.layer)
                              onView({
                                ...view,
                                shown: e.target.checked
                                  ? [
                                      ...new Set([
                                        ...(view.shown || []),
                                        entry.layer!.id,
                                      ]),
                                    ]
                                  : (view.shown || []).filter(
                                      (id) => id !== entry.layer!.id,
                                    ),
                                hidden: e.target.checked
                                  ? (view.hidden || []).filter(
                                      (id) => id !== entry.layer!.id,
                                    )
                                  : [
                                      ...new Set([
                                        ...(view.hidden || []),
                                        entry.layer!.id,
                                      ]),
                                    ],
                              });
                          }}
                        />
                      </label>
                      <button
                        className="catalogue-name"
                        aria-pressed={state.activeEntry === entry.key}
                        onClick={() => activate(entry)}
                      >
                        <strong>{entry.name}</strong>
                        <small>
                          {entry.dataset
                            ? (entry.dataset.count || 0).toLocaleString() +
                              ' features · ' +
                              (entry.dataset.included ? 'Included' : 'Private')
                            : entry.layer?.role}
                          {entry.layer?.locked ? ' · Locked' : ''}
                        </small>
                      </button>
                      <details>
                        <summary aria-label={'Actions for ' + entry.name}>
                          …
                        </summary>
                        <div>
                          <button onClick={() => activate(entry, true)}>
                            Open attribute table
                          </button>
                          {entry.layer && entry.dataset && (
                            <button
                              onClick={() => {
                                activate(entry);
                                onProperties({ ...entry, dataset: undefined });
                              }}
                            >
                              Layer settings and locks
                            </button>
                          )}
                          <button
                            onClick={() => {
                              activate(entry);
                              onProperties(entry);
                            }}
                          >
                            Properties and styling
                          </button>
                        </div>
                      </details>
                    </li>
                  );
                })}
            </ul>
            {!entries.length && (
              <p>Add a source or asset table to start mapping.</p>
            )}
            {children}
          </div>
          <DockResize axis="horizontal" dimension="catalogue" />
        </aside>
      )}
    </>
  );
}
function DatasetOverlays({ map }: { map: MapInstance | null }) {
  const { state, datasets } = useEditorSession();
  return (
    <>
      {state.datasetVisibility.slice(0, 5).map((id) => {
        const dataset = datasets.find((d) => d.id === id);
        return dataset ? (
          <DatasetOverlay
            key={id}
            dataset={dataset}
            map={map}
            index={state.datasetVisibility.indexOf(id)}
          />
        ) : null;
      })}
    </>
  );
}
function DatasetOverlay({
  dataset,
  map,
  index,
}: {
  dataset: Dataset;
  map: MapInstance | null;
  index: number;
}) {
  const session = useEditorSession();
  const { setState, state, capabilities } = session;
  const query = state.datasetTables[dataset.id]?.query;
  const [page, setPage] = useState<FeaturePage>(),
    [error, setError] = useState('');
  useEffect(() => {
    if (!map) return;
    let generation = 0,
      disposed = false;
    const load = () => {
      const current = ++generation,
        bounds = map.getBounds();
      setPage(undefined);
      void gisApi('gis-query', {
        ...query,
        datasetId: dataset.id,
        revision: dataset.revision,
        geometry: true,
        limit: 100,
        bbox: [
          Math.max(-180, bounds.getWest()),
          Math.max(-90, bounds.getSouth()),
          Math.min(180, bounds.getEast()),
          Math.min(90, bounds.getNorth()),
        ],
      })
        .then((result) => {
          if (!disposed && current === generation) {
            setPage(result);
            setError('');
          }
        })
        .catch((e) => {
          if (!disposed && current === generation) setError(e.message);
        });
    };
    load();
    map.on('moveend', load);
    return () => {
      disposed = true;
      map.off('moveend', load);
    };
  }, [map, dataset.id, dataset.revision, query]);
  useEffect(() => {
    if (!map || !page || state.task === 'gis-review') return;
    return showGisPage(
      map,
      dataset,
      page.features.filter((f) => f.id !== state.editingFeature),
      new Set(
        state.selection
          .filter((f) => f.datasetId === dataset.id)
          .map(selectionKey),
      ),
      (key) => {
        const reference = featureReference(
          capabilities.campusId,
          key,
          dataset.id,
          page.revision,
        );
        setState((s) => ({
          ...s,
          activeEntry: 'dataset:' + dataset.id,
          panel: 'inspector',
          editingFeature: undefined,
          selection: [reference],
          table: { ...s.table, kind: 'dataset', id: dataset.id },
        }));
      },
      'workspace-dataset-' + dataset.id,
    );
  }, [
    map,
    page,
    dataset,
    state.selection,
    state.editingFeature,
    state.task,
    capabilities.campusId,
    setState,
  ]);
  return error || (page && page.total > page.features.length) ? (
    <output
      className="editor-map-limit"
      style={{ transform: `translateY(-${index * 52}px)` }}
    >
      {dataset.name}:{' '}
      {error ||
        page!.features.length +
          ' of ' +
          page!.total.toLocaleString() +
          ' features in view. Zoom in for detail.'}
    </output>
  ) : null;
}
