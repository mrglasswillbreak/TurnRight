import { WorkspacePane } from './WorkspaceFrame';
import { gisApi } from './gis-api';
import type { GisDataState } from './useGisData';

export function GisDatasetCatalogue({
  state: viewState,
}: {
  state: GisDataState;
}) {
  const {
    editable,
    onEndEditingSession,
    attempt,
    dataset,
    setId,
    datasets,
    refresh,
    setEpoch,
    name,
    setName,
    mutate,
    error,
  } = viewState;

  return (
    <WorkspacePane
      id="left"
      title="Datasets"
      className="gis-pane gis-workspace"
    >
      {editable && onEndEditingSession && (
        <details>
          <summary>Geometry editing session</summary>
          <p>
            Up to 500 dataset features can join Edit at once. End this session
            to unload saved GIS geometry and clear its undo history. Saved
            changes remain in the shared draft.
          </p>
          <button onClick={() => void attempt(onEndEditingSession)}>
            Save and end geometry session
          </button>
        </details>
      )}
      <div className="gis-toolbar">
        <label>
          Dataset
          <select
            value={dataset?.id || ''}
            onChange={(e) => setId(e.target.value)}
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({(d.count || 0).toLocaleString()})
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() =>
            void attempt(async () => {
              await refresh();
              setEpoch((e) => e + 1);
            })
          }
        >
          Refresh
        </button>
      </div>
      {editable && (
        <details>
          <summary>Import an attribute CSV</summary>
          <p>
            Quoted values and leading-zero identifiers are preserved. Join this
            private table to a spatial dataset in Analyze.
          </p>
          <label>
            Table name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={160}
            />
          </label>
          <input
            aria-label="Import CSV"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void attempt(async () => {
                  if (file.size > 2500000) throw Error('CSV exceeds 2.5 MB.');
                  const csv = await file.text();
                  const created = await mutate(() =>
                    gisApi('gis-csv-import', {
                      name,
                      csv,
                      operationId: crypto.randomUUID(),
                    }),
                  );
                  setId(created.id);
                });
              e.target.value = '';
            }}
          />
        </details>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </WorkspacePane>
  );
}
