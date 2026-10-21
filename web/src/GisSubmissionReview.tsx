import { WorkspacePane } from './WorkspaceFrame';
import { gisApi } from './gis-api';
import { focusGisFeature } from './gis-map';
import type { GisReviewState } from './useGisReview';

export function GisSubmissionReview({
  state: viewState,
}: {
  state: GisReviewState;
}) {
  const {
    summary,
    setSummary,
    can,
    busy,
    attempt,
    mutate,
    reviews,
    setDetails,
    details,
    reviewDataset,
    setReviewDataset,
    setReviewPage,
    reviewPage,
    map,
    reason,
    setReason,
    capabilities,
    override,
    setOverride,
  } = viewState;

  return (
    <WorkspacePane
      id="right"
      title="Submissions and approval"
      className="gis-pane gis-workspace"
    >
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
                    {d.included ? 'Included in public map' : 'Private dataset'}
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
    </WorkspacePane>
  );
}
