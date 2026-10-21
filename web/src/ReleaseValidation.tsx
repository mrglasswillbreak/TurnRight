import { MapPin } from 'lucide-react';
import type { EditorReviewState } from './useEditorReview';

export function ReleaseValidation({
  state: viewState,
}: {
  state: EditorReviewState;
}) {
  const { validation, modelReviews, onIssue } = viewState;

  return (
    <div className="validation-card">
      <strong>
        {validation.pending
          ? 'Checking the latest draft…'
          : validation.failed
            ? 'Validation could not finish'
            : validation.errors.length
              ? 'Validation needs attention'
              : modelReviews.length
                ? 'Model review required before preview'
                : 'Draft validation passed'}
      </strong>
      {modelReviews.length > 0 && (
        <section aria-label="Model release blockers">
          <p>
            Draft saves are safe. Review these surfaces and authored models in
            Edit model before building a preview. Geometry and material changes
            require another review.
          </p>
          {modelReviews.map((issue) => (
            <div
              key={`${issue.featureId}:${issue.field}`}
              className="form-error"
            >
              <p>{issue.message}</p>
              <button
                className="editor-secondary"
                onClick={() => onIssue(issue)}
              >
                Review model · {issue.message.split(': ')[0]}
              </button>
            </div>
          ))}
        </section>
      )}
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
          className={issue.severity === 'warning' ? 'small-note' : 'form-error'}
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
            <button className="editor-secondary" onClick={() => onIssue(issue)}>
              {issue.repair === 'choose-place'
                ? 'Choose entrance’s place'
                : issue.repair === 'connect-path'
                  ? 'Connect to path'
                  : 'Review blocked segment'}
            </button>
          )}
          {issue.coordinates && (
            <button className="text-button" onClick={() => onIssue(issue)}>
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
  );
}
