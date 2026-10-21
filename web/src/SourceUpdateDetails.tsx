import { Button } from '@/components/ui/button';
import { WorkspacePane } from './WorkspaceFrame';
import { SourceFieldReview } from './SourceFieldReview';
import { api } from './supabase';
import { sourceFieldLabel, sourceChangeLabel } from './source-updates';
import SourceGroupDetails from './SourceGroupDetails';
import { date, valueText } from './source-update-format';
import type { SourceUpdatesState } from './useSourceUpdates';

export function SourceUpdateDetails({ state }: { state: SourceUpdatesState }) {
  const {
    detailLoading,
    detail,
    focusedSummary,
    disabled,
    work,
    setNotice,
    comparison,
    data,
    active,
    action,
    refresh,
    setSelected,
    setAllMatching,
  } = state;

  return (
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
            {sourceChangeLabel(detail.change.kind, detail.reliability)} ·{' '}
            {detail.change.status}
          </p>
          <section aria-label="Source evidence">
            <h3>Source evidence</h3>
            <p>
              {focusedSummary?.sourceName || 'Stored source proposal'}
              {focusedSummary?.meta.layer && ` · ${focusedSummary.meta.layer}`}
            </p>
            <p className="small-note">Record: {detail.change.source_id}</p>
            {detail.reliability && (
              <div className="notice">
                <strong>
                  {detail.reliability.eligible
                    ? 'Ready to review'
                    : detail.reliability.verification === 'unverified'
                      ? 'Needs verification'
                      : 'Blocked'}
                </strong>
                <p>
                  {detail.reliability.classification.replaceAll('_', ' ')} ·{' '}
                  {detail.reliability.dependencyCount} dependent records
                </p>
                {detail.reliability.blockingReasons.map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
                {detail.reliability.checkId && (
                  <Button
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      void work(async () => {
                        await api('source-updates-reverify', {
                          checkId: detail.reliability?.checkId,
                        });
                        setNotice('A fresh verification was requested.');
                      })
                    }
                  >
                    Verify source again
                  </Button>
                )}
              </div>
            )}
            {detail.reliability?.groupId && (
              <SourceGroupDetails
                key={detail.reliability.groupId}
                id={detail.reliability.groupId}
              />
            )}
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
              busy={
                disabled || !!active || detail.reliability?.eligible === false
              }
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
  );
}
