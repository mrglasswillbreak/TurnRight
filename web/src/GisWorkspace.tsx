import { useEffect, useState, lazy, Suspense } from 'react';
import type { Map as MapInstance } from 'maplibre-gl';
import type { Dataset, WorkspaceCapabilities } from './gis-types';
import type { MapEdit } from './types';
import type { SourceRecord } from './editor-model';
import type { ValidationIssue } from './validation';
import { gisApi } from './gis-api';
import { useEditorSession } from './EditorSession';
import { DockResize } from './EditorChrome';
import './gis-workspace.css';
const Data = lazy(() => import('./GisData'));
const Analyze = lazy(() => import('./GisAnalyze'));
const Review = lazy(() => import('./GisReview'));
const Publish = lazy(() => import('./GisPublish'));
const Schema = lazy(() => import('./GisSchema'));
export interface GisWorkspaceProps {
  section: string;
  capabilities?: WorkspaceCapabilities;
  map: MapInstance | null;
  beforeChange: () => Promise<void>;
  onClose: () => void;
  onEdit: (source: SourceRecord | null, edit: MapEdit | null) => void;
  onEndEditingSession?: () => Promise<void>;
  issues: ValidationIssue[];
  onIssue: (issue: ValidationIssue) => void;
}
export interface GisPanelProps {
  datasets: Dataset[];
  capabilities: WorkspaceCapabilities;
  map: MapInstance | null;
  active?: boolean;
  mutate: <T>(work: () => Promise<T>) => Promise<T>;
  refresh: () => Promise<void>;
  onEdit: GisWorkspaceProps['onEdit'];
  onEndEditingSession?: GisWorkspaceProps['onEndEditingSession'];
}
export default function GisWorkspace(props: GisWorkspaceProps) {
  const session = useEditorSession();
  const { datasets, capabilities, refresh } = session;
  const [error, setError] = useState('');
  const [schemas, setSchemas] = useState<string[]>([]);
  const [visited, setVisited] = useState<string[]>([]);
  const tableOpen =
    session.state.table.open && session.state.table.kind === 'dataset';
  useEffect(() => {
    if (
      [
        'gis-analyze',
        'gis-review',
        'gis-publish',
        'members',
        'dataset-settings',
      ].includes(props.section)
    )
      setVisited((s) =>
        s.includes(props.section) ? s : [...s, props.section],
      );
  }, [props.section]);
  const mutate = async <T,>(work: () => Promise<T>): Promise<T> =>
    session.track(async () => {
      setError('');
      try {
        await props.beforeChange();
        const result = await work();
        await refresh();
        return result;
      } catch (e) {
        setError((e as Error).message);
        throw e;
      }
    });
  const panel: GisPanelProps = {
    datasets,
    capabilities,
    map: props.map,
    mutate,
    refresh,
    onEdit: props.onEdit,
    onEndEditingSession: props.onEndEditingSession,
  };
  const dataset =
    datasets.find((d) => d.id === session.state.table.id) || datasets[0];
  useEffect(() => {
    if (props.section === 'dataset-settings' && dataset)
      setSchemas((ids) =>
        ids.includes(dataset.id) ? ids : [...ids, dataset.id],
      );
  }, [props.section, dataset]);
  return (
    <>
      <section
        hidden={!tableOpen}
        className="gis-workspace editor-table-dock editor-card"
        aria-label="Attribute table"
      >
        <DockResize axis="vertical" dimension="table" />
        <header>
          <h2>Attribute table</h2>
          <div>
            <button onClick={() => session.navigate('dataset-settings')}>
              Fields and styling
            </button>
            <button
              aria-label="Close attribute table"
              onClick={() =>
                session.setState((s) => ({
                  ...s,
                  table: { ...s.table, open: false },
                  panel:
                    s.task !== 'map' || s.selection.length
                      ? 'inspector'
                      : 'catalogue',
                  expanded: false,
                }))
              }
            >
              ×
            </button>
          </div>
        </header>
        {error && <p role="alert">{error}</p>}
        <Suspense fallback={<p>Opening table…</p>}>
          <Data {...panel} active={tableOpen} />
        </Suspense>
      </section>
      {visited.map((section) => {
        const active = section === props.section;
        return (
          <aside
            key={section}
            hidden={!active}
            className="gis-workspace editor-task-dock editor-card"
            aria-label={active ? 'Campus GIS workspace' : undefined}
          >
            <DockResize axis="horizontal" dimension="inspector" />
            <header>
              <div>
                <small>Shared campus draft</small>
                <h2>
                  {section === 'gis-analyze'
                    ? 'Analyze'
                    : section === 'gis-review'
                      ? 'Review'
                      : section === 'members'
                        ? 'Campus memberships'
                        : section === 'dataset-settings'
                          ? 'Fields and styling'
                          : 'Publish'}
                </h2>
              </div>
              <button onClick={props.onClose} aria-label="Close GIS workspace">
                ×
              </button>
            </header>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            {!navigator.onLine && (
              <output>
                Shared queries and processing need a connection. Prepared
                editing and recovery remain available.
              </output>
            )}
            <Suspense fallback={<p>Opening task…</p>}>
              {section === 'gis-analyze' ? (
                <Analyze
                  {...panel}
                  active={active}
                  map={active ? props.map : null}
                />
              ) : section === 'gis-review' || section === 'members' ? (
                <Review
                  {...panel}
                  active={active}
                  map={active ? props.map : null}
                  issues={props.issues}
                  onIssue={props.onIssue}
                  membersOnly={section === 'members'}
                />
              ) : section === 'dataset-settings' ? (
                schemas.map((id) => {
                  const definition = datasets.find((d) => d.id === id);
                  return (
                    definition && (
                      <fieldset
                        key={id}
                        hidden={dataset?.id !== id}
                        disabled={!capabilities.capabilities.includes('edit')}
                      >
                        <Schema
                          key={definition.id}
                          dataset={definition}
                          query={{
                            ...session.state.datasetTables[definition.id]
                              ?.query,
                            datasetId: definition.id,
                          }}
                          save={(next) =>
                            mutate(() =>
                              gisApi('gis-dataset-save', {
                                dataset: next,
                                expectedRevision: next.revision,
                                operationId: crypto.randomUUID(),
                              }),
                            )
                          }
                        />
                      </fieldset>
                    )
                  );
                })
              ) : (
                <Publish
                  {...panel}
                  active={active}
                  map={active ? props.map : null}
                />
              )}
            </Suspense>
          </aside>
        );
      })}
    </>
  );
}
