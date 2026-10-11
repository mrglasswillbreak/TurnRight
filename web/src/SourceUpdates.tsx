import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from 'react';
import type { Map as MapInstance } from 'maplibre-gl';
import { Check, ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WorkspacePane } from './WorkspaceFrame';
import { SourceFieldReview } from './SourceFieldReview';
import { sourceComparison, sourceGeometry } from './source-comparison';
import { api } from './supabase';
import { AdminRequestError } from './admin-client';
import { requestedCampus } from './campus-context';
import {
  describeSourceChange,
  operationActive,
  sourceFieldLabel,
  sourceKindLabel,
  type SourceCursor,
  type SourceDetail,
  type SourceFilters,
  type SourceHistory,
  type SourceOperation,
  type SourceOverview,
  type SourcePage,
} from './source-updates';
import type { CampusData, MapChange } from './types';
import type { WorkspaceCapabilities } from './gis-types';
import './source-updates.css';

const date = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : 'Not checked yet';
const valueText = (value: unknown) =>
  value === undefined
    ? 'Not recorded'
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);
const emptyPage: SourcePage = { rows: [], total: 0, nextCursor: null };
export default function SourceUpdates({
  data,
  capabilities,
  busy,
  beforeDecision,
  onRefresh,
  onImports,
  onSignIn,
  action,
  onFocus,
  mapRef,
  extras,
}: {
  extras?: ReactNode;
  data: CampusData;
  capabilities?: WorkspaceCapabilities;
  busy: boolean;
  beforeDecision: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onImports: () => void;
  onSignIn: () => Promise<void>;
  action: (name: string, payload: unknown, success: string) => Promise<boolean>;
  onFocus: (change: MapChange | null) => void;
  mapRef: RefObject<MapInstance | null>;
}) {
  const [overview, setOverview] = useState<SourceOverview>();
  const [page, setPage] = useState<SourcePage>(emptyPage);
  const [filters, setFilters] = useState<SourceFilters>({});
  const [cursors, setCursors] = useState<Array<SourceCursor | null>>([null]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [allMatching, setAllMatching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [focusId, setFocusId] = useState('');
  const [detail, setDetail] = useState<SourceDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [operations, setOperations] = useState<SourceOperation[]>([]);
  const [prepared, setPrepared] = useState<{
    op: SourceOperation;
    accept: boolean;
  }>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [results, setResults] = useState<{
    id: string;
    items: SourceHistory['items'];
    next?: string;
  }>();
  const confirmationDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (prepared && !confirmationDialog.current?.open)
      confirmationDialog.current?.showModal();
  }, [prepared]);
  useEffect(() => () => onFocus(null), [onFocus]);
  const preparedRequest = useRef<{ key: string; id: string } | null>(null);
  const observed = useRef(new Set<string>());
  const reconciled = useRef(new Set<string>());
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const canEdit = capabilities?.capabilities.includes('edit') ?? false;
  const canManage = capabilities?.capabilities.includes('manage') ?? false;
  const active = operations.find(operationActive);
  const disabled = busy || working || !canEdit;
  const count = allMatching ? page.total : Object.keys(selected).length;
  const cursor = cursors[cursors.length - 1];
  const queryKey = JSON.stringify([filters, cursor]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    setLoading(true);
    const load = async () => {
      if (document.hidden || !navigator.onLine) {
        timer = setTimeout(load, 5000);
        return;
      }
      try {
        const [next, status, history] = await Promise.all([
          api<SourcePage>(
            'source-updates-list',
            { filters, cursor },
            { signal: controller.signal },
          ),
          api<SourceOverview>(
            'source-updates-overview',
            {},
            { signal: controller.signal },
          ),
          api<SourceHistory>(
            'source-updates-history',
            {},
            { signal: controller.signal },
          ),
        ]);
        if (stopped) return;
        setPage(next);
        setOverview(status);
        setOperations(history.operations);
        setError(null);
        setLoading(false);
        const finished = history.operations.filter(
          (op) =>
            !operationActive(op) &&
            !reconciled.current.has(`${op.id}:${op.updated_at}`) &&
            (observed.current.has(op.id) || op.applied > 0),
        );
        for (const op of history.operations)
          if (operationActive(op)) observed.current.add(op.id);
        if (finished.length) {
          await refreshRef.current();
          for (const op of finished) {
            observed.current.delete(op.id);
            reconciled.current.add(`${op.id}:${op.updated_at}`);
          }
          setAttempt((n) => n + 1);
          setNotice(
            'Background review finished. The editor is refreshed; publishing is still a separate step.',
          );
        }
        timer = setTimeout(
          load,
          history.operations.some(operationActive) ||
            status.sources.some((s) => s.active)
            ? 5000
            : 30000,
        );
      } catch (e) {
        if (stopped) return;
        setError(e as Error);
        setLoading(false);
        if (!(e instanceof AdminRequestError && e.reason === 'auth'))
          timer = setTimeout(load, 15000);
      }
    };
    timer = setTimeout(load, 150);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
    };
    // A serialized query keeps timer refreshes stable while the parent renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, attempt]);

  useEffect(() => {
    if (!focusId) {
      setDetail(undefined);
      return;
    }
    let stopped = false;
    setDetailLoading(true);
    setDetail(undefined);
    void api<SourceDetail>('source-updates-detail', { id: focusId })
      .then((next) => {
        if (stopped) return;
        setDetail(next);
        onFocus(next.change);
        setDetailLoading(false);
        const points: number[][] = [];
        const collect = (value: unknown) => {
          if (!Array.isArray(value)) return;
          if (
            typeof value[0] === 'number' &&
            typeof value[1] === 'number' &&
            value.every(Number.isFinite)
          )
            points.push(value);
          else value.forEach(collect);
        };
        for (const value of [next.change.before, next.change.after]) {
          const geometry = sourceGeometry(value);
          if (geometry && 'coordinates' in geometry)
            collect(geometry.coordinates);
        }
        if (points.length) {
          const bounds = points.reduce(
            (b, p) => [
              Math.min(b[0], p[0]),
              Math.min(b[1], p[1]),
              Math.max(b[2], p[0]),
              Math.max(b[3], p[1]),
            ],
            [Infinity, Infinity, -Infinity, -Infinity],
          );
          mapRef.current?.fitBounds(
            [
              [bounds[0], bounds[1]],
              [bounds[2], bounds[3]],
            ],
            { padding: 55, maxZoom: 19 },
          );
        }
      })
      .catch((e) => {
        if (!stopped) {
          setError(e);
          setDetailLoading(false);
        }
      });
    return () => {
      stopped = true;
    };
    // The focused proposal is fetched on demand, never during inbox polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, attempt]);

  const changeFilter = (key: keyof SourceFilters, value: string) => {
    if (count || prepared)
      setNotice('Selection cleared because the filters changed.');
    setSelected({});
    setAllMatching(false);
    setPrepared(undefined);
    preparedRequest.current = null;
    setFilters((old) => ({ ...old, [key]: value }));
    setCursors([null]);
  };
  const work = async (run: () => Promise<void>) => {
    setWorking(true);
    setError(null);
    try {
      await run();
    } catch (e) {
      setError(e as Error);
    } finally {
      setWorking(false);
    }
  };
  const prepare = (accept: boolean) =>
    work(async () => {
      const selection = allMatching
        ? { mode: 'filter', filters }
        : {
            mode: 'ids',
            items: Object.entries(selected).map(([id, revision]) => ({
              id,
              revision,
            })),
          };
      const key = JSON.stringify(selection);
      if (preparedRequest.current?.key !== key)
        preparedRequest.current = { key, id: crypto.randomUUID() };
      const op = await api<SourceOperation>('source-updates-prepare', {
        operationId: preparedRequest.current.id,
        selection,
      });
      setPrepared({ op, accept });
      setAcknowledged(false);
    });
  const control = (
    op: SourceOperation,
    command: 'cancel' | 'retry' | 'resume',
  ) =>
    work(async () => {
      if (command !== 'cancel') await beforeDecision();
      await api('source-updates-control', {
        operationId: op.id,
        command,
        accept: op.accept,
      });
      if (command !== 'cancel') observed.current.add(op.id);
      setAttempt((n) => n + 1);
    });
  const start = () =>
    work(async () => {
      if (!prepared) return;
      await beforeDecision();
      observed.current.add(prepared.op.id);
      try {
        await api('source-updates-control', {
          operationId: prepared.op.id,
          command: 'start',
          accept: prepared.accept,
          acknowledgeRemovals: acknowledged,
        });
        setNotice(
          'Review queued. You can close the editor and return to Activity or Recent decisions for progress.',
        );
        setPrepared(undefined);
        setSelected({});
        setAllMatching(false);
        preparedRequest.current = null;
      } finally {
        setAttempt((n) => n + 1);
      }
    });
  const loadResults = (id: string, next?: string) =>
    work(async () => {
      const result = await api<SourceHistory>('source-updates-history', {
        operationId: id,
        cursor: next || '',
      });
      setResults({
        id,
        items: result.items.slice(0, 50),
        next: result.items.length > 50 ? result.items[49].change_id : undefined,
      });
    });
  const refresh = () => setAttempt((n) => n + 1);
  const sourceNames = new Map(
    overview?.sources.map((s) => ['import:' + s.id, s.name]),
  );
  const comparison =
    detail && sourceComparison(detail.change.before, detail.change.after);
  const focusedSummary = page.rows.find((row) => row.id === detail?.change.id);
  const selectedPage =
    page.rows.length > 0 &&
    page.rows.every((row) => selected[row.id] === row.revision);

  return (
    <>
      <WorkspacePane
        id="left"
        title="Source updates"
        className="source-updates"
      >
        <header className="source-updates-heading">
          <div>
            <span className="editor-eyebrow">KEEP YOUR CAMPUS CURRENT</span>
            <h2>Source updates</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={working}
            aria-label="Refresh source updates"
          >
            <RefreshCw />
          </Button>
        </header>
        <p className="small-note">
          Check sources → review changes → publish. Your saved campus
          corrections take precedence.
        </p>
        {error && (
          <div role="alert" className="form-error">
            {error.message}{' '}
            <button
              onClick={() =>
                error instanceof AdminRequestError && error.reason === 'auth'
                  ? void onSignIn()
                  : refresh()
              }
            >
              {error instanceof AdminRequestError && error.reason === 'auth'
                ? 'Sign in again'
                : 'Refresh status'}
            </button>
          </div>
        )}
        {notice && <output className="notice">{notice}</output>}
        <details className="source-connected">
          <summary>Connected sources · {overview?.sources.length || 0}</summary>
          {overview?.sources.map((source) => (
            <article key={source.id} className="source-status-card">
              <button
                className="source-name"
                onClick={() => changeFilter('source', 'import:' + source.id)}
              >
                {source.name}
              </button>
              <p>
                {overview.counts['import:' + source.id] || 0} pending ·{' '}
                {source.kind === 'file'
                  ? 'Uploaded file'
                  : source.schedule === 'daily'
                    ? 'Daily checks'
                    : 'Manual checks'}
              </p>
              <small>Last successful check: {date(source.lastSuccess)}</small>
              <p
                className={
                  source.latest?.status === 'failed'
                    ? 'form-error'
                    : 'small-note'
                }
              >
                {source.active?.message ||
                  source.latest?.message ||
                  'Ready for a source check'}
              </p>
              <div className="source-inline-actions">
                {source.kind !== 'file' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled || !!source.active}
                    onClick={() =>
                      void work(async () => {
                        await api('source-updates-check', {
                          sourceId: source.id,
                        });
                        setNotice(
                          'Source check queued; new proposals will appear here.',
                        );
                        refresh();
                      })
                    }
                  >
                    {source.active ? 'Check running' : 'Check now'}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={onImports}>
                    Replace file
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={onImports}>
                  {source.configured ? 'Import setup' : 'Finish setup'}
                </Button>
              </div>
              {source.kind !== 'file' && (
                <label className="source-schedule">
                  Schedule for {source.name}
                  <select
                    value={source.schedule}
                    disabled={!canManage || working}
                    onChange={(e) => {
                      const schedule = e.target.value;
                      void work(async () => {
                        await api('source-schedule', {
                          sourceId: source.id,
                          schedule,
                        });
                        refresh();
                      });
                    }}
                  >
                    <option value="manual">Manual checks</option>
                    <option
                      value="daily"
                      disabled={
                        source.kind === 'osm' && !overview.scheduledOsmEnabled
                      }
                    >
                      Daily review checks
                    </option>
                  </select>
                </label>
              )}
              {source.kind === 'osm' && !overview.scheduledOsmEnabled && (
                <small>
                  Daily OSM checks need a configured endpoint that permits
                  scheduled downloads. Manual checks are available.
                </small>
              )}
            </article>
          ))}
          {requestedCampus() === 'lasu' && (
            <article className="source-status-card">
              <strong>LASU shared source check</strong>
              <p>Daily checks for the existing OSM and ArcGIS sources.</p>
              <small>Latest check: {date(overview?.legacy?.created_at)}</small>
              <p>{overview?.legacy?.message || 'No check recorded yet'}</p>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  disabled ||
                  ['queued', 'running'].includes(overview?.legacy?.status || '')
                }
                onClick={() =>
                  void work(async () => {
                    if (
                      await action(
                        'check-sources',
                        {},
                        'LASU source check queued.',
                      )
                    )
                      refresh();
                  })
                }
              >
                Check LASU sources
              </Button>
            </article>
          )}
          <Button variant="outline" onClick={onImports}>
            Add or configure a source
          </Button>
        </details>
        <div className="source-inbox-heading">
          <h3>Review inbox</h3>
          <span>{page.total.toLocaleString()} pending</span>
        </div>
        {overview && !overview.ready && (
          <p className="notice">
            Preparing the source update index. Review will be available shortly.
          </p>
        )}
        <label>
          Find an update
          <input
            placeholder="Name, layer, or feature ID"
            value={filters.query || ''}
            onChange={(e) => changeFilter('query', e.target.value)}
            maxLength={200}
          />
        </label>
        <div className="source-filter-grid">
          <label>
            Source
            <select
              value={filters.source || ''}
              onChange={(e) => changeFilter('source', e.target.value)}
            >
              <option value="">All sources</option>
              {Object.keys(overview?.counts || {})
                .sort()
                .map((key) => (
                  <option key={key} value={key}>
                    {sourceNames.get(key) || sourceFieldLabel(key)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Update
            <select
              value={filters.kind || ''}
              onChange={(e) => changeFilter('kind', e.target.value)}
            >
              <option value="">All updates</option>
              <option value="add">Additions</option>
              <option value="modify">Changes</option>
              <option value="remove">Removals</option>
            </select>
          </label>
          <label>
            Layer
            <select
              value={filters.layer || ''}
              onChange={(e) => changeFilter('layer', e.target.value)}
            >
              <option value="">All layers</option>
              {overview?.layers.map((layer) => (
                <option key={layer}>{layer}</option>
              ))}
            </select>
          </label>
          <label>
            Feature type
            <select
              value={filters.featureType || ''}
              onChange={(e) => changeFilter('featureType', e.target.value)}
            >
              <option value="">All features</option>
              {overview?.featureTypes.map((kind) => (
                <option key={kind} value={kind}>
                  {sourceFieldLabel(kind)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Changed content
            <select
              value={filters.geometry || ''}
              onChange={(e) => changeFilter('geometry', e.target.value)}
            >
              <option value="">All content</option>
              <option value="true">Shape or location</option>
              <option value="false">Details only</option>
            </select>
          </label>
        </div>
        <div className="source-selection" aria-label="Source update selection">
          <label>
            <input
              type="checkbox"
              checked={allMatching || selectedPage}
              disabled={disabled || loading || !page.rows.length || allMatching}
              onChange={(e) => {
                const checked = e.target.checked;
                setSelected((old) => {
                  const next = { ...old };
                  for (const row of page.rows) {
                    if (checked) next[row.id] = row.revision;
                    else delete next[row.id];
                  }
                  return next;
                });
              }}
            />
            Select this page
          </label>
          <button
            disabled={disabled || loading || !page.total}
            onClick={() => {
              setAllMatching(true);
              setSelected({});
            }}
          >
            Select all {page.total.toLocaleString()} matching results
          </button>
          {!!count && (
            <button
              onClick={() => {
                setAllMatching(false);
                setSelected({});
                setPrepared(undefined);
              }}
            >
              Clear selection
            </button>
          )}
        </div>
        <p className="small-note" aria-live="polite">
          {loading
            ? 'Loading updates…'
            : `Page ${cursors.length} · ${page.rows.length} shown · ${count.toLocaleString()} selected`}
        </p>
        <div
          className="source-update-list"
          aria-label="Pending source updates"
          aria-busy={loading}
        >
          {!loading && !page.rows.length && (
            <div className="empty-state">
              <h3>No matching updates</h3>
              <p>
                Change the filters, check your sources, or return to the
                previous page.
              </p>
            </div>
          )}
          {page.rows.map((row) => (
            <article
              key={row.id}
              className={`source-update-row ${focusId === row.id ? 'selected' : ''}`}
            >
              <input
                type="checkbox"
                aria-label={`Select ${row.meta.name}`}
                checked={allMatching || selected[row.id] === row.revision}
                disabled={disabled || allMatching}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSelected((old) => {
                    const next = { ...old };
                    if (checked) next[row.id] = row.revision;
                    else delete next[row.id];
                    return next;
                  });
                }}
              />
              <button
                onClick={() => {
                  setFocusId(row.id);
                }}
                aria-label={`Review ${row.meta.name}`}
              >
                <span className={`source-kind ${row.kind}`}>
                  {sourceKindLabel[row.kind]}
                </span>
                <strong>{row.meta.name}</strong>
                <span>{describeSourceChange(row)}</span>
                <small>
                  {row.sourceName} ·{' '}
                  {row.meta.layer || sourceFieldLabel(row.meta.featureType)}
                </small>
              </button>
            </article>
          ))}
        </div>
        <div className="source-pagination">
          <Button
            size="sm"
            variant="outline"
            disabled={loading || cursors.length === 1}
            onClick={() => setCursors((old) => old.slice(0, -1))}
          >
            <ChevronLeft /> Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={loading || !page.nextCursor}
            onClick={() =>
              page.nextCursor && setCursors((old) => [...old, page.nextCursor])
            }
          >
            Next <ChevronRight />
          </Button>
        </div>
        <div className="source-bulk-bar">
          <strong>{count.toLocaleString()} selected</strong>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || !count || !!active}
            onClick={() => void prepare(false)}
          >
            <X /> Reject selected
          </Button>
          <Button
            size="sm"
            disabled={disabled || !count || !!active}
            onClick={() => void prepare(true)}
          >
            <Check /> Accept selected
          </Button>
        </div>
        {active && (
          <p className="notice">
            A bulk review is running. You can inspect updates while it finishes.
          </p>
        )}
        {prepared && (
          <dialog
            ref={confirmationDialog}
            className="source-confirmation"
            aria-label="Confirm source decisions"
            onCancel={() => setPrepared(undefined)}
          >
            {error && (
              <p role="alert" className="form-error">
                {error.message}
              </p>
            )}
            <h3>
              {prepared.accept ? 'Accept' : 'Reject'}{' '}
              {prepared.op.total.toLocaleString()} updates?
            </h3>
            <p>
              {prepared.op.breakdown.add} additions ·{' '}
              {prepared.op.breakdown.modify} changes ·{' '}
              {prepared.op.breakdown.remove} removals
            </p>
            {prepared.op.breakdown.geometry > 0 && (
              <p className="notice">
                {prepared.op.breakdown.geometry} updates affect shapes,
                locations, or paths. Inspect their map comparisons before
                accepting.
              </p>
            )}
            <p>
              {prepared.accept
                ? 'These updates will enter the source baseline. Saved corrections still take precedence. Publish separately to update the public map.'
                : 'These proposals will be rejected and the existing source baseline retained.'}
            </p>
            {prepared.accept && prepared.op.breakdown.remove > 0 && (
              <label>
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                I reviewed the {prepared.op.breakdown.remove} removals. Missing
                from a source does not establish closure or demolition.
              </label>
            )}
            <p className="small-note">
              This selection is fixed. New daily updates will not be included.
              Changed proposals will be skipped.
            </p>
            <div className="source-inline-actions">
              <Button
                variant="outline"
                disabled={working}
                onClick={() => setPrepared(undefined)}
              >
                Keep reviewing
              </Button>
              <Button
                disabled={
                  disabled ||
                  !!active ||
                  (prepared.accept &&
                    prepared.op.breakdown.remove > 0 &&
                    !acknowledged)
                }
                onClick={() => void start()}
              >
                Confirm {prepared.accept ? 'acceptance' : 'rejection'}
              </Button>
            </div>
          </dialog>
        )}
        {extras && (
          <details>
            <summary>Campus enrichment and building evidence</summary>
            {extras}
          </details>
        )}
        <details className="source-history" open={!!active}>
          <summary>Recent decisions {active ? '· in progress' : ''}</summary>
          {!operations.length && <p>No bulk decisions yet.</p>}
          {operations.map((op) => (
            <article key={op.id} className="source-status-card">
              <strong>
                {op.accept ? 'Accept' : 'Reject'} {op.total.toLocaleString()}{' '}
                updates · {op.status}
              </strong>
              <p>{op.message}</p>
              <p>
                {op.applied} completed · {op.skipped} skipped · {op.failed}{' '}
                failed
              </p>
              {operationActive(op) && (
                <progress
                  aria-label="Bulk source review progress"
                  max={op.total}
                  value={op.applied + op.skipped + op.failed}
                />
              )}
              <small>{date(op.created_at)}</small>
              <div className="source-inline-actions">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void loadResults(op.id)}
                  disabled={working}
                >
                  View results
                </Button>
                {op.actor === capabilities?.userId && (
                  <>
                    {operationActive(op) && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={disabled}
                          onClick={() => void control(op, 'cancel')}
                        >
                          Stop remaining
                        </Button>
                        {Date.now() - Date.parse(op.updated_at) > 60000 && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={disabled}
                            onClick={() => void control(op, 'resume')}
                          >
                            Resume worker
                          </Button>
                        )}
                      </>
                    )}
                    {['failed', 'cancelled'].includes(op.status) &&
                      op.applied + op.skipped + op.failed < op.total && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={disabled || !!active}
                          onClick={() => void control(op, 'retry')}
                        >
                          Retry unfinished
                        </Button>
                      )}
                  </>
                )}
              </div>
            </article>
          ))}
          {results && (
            <section aria-label="Decision results">
              <h3>Decision results</h3>
              {!results.items.length && (
                <p>
                  Detailed bookkeeping has expired. The operation summary and
                  decision audit are retained.
                </p>
              )}
              {results.items.map((item) => (
                <p key={item.change_id}>
                  <strong>{item.name}</strong>
                  <br />
                  {item.status} · {item.message || 'Waiting for worker'}
                </p>
              ))}
              <div className="source-inline-actions">
                <button onClick={() => void loadResults(results.id)}>
                  First results
                </button>
                {results.next && (
                  <button
                    onClick={() => void loadResults(results.id, results.next)}
                  >
                    Next results
                  </button>
                )}
              </div>
            </section>
          )}
        </details>
      </WorkspacePane>
      <WorkspacePane
        id="right"
        title="Update details"
        className="source-update-details"
      >
        <h2>Update details</h2>
        {detailLoading ? (
          <output>Loading comparison…</output>
        ) : !detail ? (
          <div className="empty-state">
            <h3>Choose an update</h3>
            <p>
              Compare its source details and map outline here before making a
              decision.
            </p>
          </div>
        ) : (
          <>
            <h3>{focusedSummary?.meta.name || detail.change.summary}</h3>
            <p>
              {sourceKindLabel[detail.change.kind]} · {detail.change.status}
            </p>
            <section aria-label="Source evidence">
              <h3>Source evidence</h3>
              <p>
                {focusedSummary?.sourceName || 'Stored source proposal'}
                {focusedSummary?.meta.layer &&
                  ` · ${focusedSummary.meta.layer}`}
              </p>
              <p className="small-note">Record: {detail.change.source_id}</p>
              {focusedSummary && (
                <p className="small-note">
                  Proposed: {date(focusedSummary.createdAt)}
                </p>
              )}
              <p className="small-note">
                These saved before/after records remain available when temporary
                import files expire. A source proposal still needs your review.
              </p>
            </section>
            {detail.overrides.length > 0 && (
              <div className="notice">
                <strong>Your editor corrections take precedence</strong>
                {detail.overrides.map((edit) => (
                  <p key={`${edit.kind}:${edit.id}`}>
                    {edit.deleted
                      ? 'Hidden by an editor correction'
                      : `Saved ${edit.kind} correction: ${edit.fields.map(sourceFieldLabel).join(', ')}`}
                  </p>
                ))}
              </div>
            )}
            <p className="source-map-key">
              <span>Red outline: current source</span>
              <span>Green outline: proposed source</span>
            </p>
            {comparison?.geometryChanged && (
              <p className="notice">
                Shape or location changes are highlighted on the map.
              </p>
            )}
            {detail.change.status === 'pending' && (
              <SourceFieldReview
                key={detail.change.id + detail.change.review_revision}
                change={detail.change}
                data={data}
                busy={disabled || !!active}
                action={async (name, payload, success) => {
                  const ok = await action(name, payload, success);
                  if (ok) refresh();
                  return ok;
                }}
              />
            )}
            {!!comparison?.fields.length && (
              <div className="source-diff-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Detail</th>
                      <th>Current source</th>
                      <th>Proposed source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.fields.map((field) => (
                      <tr key={field.key}>
                        <th title={field.key}>{sourceFieldLabel(field.key)}</th>
                        <td>{valueText(field.before)}</td>
                        <td>{valueText(field.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!comparison?.fields.length && <p>No descriptive field changes.</p>}
            {detail.change.status === 'pending' && (
              <Button
                variant="outline"
                disabled={disabled || !!active}
                onClick={() => {
                  setSelected({
                    [detail.change.id]: detail.change.review_revision,
                  });
                  setAllMatching(false);
                  setNotice(
                    'This update is selected. Choose Accept selected or Reject selected in the inbox.',
                  );
                }}
              >
                Select this update for a decision
              </Button>
            )}
            <details>
              <summary>Technical source records</summary>
              <pre>
                {JSON.stringify(
                  {
                    id: detail.change.source_id,
                    before: detail.change.before,
                    after: detail.change.after,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </>
        )}
      </WorkspacePane>
    </>
  );
}
