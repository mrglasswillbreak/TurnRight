import { useEffect, useState, type RefObject } from 'react';
import {
  Check,
  Flag,
  GitCompareArrows,
  Layers,
  MapPin,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import type { Map as MapInstance } from 'maplibre-gl';
import { Button } from '@/components/ui/button';
import type { CampusData, MapChange, Release, StudentReport } from './types';
import { api } from './supabase';
import { AdminRequestError } from './admin-client';
import { useReleaseImpact } from './useReleaseImpact';
import { sourceComparison, sourceGeometry } from './source-comparison';
import { firstPosition, type ValidationIssue } from './validation';
import { downloadJson } from './download-json';
import type { EditorWorkspace } from './editor-workspace';
import type { EditorValidation } from './editor-validation';
import { BaselineReview } from './BaselineReview';
import { BuildingReferenceReview } from './BuildingReferenceReview';

export interface ReviewState {
  changes: MapChange[];
  reports: StudentReport[];
  jobs: {
    id: string;
    kind: string;
    status: string;
    message: string;
    created_at: string;
  }[];
  releases: Release[];
}

export function EditorReview({
  tab,
  state,
  workspace,
  validation,
  baselineVersion,
  publishedVersion,
  published,
  onIssue,
  onSignIn,
  busy,
  action,
  mapRef,
  preview,
  setPreview,
  review,
  setReview,
  onApplyAppearances,
  onLocateBuilding,
}: {
  tab: string;
  state: ReviewState;
  workspace: EditorWorkspace;
  validation: EditorValidation & { pending?: boolean; retry: () => void };
  baselineVersion: string;
  publishedVersion: string;
  published: CampusData;
  onIssue: (issue: ValidationIssue) => void;
  onSignIn: () => Promise<void>;
  busy: boolean;
  action: (name: string, payload: unknown, success: string) => Promise<boolean>;
  mapRef: RefObject<MapInstance | null>;
  preview: boolean;
  setPreview: (value: boolean) => void;
  review: MapChange | null;
  setReview: (change: MapChange) => void;
  onApplyAppearances: (batch: import('./types').MapEdit[]) => Promise<void>;
  onLocateBuilding: (id: string) => void;
}) {
  const [summary, setSummary] = useState('');
  const [liveState, setLiveState] = useState(state);
  const [statusError, setStatusError] = useState<Error | null>(null);
  const [statusAttempt, setStatusAttempt] = useState(0);
  const impact = useReleaseImpact(
    published,
    validation.data,
    tab === 'releases' && !validation.pending,
  );
  useEffect(() => {
    setLiveState(state);
    if (!['changes', 'releases'].includes(tab)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!document.hidden) {
        try {
          const latest =
            await api<Pick<ReviewState, 'jobs' | 'releases' | 'changes'>>(
              'review-status',
            );
          if (!cancelled) {
            setLiveState((current) => ({ ...current, ...latest }));
            setStatusError(null);
          }
        } catch (e) {
          if (!cancelled) setStatusError(e as Error);
          if (e instanceof AdminRequestError && e.reason === 'auth') return;
        }
      }
      if (!cancelled) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, statusAttempt ? 0 : 5000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state, tab, statusAttempt]);
  return (
    <>
      {statusError && (
        <p className="form-error" role="alert">
          Status refresh: {statusError.message}{' '}
          <button
            className="editor-text"
            onClick={() =>
              statusError instanceof AdminRequestError &&
              statusError.reason === 'auth'
                ? void onSignIn()
                : setStatusAttempt((n) => n + 1)
            }
          >
            {statusError instanceof AdminRequestError &&
            statusError.reason === 'auth'
              ? 'Sign in again'
              : 'Retry status refresh'}
          </button>
        </p>
      )}
      {tab === 'changes' && (
        <>
          <h2>Source review</h2>
          <BuildingReferenceReview
            data={validation.data}
            duplicates={validation.duplicates}
            edits={workspace.edits}
            disabled={
              busy ||
              !!validation.pending ||
              !!workspace.unfinished ||
              !!workspace.roofDraft ||
              workspace.status === 'Conflict'
            }
            onApply={onApplyAppearances}
            onLocate={onLocateBuilding}
          />
          <p className="small-note">
            Daily checks propose changes. Your campus corrections always take
            precedence.
          </p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              action(
                'check-sources',
                {},
                'Source check queued. Refresh to see its result.',
              )
            }
          >
            <RefreshCw /> Check now
          </Button>
          {liveState.jobs.slice(0, 3).map((job) => (
            <div className={`job-status ${job.status}`} key={job.id}>
              <strong>{job.status}</strong>
              <p>{job.message || 'Import in progress'}</p>
              <small>{new Date(job.created_at).toLocaleString()}</small>
            </div>
          ))}
          {liveState.changes.length === 0 && (
            <div className="empty-state">
              <GitCompareArrows />
              <h3>No pending changes</h3>
              <p>New source differences will appear here.</p>
            </div>
          )}
          {liveState.changes.map((change) => (
            <div
              className={`change-card ${review?.id === change.id ? 'selected' : ''}`}
              key={change.id}
            >
              <button
                onClick={() => {
                  setReview(change);
                  const geometry =
                    sourceGeometry(change.after) ||
                    sourceGeometry(change.before);
                  const point =
                    geometry && 'coordinates' in geometry
                      ? firstPosition(geometry.coordinates)
                      : undefined;
                  if (point) mapRef.current?.flyTo({ center: point, zoom: 18 });
                }}
              >
                <span className="change-kind">{change.kind}</span>
                <strong>{change.summary}</strong>
              </button>
              <p className="small-note">{change.source_id}</p>
              <div className="button-row">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    action(
                      'review-change',
                      { id: change.id, accept: false },
                      'Change rejected; source baseline retained.',
                    )
                  }
                >
                  <X /> Reject
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    action(
                      'review-change',
                      { id: change.id, accept: true },
                      'Change accepted into the source baseline. Publish a release to update the public map.',
                    )
                  }
                >
                  <Check /> Accept
                </Button>
              </div>
              {review?.id === change.id &&
                (() => {
                  const comparison = sourceComparison(
                    change.before,
                    change.after,
                  );
                  const text = (value: unknown) =>
                    value === undefined
                      ? 'Not recorded'
                      : typeof value === 'string'
                        ? value
                        : JSON.stringify(value);
                  return (
                    <div className="source-comparison">
                      <p>Red: approved source · Green: proposed source</p>
                      {comparison.geometryChanged && (
                        <p className="notice">
                          Geometry changed. Compare the highlighted outlines on
                          the map.
                        </p>
                      )}
                      {!!comparison.fields.length && (
                        <table>
                          <thead>
                            <tr>
                              <th>Property</th>
                              <th>Before</th>
                              <th>After</th>
                            </tr>
                          </thead>
                          <tbody>
                            {comparison.fields.map((f) => (
                              <tr key={f.key}>
                                <th>{f.key}</th>
                                <td>{text(f.before)}</td>
                                <td>{text(f.after)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {!comparison.fields.length && <p>No property changes.</p>}
                      <details>
                        <summary>Raw source records</summary>
                        <pre>
                          {JSON.stringify(
                            { before: change.before, after: change.after },
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    </div>
                  );
                })()}
            </div>
          ))}
        </>
      )}
      {tab === 'reports' && (
        <>
          <h2>Student reports</h2>
          <p className="small-note">
            Reports are private. Review the location before changing the map.
          </p>
          {!state.reports.length && (
            <div className="empty-state">
              <Flag />
              <h3>No pending reports</h3>
            </div>
          )}
          {state.reports.map((report) => (
            <div className="change-card" key={report.id}>
              <strong>{report.category.replaceAll('-', ' ')}</strong>
              <p>{report.description}</p>
              <button
                className="text-button"
                onClick={() =>
                  mapRef.current?.flyTo({
                    center: report.coordinates,
                    zoom: 19,
                  })
                }
              >
                <MapPin size={15} /> Show location
              </button>
              <div className="button-row">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    action(
                      'resolve-report',
                      { id: report.id, status: 'dismissed' },
                      'Report dismissed.',
                    )
                  }
                >
                  Dismiss
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    action(
                      'resolve-report',
                      { id: report.id, status: 'resolved' },
                      'Report marked resolved.',
                    )
                  }
                >
                  Mark resolved
                </Button>
              </div>
            </div>
          ))}
        </>
      )}
      {tab === 'releases' && (
        <>
          <h2>Review, then publish</h2>
          <p>Draft: {workspace.status}</p>
          <button
            className="editor-secondary"
            onClick={() =>
              downloadJson(
                'turnright-local-recovery.json',
                workspace.localBackup(baselineVersion),
              )
            }
          >
            Download local recovery
          </button>
          <BaselineReview busy={busy} action={action} onSignIn={onSignIn} />
          <p className="small-note">
            Editor baseline: {baselineVersion}
            <br />
            Public package loaded: {publishedVersion}
          </p>
          {baselineVersion !== publishedVersion && (
            <p className="notice">
              The editor baseline differs from the public map. Reconcile the
              published baseline before replacing campus geometry; retain the
              reviewed Law and Library access corrections.
            </p>
          )}
          <div className="validation-card">
            <strong>
              {validation.pending
                ? 'Checking the latest draft…'
                : validation.failed
                  ? 'Validation could not finish'
                  : validation.errors.length
                    ? 'Validation needs attention'
                    : 'Draft validation passed'}
            </strong>
            {!validation.usable && (
              <p className="notice">
                Showing the last usable map. The current draft has not passed
                validation.
              </p>
            )}
            <p>
              {validation.data.places.length} places ·{' '}
              {validation.data.graph.edges.length} path segments
            </p>
            {validation.issues.map((issue, index) => (
              <div
                className={
                  issue.severity === 'warning' ? 'small-note' : 'form-error'
                }
                key={`${issue.code}:${index}`}
              >
                <p>{issue.message}</p>
                <small>
                  {issue.phase} · revision {validation.revision}
                  {issue.featureId ? ` · ${issue.featureId}` : ''}
                </small>
                {issue.referenceIds?.length && (
                  <p className="small-note">
                    References: {issue.referenceIds.join(', ')}
                  </p>
                )}
                {issue.repair && (
                  <button
                    className="editor-secondary"
                    onClick={() => onIssue(issue)}
                  >
                    {issue.repair === 'choose-place'
                      ? 'Choose entrance’s place'
                      : issue.repair === 'connect-path'
                        ? 'Connect to path'
                        : 'Review blocked segment'}
                  </button>
                )}
                {issue.coordinates && (
                  <button
                    className="text-button"
                    onClick={() => onIssue(issue)}
                  >
                    <MapPin size={15} /> Locate feature
                  </button>
                )}
              </div>
            ))}
            {validation.warnings
              .filter((w) => !validation.issues.some((i) => i.message === w))
              .map((w) => (
                <p className="small-note" key={w}>
                  {w}
                </p>
              ))}
          </div>
          <div className="button-row">
            <Button
              variant="outline"
              disabled={validation.pending}
              onClick={validation.retry}
            >
              <RefreshCw /> Retry validation
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob(
                    [
                      JSON.stringify(
                        {
                          baselineVersion,
                          publishedVersion,
                          revision: validation.revision,
                          failed: validation.failed,
                          issues: validation.issues,
                          warnings: validation.warnings,
                        },
                        null,
                        2,
                      ),
                    ],
                    { type: 'application/json' },
                  ),
                );
                const link = document.createElement('a');
                link.href = url;
                link.download = 'turnright-validation.json';
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              Download diagnostics
            </Button>
          </div>
          <p className="notice">
            {validation.data.coverage.disconnected.length} places still lack a
            mapped approach. Source-derived routes have not been field-verified.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setPreview(!preview);
            }}
          >
            <Layers />
            {preview ? 'Show working map' : 'Compare approved base'}
          </Button>
          <section className="release-impact" aria-label="Release impact">
            <h3>Release impact</h3>
            {impact.pending && <p>Comparing this draft with the public map…</p>}
            {impact.error && (
              <p className="form-error" role="alert">
                {impact.error}{' '}
                <button className="editor-text" onClick={impact.retry}>
                  Retry impact review
                </button>
              </p>
            )}
            {impact.result && (
              <>
                <p>
                  {
                    impact.result.changes.filter((c) => c.change === 'added')
                      .length
                  }{' '}
                  added ·{' '}
                  {
                    impact.result.changes.filter((c) => c.change === 'changed')
                      .length
                  }{' '}
                  changed ·{' '}
                  {
                    impact.result.changes.filter((c) => c.change === 'deleted')
                      .length
                  }{' '}
                  deleted
                </p>
                <details>
                  <summary>
                    Changed features and entrances (
                    {impact.result.changes.length})
                  </summary>
                  {impact.result.changes.map((c) => (
                    <p key={`${c.kind}:${c.id}`}>
                      {c.change} · {c.kind} · {c.name}
                    </p>
                  ))}
                </details>
                <p>
                  {impact.result.newlyDisconnected.length} newly disconnected
                  destinations (lost approach or reachability from Clinic).
                </p>
                {impact.result.newlyDisconnected.map((p) => (
                  <p className="notice" key={p.id}>
                    {p.name}
                  </p>
                ))}
                <div className="source-comparison">
                  <table>
                    <thead>
                      <tr>
                        <th>Walk</th>
                        <th>Public map</th>
                        <th>This draft</th>
                      </tr>
                    </thead>
                    <tbody>
                      {impact.result.walks.map((walk) => (
                        <tr key={walk.name}>
                          <th>{walk.name}</th>
                          <td>
                            {walk.before.status}
                            {walk.before.distance !== undefined
                              ? ` · ${walk.before.distance} m`
                              : ''}
                          </td>
                          <td>
                            {walk.after.status}
                            {walk.after.distance !== undefined
                              ? ` · ${walk.after.distance} m`
                              : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
          <label className="field-label">
            What changed?
            <textarea
              value={summary}
              maxLength={500}
              placeholder="Describe the corrections in this release…"
              onChange={(e) => setSummary(e.target.value)}
            />
          </label>
          <Button
            disabled={
              busy ||
              validation.pending ||
              workspace.unfinished !== null ||
              validation.errors.length > 0 ||
              baselineVersion !== publishedVersion ||
              summary.trim().length < 5 ||
              impact.pending ||
              !!impact.error ||
              !impact.result
            }
            onClick={() =>
              action(
                'prepare-release',
                { summary },
                'Immutable release queued. Review its deployment preview before publishing.',
              )
            }
          >
            <Upload /> Build review preview
          </Button>
          {liveState.releases.map((release) => (
            <div className="change-card" key={release.id}>
              <span className="change-kind">{release.status}</span>
              <h3>{release.summary}</h3>
              <small>{new Date(release.created_at).toLocaleString()}</small>
              {release.error && <p className="form-error">{release.error}</p>}
              {release.preview_url && (
                <a
                  className="source-link"
                  href={release.preview_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open exact release preview ↗
                </a>
              )}
              {release.status === 'preview' && (
                <>
                  <p className="small-note">
                    {baselineVersion !== publishedVersion ||
                    release.created_at <
                      (workspace.edits
                        .map((e) => e.updated_at || '')
                        .sort()
                        .at(-1) || '')
                      ? 'Stale preview: reconcile the baseline and build a new preview from the current drafts.'
                      : 'The server checks this snapshot again before publication.'}
                  </p>
                  <Button
                    disabled={
                      busy ||
                      validation.pending ||
                      validation.errors.length > 0 ||
                      baselineVersion !== publishedVersion ||
                      release.created_at <
                        (workspace.edits
                          .map((e) => e.updated_at || '')
                          .sort()
                          .at(-1) || '')
                    }
                    onClick={() => {
                      if (
                        window.confirm(
                          'Publish this reviewed preview to the public TurnRight site?',
                        )
                      )
                        void action(
                          'publish-release',
                          { id: release.id },
                          'Publication requested. Refresh to verify the result.',
                        );
                    }}
                  >
                    Publish this preview
                  </Button>
                </>
              )}
              {release.status === 'published' && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Restore this previously published release?',
                      )
                    )
                      void action(
                        'rollback',
                        { id: release.id },
                        'Restore requested. Refresh to verify the result.',
                      );
                  }}
                >
                  Restore this release
                </Button>
              )}
            </div>
          ))}
        </>
      )}
    </>
  );
}
