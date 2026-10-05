import { useEffect, useState } from 'react';
import type { GisPanelProps } from './GisWorkspace';
import type {
  CampusMembership,
  GisActionMap,
  QualityIssue,
  ReviewSubmission,
  WorkspaceRole,
} from './gis-types';
import type { ValidationIssue } from './validation';
import { gisApi } from './gis-api';
import { showGisPage, focusGisFeature } from './gis-map';
export default function GisReview({
  capabilities,
  mutate,
  issues,
  onIssue,
  map,
  membersOnly = false,
}: GisPanelProps & {
  membersOnly?: boolean;
  issues: ValidationIssue[];
  onIssue: (i: ValidationIssue) => void;
}) {
  const [reviews, setReviews] = useState<ReviewSubmission[]>([]),
    [qa, setQa] = useState<QualityIssue[]>([]),
    [members, setMembers] = useState<CampusMembership[]>([]),
    [summary, setSummary] = useState(''),
    [reason, setReason] = useState(''),
    [override, setOverride] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [details, setDetails] =
      useState<GisActionMap['gis-review-details']['response']>(),
    [memberId, setMemberId] = useState(''),
    [roles, setRoles] = useState<WorkspaceRole[]>(['editor']),
    [automated, setAutomated] = useState<QualityIssue[]>([]),
    [message, setMessage] = useState(''),
    [reviewDataset, setReviewDataset] = useState(''),
    [reviewPage, setReviewPage] =
      useState<GisActionMap['gis-review-query']['response']>();
  useEffect(() => {
    setReviewPage(undefined);
    setReviewDataset(details?.datasets?.[0]?.id || 'historical');
  }, [details]);
  useEffect(() => {
    if (!reviewPage || !map || !details) return;
    const dataset = details.datasets?.find((d) => d.id === reviewDataset) || {
      style: { mode: 'single' as const, color: '#2563eb' },
    };
    return showGisPage(map, dataset, reviewPage.features, new Set(), (key) => {
      const feature = reviewPage.features.find((f) => f.id === key);
      if (feature) focusGisFeature(map, feature);
    });
  }, [reviewPage, map, reviewDataset, details]);
  const can = (cap: 'edit' | 'review' | 'manage') =>
    capabilities.capabilities.includes(cap);
  const load = async () => {
    const [r, q, m, a] = await Promise.all([
      gisApi('gis-reviews', {}),
      gisApi('gis-issues', {}),
      gisApi('gis-members', {}),
      gisApi('gis-quality', {}),
    ]);
    setReviews(r);
    setQa(q);
    setMembers(m);
    setAutomated(a);
  };
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  const attempt = async (work: () => Promise<unknown>) => {
    setError('');
    setBusy(true);
    try {
      await work();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const saveIssue = (issue: QualityIssue) =>
    attempt(() =>
      mutate(() =>
        gisApi('gis-issue-save', { issue, expectedRevision: issue.revision }),
      ),
    );
  return (
    <>
      <div hidden={membersOnly}>
        <p>
          Approval applies to an immutable snapshot. A contributor cannot
          approve their own changes. Any later data change requires a new
          submission.
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
        <h3>Submit for review</h3>
        <label>
          Summary
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            maxLength={500}
          />
        </label>
        <button
          disabled={!can('edit') || busy || summary.trim().length < 5}
          onClick={() =>
            void attempt(() =>
              mutate(() =>
                gisApi('gis-review-submit', {
                  summary,
                  operationId: crypto.randomUUID(),
                }),
              ),
            )
          }
        >
          Validate and submit snapshot
        </button>
        <h3>Submissions</h3>
        {reviews.map((review) => (
          <article key={review.id} className="gis-job">
            <strong>{review.summary}</strong> · {review.status}
            <p>
              <small>
                Hash {review.content_hash}
                <br />
                Contributors: {review.contributors.join(', ')}
              </small>
            </p>
            <button
              onClick={() =>
                void attempt(async () =>
                  setDetails(
                    await gisApi('gis-review-details', { id: review.id }),
                  ),
                )
              }
            >
              Inspect immutable submission
            </button>
            {details?.id === review.id && (
              <>
                <p>
                  {details.current
                    ? 'Matches the current draft'
                    : 'Draft has changed, or this is a historical restore'}{' '}
                  · {details.sourceCount} sources · {details.editCount}{' '}
                  corrections
                </p>
                <div className="gis-toolbar">
                  <label>
                    Submitted dataset
                    <select
                      value={reviewDataset}
                      onChange={(e) => {
                        setReviewDataset(e.target.value);
                        setReviewPage(undefined);
                      }}
                    >
                      {details.datasets?.length ? (
                        details.datasets.map((d) => (
                          <option value={d.id} key={d.id}>
                            {d.name}
                          </option>
                        ))
                      ) : (
                        <option value="historical">Historical map</option>
                      )}
                    </select>
                  </label>
                  <button
                    onClick={() =>
                      void attempt(async () =>
                        setReviewPage(
                          await gisApi('gis-review-query', {
                            id: review.id,
                            datasetId: reviewDataset,
                          }),
                        ),
                      )
                    }
                  >
                    Inspect submitted features
                  </button>
                </div>
                {reviewPage && (
                  <>
                    <p>
                      {reviewPage.total.toLocaleString()} submitted features ·{' '}
                      {reviewPage.features.length} on this page
                    </p>
                    <div className="gis-table-scroll">
                      <table>
                        <tbody>
                          {reviewPage.features.map((f) => (
                            <tr key={f.id}>
                              <td>
                                <button onClick={() => focusGisFeature(map, f)}>
                                  {f.id}
                                </button>
                              </td>
                              <td>
                                <dl>
                                  {Object.entries(f.properties)
                                    .filter(
                                      ([key]) =>
                                        details.datasets
                                          ?.find((d) => d.id === reviewDataset)
                                          ?.schema.fields.some(
                                            (field) => field.name === key,
                                          ) || !details.datasets?.length,
                                    )
                                    .map(([key, value]) => (
                                      <div key={key}>
                                        <dt>{key}</dt>
                                        <dd>
                                          {value === null
                                            ? 'No value'
                                            : String(value)}
                                        </dd>
                                      </div>
                                    ))}
                                </dl>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      disabled={!reviewPage.nextKey}
                      onClick={() =>
                        void attempt(async () =>
                          setReviewPage(
                            await gisApi('gis-review-query', {
                              id: review.id,
                              datasetId: reviewDataset,
                              afterKey: reviewPage.nextKey || undefined,
                            }),
                          ),
                        )
                      }
                    >
                      Next submitted page
                    </button>
                  </>
                )}
                {details.datasets?.map((d) => (
                  <article key={d.id}>
                    <strong>{d.name}</strong>
                    <p>
                      Revision {d.revision} · {d.analysis_crs} ·{' '}
                      {d.included
                        ? 'Included in public map'
                        : 'Private dataset'}
                    </p>
                    <p>
                      Public fields:{' '}
                      {d.schema.fields
                        .filter((f) => f.public)
                        .map((f) => f.alias || f.name)
                        .join(', ') || 'None'}{' '}
                      · {d.style.mode} style
                    </p>
                  </article>
                ))}
                <details>
                  <summary>Full schema and correction details</summary>
                  <pre>
                    {JSON.stringify(
                      { datasets: details.datasets, edits: details.edits },
                      null,
                      2,
                    )}
                  </pre>
                </details>
                {review.status === 'submitted' && can('review') && (
                  <>
                    <label>
                      Decision reason
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        maxLength={1000}
                      />
                    </label>
                    {capabilities.roles.includes('administrator') && (
                      <label>
                        <input
                          type="checkbox"
                          checked={override}
                          onChange={(e) => setOverride(e.target.checked)}
                        />
                        Original-owner override (reason recorded in the audit
                        trail)
                      </label>
                    )}
                    <div className="gis-toolbar">
                      <button
                        disabled={busy || reason.trim().length < 5}
                        onClick={() =>
                          void attempt(() =>
                            mutate(() =>
                              gisApi('gis-review-decide', {
                                id: review.id,
                                approve: false,
                                reason,
                              }),
                            ),
                          )
                        }
                      >
                        Request changes
                      </button>
                      <button
                        disabled={
                          busy ||
                          reason.trim().length < 5 ||
                          (review.contributors.includes(capabilities.userId) &&
                            !override)
                        }
                        onClick={() =>
                          void attempt(() =>
                            mutate(() =>
                              gisApi('gis-review-decide', {
                                id: review.id,
                                approve: true,
                                reason,
                                override,
                              }),
                            ),
                          )
                        }
                      >
                        Approve exact snapshot
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </article>
        ))}
      </div>
      {membersOnly && can('manage') && (
        <details open>
          <summary>Campus memberships</summary>
          <p>
            Members sign in first; use their Auth account UUID. Roles are
            composable. Clearing all roles revokes campus access.
          </p>
          {members.map((m) => (
            <button
              key={m.user_id}
              onClick={() => {
                setMemberId(m.user_id);
                setRoles(m.roles);
              }}
            >
              {m.user_id} · {m.roles.join(', ')}
            </button>
          ))}
          <label>
            Account UUID
            <input
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            />
          </label>
          {(['administrator', 'editor', 'reviewer', 'publisher'] as const).map(
            (role) => (
              <label key={role}>
                <input
                  type="checkbox"
                  checked={roles.includes(role)}
                  onChange={(e) =>
                    setRoles((r) =>
                      e.target.checked
                        ? [...r, role]
                        : r.filter((x) => x !== role),
                    )
                  }
                />
                {role}
              </label>
            ),
          )}
          <button
            disabled={busy || !memberId}
            onClick={() =>
              void attempt(() =>
                mutate(() =>
                  gisApi('gis-member-save', {
                    userId: memberId,
                    roles,
                    operationId: crypto.randomUUID(),
                  }),
                ),
              )
            }
          >
            Save membership
          </button>
        </details>
      )}
    </>
  );
}
function IssueComment({
  issue,
  save,
}: {
  issue: QualityIssue;
  save: (issue: QualityIssue) => Promise<unknown>;
}) {
  const [text, setText] = useState(''),
    [url, setUrl] = useState(''),
    [label, setLabel] = useState('');
  return (
    <>
      <label>
        Comment
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
        />
      </label>
      <label>
        Evidence URL
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
        />
      </label>
      <label>
        Evidence label
        <input value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <button
        disabled={!text.trim()}
        onClick={async () => {
          await save({
            ...issue,
            comments: [...issue.comments, { actor: '', text, createdAt: '' }],
            evidence: url
              ? [...issue.evidence, { label: label || 'Evidence', url }]
              : issue.evidence,
          });
          setText('');
          setUrl('');
        }}
      >
        Add comment / evidence
      </button>
    </>
  );
}
