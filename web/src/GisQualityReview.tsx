import { WorkspacePane } from './WorkspaceFrame';
import type { QualityIssue } from './gis-types';
import { gisApi } from './gis-api';
import { IssueComment } from './GisIssueComment';
import type { GisReviewState } from './useGisReview';

export function GisQualityReview({
  state: viewState,
}: {
  state: GisReviewState;
}) {
  const {
    error,
    issues,
    onIssue,
    can,
    busy,
    attempt,
    mutate,
    automated,
    map,
    qa,
    saveIssue,
    members,
    message,
    setMessage,
  } = viewState;

  return (
    <WorkspacePane
      id="left"
      title="Quality and evidence"
      className="gis-pane gis-workspace"
    >
      <p>
        Approval applies to an immutable snapshot. A contributor cannot approve
        their own changes. Any later data change requires a new submission.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <details open>
        <summary>Map validation ({issues.length})</summary>
        {issues.slice(0, 100).map((issue, i) => (
          <div key={i} className="gis-issue">
            <button onClick={() => onIssue(issue)}>{issue.message}</button>
            <button
              disabled={!can('review') || busy}
              onClick={() =>
                void attempt(() =>
                  mutate(() =>
                    gisApi('gis-issue-save', {
                      expectedRevision: 0,
                      issue: {
                        id: crypto.randomUUID(),
                        severity:
                          issue.severity === 'error' ? 'error' : 'warning',
                        code: issue.code || 'map-validation',
                        message: issue.message,
                        status: 'open',
                        comments: [],
                        evidence: [],
                        revision: 0,
                      },
                    }),
                  ),
                )
              }
            >
              Track issue
            </button>
          </div>
        ))}
      </details>
      <details open>
        <summary>Dataset and source checks ({automated.length})</summary>
        {automated.map((issue) => (
          <article key={issue.id} className="gis-issue">
            <p>
              {issue.severity}: {issue.message}
            </p>
            {issue.coordinates && (
              <button
                onClick={() =>
                  map?.flyTo({ center: issue.coordinates!, zoom: 19 })
                }
              >
                Show on map
              </button>
            )}
            {!qa.some((q) => q.id === issue.id) && (
              <button
                disabled={!can('review') || busy}
                onClick={() => void saveIssue(issue)}
              >
                Track and assign
              </button>
            )}
          </article>
        ))}
      </details>
      <details open>
        <summary>Team quality issues ({qa.length})</summary>
        {qa.map((issue) => (
          <article key={issue.id} className="gis-issue">
            <strong>
              {issue.severity} · {issue.message}
            </strong>
            {issue.coordinates && (
              <button
                onClick={() =>
                  map?.flyTo({ center: issue.coordinates!, zoom: 19 })
                }
              >
                Show on map
              </button>
            )}
            <div className="gis-toolbar">
              <label>
                Disposition
                <select
                  disabled={!can('review') || busy}
                  value={issue.status}
                  onChange={(e) =>
                    void saveIssue({
                      ...issue,
                      status: e.target.value as QualityIssue['status'],
                    })
                  }
                >
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                  {issue.severity === 'warning' && (
                    <option value="accepted">Accepted warning</option>
                  )}
                </select>
              </label>
              <label>
                Assignee
                <select
                  value={issue.assigned_to || ''}
                  disabled={!can('review') || busy}
                  onChange={(e) =>
                    void saveIssue({
                      ...issue,
                      assigned_to: e.target.value || undefined,
                    })
                  }
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.user_id}>{m.user_id}</option>
                  ))}
                </select>
              </label>
            </div>
            {issue.comments.map((c, i) => (
              <p key={i}>
                <small>
                  {c.actor} · {new Date(c.createdAt).toLocaleString()}
                </small>
                <br />
                {c.text}
              </p>
            ))}
            {can('review') && <IssueComment issue={issue} save={saveIssue} />}
            <ul>
              {issue.evidence.map((e, i) => (
                <li key={i}>
                  <a href={e.url} target="_blank" rel="noreferrer">
                    {e.label}
                  </a>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </details>
      {can('review') && (
        <div className="gis-toolbar">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-label="New quality issue"
            placeholder="Describe an issue or source conflict"
          />
          <button
            disabled={busy || !message.trim()}
            onClick={() =>
              void attempt(async () => {
                await mutate(() =>
                  gisApi('gis-issue-save', {
                    expectedRevision: 0,
                    issue: {
                      id: crypto.randomUUID(),
                      severity: 'warning',
                      code: 'manual-review',
                      message,
                      status: 'open',
                      comments: [],
                      evidence: [],
                      revision: 0,
                    },
                  }),
                );
                setMessage('');
              })
            }
          >
            Add issue
          </button>
        </div>
      )}
    </WorkspacePane>
  );
}
