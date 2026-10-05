import { useEffect, useState } from 'react';
import type { GisPanelProps } from './GisWorkspace';
import type { DatasetFeature } from './gis-types';
import { useEditorSession } from './EditorSession';
import { selectionKey } from './editor-session';
import { gisApi } from './gis-api';
import { DockResize } from './EditorChrome';
export default function DatasetInspector({
  onEdit,
}: Pick<GisPanelProps, 'onEdit' | 'map'>) {
  const session = useEditorSession(),
    reference = session.state.selection[0];
  const dataset = session.datasets.find((d) => d.id === reference?.datasetId);
  const [result, setResult] = useState<{
      key: string;
      revision: number;
      feature: DatasetFeature;
    }>(),
    [error, setError] = useState('');
  const key = reference ? selectionKey(reference) : '';
  useEffect(() => {
    if (!dataset || !key) return;
    let current = true;
    setError('');
    setResult(undefined);
    void gisApi('gis-query', {
      datasetId: dataset.id,
      revision: dataset.revision,
      keys: [key],
      geometry: true,
      limit: 1,
    })
      .then((page) => {
        if (current) {
          const feature = page.features[0];
          setResult(
            feature ? { key, revision: page.revision, feature } : undefined,
          );
          setError(
            feature
              ? ''
              : 'This feature is no longer available. Refresh the dataset.',
          );
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [dataset, key]);
  const feature =
    result?.key === key && result.revision === dataset?.revision
      ? result.feature
      : undefined;
  if (!dataset || session.state.task !== 'map' || session.state.editingFeature)
    return null;
  return (
    <aside
      className="gis-workspace editor-task-dock editor-card"
      aria-label="Dataset feature properties"
    >
      <DockResize axis="horizontal" dimension="inspector" />
      <header>
        <div>
          <small>{dataset.name}</small>
          <h2>{String(feature?.properties.name || key)}</h2>
        </div>
        <button
          aria-label="Close dataset properties"
          onClick={() =>
            session.setState((s) => ({
              ...s,
              selection: [],
              panel: 'catalogue',
            }))
          }
        >
          ×
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {!feature && !error && <output>Loading current feature…</output>}
      {feature && (
        <>
          <dl>
            {dataset.schema.fields.map((field) => (
              <div key={field.name}>
                <dt>
                  {field.alias || field.name}
                  {field.unit ? ' (' + field.unit + ')' : ''}
                </dt>
                <dd>
                  {feature.properties[field.name] === null
                    ? 'No value'
                    : String(feature.properties[field.name] ?? '')}
                </dd>
              </div>
            ))}
          </dl>
          <button
            onClick={() =>
              session.setState((s) => ({
                ...s,
                panel: 'table',
                table: { open: true, kind: 'dataset', id: dataset.id },
              }))
            }
          >
            Open attributes
          </button>
          {session.capabilities.capabilities.includes('edit') &&
            feature.geometry && (
              <button
                onClick={() =>
                  void session
                    .track(async () => {
                      const response = await gisApi('gis-feature', {
                        datasetId: dataset.id,
                        key,
                        revision: dataset.revision,
                      });
                      onEdit(response.source, response.edit);
                    })
                    .catch((e) => setError(e.message))
                }
              >
                Edit geometry
              </button>
            )}
          <p>
            <small>
              Revision {dataset.revision} · {dataset.source_crs}
            </small>
          </p>
        </>
      )}
    </aside>
  );
}
