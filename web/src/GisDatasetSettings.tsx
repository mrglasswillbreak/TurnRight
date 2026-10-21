import { WorkspacePane } from './WorkspaceFrame';
import { gisApi } from './gis-api';
import GisSchema from './GisSchema';
import type { GisDataState } from './useGisData';

export function GisDatasetSettings({
  state: viewState,
}: {
  state: GisDataState;
}) {
  const { editable, dataset, query, attempt, mutate, loading, selected } =
    viewState;
  if (!dataset) return null;

  return (
    <WorkspacePane
      id="right"
      title="Schema, style and exports"
      className="gis-pane gis-workspace"
    >
      {editable && (
        <GisSchema
          key={dataset.id + ':' + dataset.revision}
          dataset={dataset}
          query={{ ...query, datasetId: dataset.id }}
          save={(next) =>
            attempt(() =>
              mutate(() =>
                gisApi('gis-dataset-save', {
                  dataset: next,
                  expectedRevision: dataset.revision,
                  operationId: crypto.randomUUID(),
                }),
              ),
            )
          }
        />
      )}
      <details>
        <summary>Export filtered or selected data</summary>
        <p>
          Exports run against this exact revision. A download includes CRS and
          provenance metadata.
        </p>
        <div className="gis-toolbar">
          {['geojson', 'csv', 'gpkg'].map((format) => (
            <button
              key={format}
              disabled={!editable || loading}
              onClick={() =>
                void attempt(() =>
                  mutate(() =>
                    gisApi('gis-job-start', {
                      operationId: crypto.randomUUID(),
                      tool: 'export',
                      name: dataset.name + ' export',
                      input: {
                        ...query,
                        datasetId: dataset.id,
                        revision: dataset.revision,
                        ...(selected.size ? { keys: [...selected] } : {}),
                      },
                      parameters: { format, crs: 'EPSG:4326' },
                    }),
                  ),
                )
              }
            >
              {format === 'gpkg' ? 'GeoPackage' : format.toUpperCase()}
            </button>
          ))}
        </div>
        <p>Open Analyze to follow the job and download the result.</p>
      </details>
    </WorkspacePane>
  );
}
