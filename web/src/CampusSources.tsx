import {
  ChevronRight,
  FileUp,
  Globe2,
  Layers,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from './supabase';
import type { CampusImport } from './map-import-types';
import type { CampusWorkspaceState } from './useCampusWorkspace';

export function CampusSources({ state }: { state: CampusWorkspaceState }) {
  const {
    current,
    setAdding,
    adding,
    sourceKind,
    setSourceKind,
    sourceName,
    setSourceName,
    sourceUrl,
    setSourceUrl,
    busy,
    run,
    refresh,
    openJob,
    sources,
    scheduledOsm,
    imports,
  } = state;

  return (
    <>
      <div className="campus-title">
        <div>
          <span className="editor-eyebrow">CURRENT CAMPUS</span>
          <h3>{current.name}</h3>
        </div>
        <Button onClick={() => setAdding(!adding)}>
          <Plus /> Import data
        </Button>
      </div>
      {adding && (
        <section className="import-source-form">
          <h4>Add a map source</h4>
          <div className="campus-source-choices">
            {(
              [
                ['file', 'Upload files', FileUp],
                ['osm', 'OpenStreetMap', Globe2],
                ['arcgis', 'ArcGIS', Layers],
              ] as const
            ).map(([id, label, Icon]) => (
              <Button
                key={id}
                variant={sourceKind === id ? 'default' : 'outline'}
                aria-pressed={sourceKind === id}
                onClick={() => setSourceKind(id)}
              >
                <Icon />
                {label}
              </Button>
            ))}
          </div>
          <label>
            Source name
            <input
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="Buildings and footpaths"
            />
          </label>
          {sourceKind === 'arcgis' && (
            <label>
              Public ArcGIS URL
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://…/FeatureServer"
              />
            </label>
          )}
          {sourceKind === 'osm' && (
            <p>
              Download buildings, paths and places intersecting this campus
              boundary. Source data stays private until reviewed and published.
            </p>
          )}
          <Button
            disabled={busy || !sourceName}
            onClick={() =>
              void run(async () => {
                const result = await api<{ job: CampusImport }>(
                  'import-start',
                  {
                    name: sourceName,
                    kind: sourceKind,
                    url: sourceUrl,
                  },
                );
                await refresh();
                await openJob(result.job);
              })
            }
          >
            Continue <ChevronRight />
          </Button>
        </section>
      )}
      <h4>Saved sources</h4>
      {!sources.length && (
        <p>
          No sources yet. Import a file or connect OpenStreetMap or ArcGIS to
          begin.
        </p>
      )}
      {sources.map((source) => (
        <article key={source.id} className="campus-source">
          <div>
            <strong>{source.name}</strong>
            <p>
              {source.kind === 'osm'
                ? 'OpenStreetMap'
                : source.kind === 'arcgis'
                  ? 'ArcGIS'
                  : 'Uploaded files'}
            </p>
          </div>
          <div className="campus-actions">
            <label>
              Refresh
              <select
                aria-label={`Refresh schedule for ${source.name}`}
                value={source.schedule}
                disabled={source.kind === 'file' || busy}
                onChange={(e) =>
                  void run(async () => {
                    await api('source-schedule', {
                      sourceId: source.id,
                      schedule: e.target.value,
                    });
                    await refresh();
                  })
                }
              >
                <option value="manual">Manual</option>
                <option
                  value="daily"
                  disabled={source.kind === 'osm' && !scheduledOsm}
                >
                  Daily review checks
                </option>
              </select>
            </label>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await api<{ job: CampusImport }>(
                    'import-start',
                    { sourceId: source.id },
                  );
                  await refresh();
                  await openJob(result.job);
                })
              }
            >
              <RefreshCw />
              {source.kind === 'file' ? 'Replace file' : 'Check source'}
            </Button>
          </div>
        </article>
      ))}
      <h4>Recent imports</h4>
      {imports.map((item) => (
        <button
          className="campus-import-row"
          key={item.id}
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await api<{ job: CampusImport }>('import-get', {
                importId: item.id,
              });
              await openJob(result.job);
            })
          }
        >
          <span>
            <strong>
              {sources.find((s) => s.id === item.source_id)?.name || 'Import'}
            </strong>
            <small>{new Date(item.created_at).toLocaleString()}</small>
          </span>
          <span>{item.status}</span>
          <ChevronRight size={16} />
        </button>
      ))}
    </>
  );
}
