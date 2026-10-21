import { Button } from '@/components/ui/button';
import type { SourceUpdatesState } from './useSourceUpdates';

export function SourceDecisionDialog({ state }: { state: SourceUpdatesState }) {
  const {
    prepared,
    confirmationDialog,
    setPrepared,
    error,
    acknowledged,
    setAcknowledged,
    working,
    disabled,
    active,
    start,
  } = state;

  return (
    <>
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
          {!!prepared.op.breakdown.excluded && (
            <p>
              {prepared.op.breakdown.excluded} ineligible groups were excluded.
            </p>
          )}
          {prepared.op.breakdown.geometry > 0 && (
            <p className="notice">
              {prepared.op.breakdown.geometry} updates affect shapes, locations,
              or paths. Inspect their map comparisons before accepting.
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
    </>
  );
}
