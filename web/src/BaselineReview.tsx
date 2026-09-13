import { useState } from 'react';
import { api } from './supabase';
import type { ValidationIssue } from './validation';
interface Review {
  version: string;
  expectedHash: string;
  before: { places: number; edges: number };
  after: { places: number; edges: number };
  drafts: number;
  issues: ValidationIssue[];
  accessReviews: { id: string; name: string }[];
}
export function BaselineReview({
  busy,
  action,
}: {
  busy: boolean;
  action: (name: string, payload: unknown, success: string) => Promise<boolean>;
}) {
  const [review, setReview] = useState<Review | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  return (
    <div className="change-card">
      <strong>Reconcile with the published campus</strong>
      <p className="small-note">
        Review the verified public package as the new source baseline. Saved
        drafts and their history are retained and replayed. The previous source
        snapshot is kept for recovery.
      </p>
      <button
        className="editor-secondary"
        disabled={busy || loading}
        onClick={async () => {
          setLoading(true);
          try {
            setReview(await api<Review>('review-baseline'));
            setError('');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading
          ? 'Checking public package…'
          : 'Review baseline reconciliation'}
      </button>
      {error && <p className="form-error">{error}</p>}
      {review && (
        <>
          <p>Published package: {review.version}</p>
          <p>
            {review.before.places} → {review.after.places} places ·{' '}
            {review.before.edges} → {review.after.edges} directed segments
          </p>
          <p>
            {review.drafts} correction records retained. {review.issues.length}{' '}
            draft issues remain after replay.
          </p>
          {review.accessReviews.length > 0 && (
            <p className="small-note">
              Retained access reviews:{' '}
              {review.accessReviews.map((r) => r.name).join(', ')}
            </p>
          )}
          {review.issues.map((i, n) => (
            <p className="small-note" key={n}>
              {i.message}
            </p>
          ))}
          <button
            className="editor-primary"
            disabled={busy || loading}
            onClick={async () => {
              if (
                await action(
                  'reconcile-baseline',
                  {
                    version: review.version,
                    expectedHash: review.expectedHash,
                  },
                  'Published baseline reconciled. Drafts and history retained; review remaining validation issues.',
                )
              )
                setReview(null);
            }}
          >
            Use this reviewed baseline
          </button>
        </>
      )}
    </div>
  );
}
