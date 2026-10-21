import { Button } from '@/components/ui/button';
import { operationActive } from './source-updates';
import { date } from './source-update-format';
import type { SourceUpdatesState } from './useSourceUpdates';

export function SourceDecisionHistory({
  state,
}: {
  state: SourceUpdatesState;
}) {
  const {
    active,
    operations,
    loadResults,
    working,
    capabilities,
    disabled,
    control,
    results,
  } = state;

  return (
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
            {op.applied} completed · {op.skipped} skipped · {op.failed} failed
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
  );
}
