import { useCallback, useEffect, useState, lazy, Suspense } from 'react';
import type { Map as MapInstance } from 'maplibre-gl';
import type { Dataset, WorkspaceCapabilities } from './gis-types';
import type { MapEdit } from './types';
import type { SourceRecord } from './editor-model';
import type { ValidationIssue } from './validation';
import { gisApi } from './gis-api';
import './gis-workspace.css';
const Data = lazy(() => import('./GisData'));
const Analyze = lazy(() => import('./GisAnalyze'));
const Review = lazy(() => import('./GisReview'));
const Publish = lazy(() => import('./GisPublish'));
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
  mutate: <T>(work: () => Promise<T>) => Promise<T>;
  refresh: () => Promise<void>;
  onEdit: GisWorkspaceProps['onEdit'];
  onEndEditingSession?: GisWorkspaceProps['onEndEditingSession'];
}
export default function GisWorkspace(props: GisWorkspaceProps) {
  const [capabilities, setCapabilities] = useState(props.capabilities),
    [datasets, setDatasets] = useState<Dataset[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const [catalogue, access] = await Promise.all([
      gisApi('gis-datasets', {}),
      gisApi('workspace-capabilities', {}),
    ]);
    setDatasets(catalogue);
    setCapabilities(access);
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [refresh]);
  const mutate = async <T,>(work: () => Promise<T>): Promise<T> => {
    setBusy(true);
    setError('');
    try {
      await props.beforeChange();
      const result = await work();
      await refresh();
      return result;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const panel = capabilities
    ? {
        datasets,
        capabilities,
        map: props.map,
        mutate,
        refresh,
        onEdit: props.onEdit,
        onEndEditingSession: props.onEndEditingSession,
      }
    : null;
  return (
    <aside
      className="gis-workspace editor-card"
      aria-label="Campus GIS workspace"
      aria-busy={busy}
    >
      <header>
        <div>
          <small>Campus GIS · shared draft</small>
          <h2>
            {props.section === 'gis-data'
              ? 'Data'
              : props.section === 'gis-analyze'
                ? 'Analyze'
                : props.section === 'gis-review'
                  ? 'Review'
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
          Dataset queries and processing need a connection. Your existing editor
          recovery remains available in Edit.
        </output>
      )}
      <Suspense fallback={<p>Opening workspace…</p>}>
        {panel &&
          (props.section === 'gis-data' ? (
            <Data {...panel} />
          ) : props.section === 'gis-analyze' ? (
            <Analyze {...panel} />
          ) : props.section === 'gis-review' || props.section === 'members' ? (
            <Review
              {...panel}
              membershipsOnly={props.section === 'members'}
              issues={props.issues}
              onIssue={props.onIssue}
            />
          ) : (
            <Publish {...panel} />
          ))}
      </Suspense>
      {!capabilities && (
        <button
          onClick={() => void refresh().catch((e) => setError(e.message))}
        >
          Retry connection
        </button>
      )}
    </aside>
  );
}
