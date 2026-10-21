import { AdminRequestError } from './admin-client';
import { useEditorReview, type EditorReviewProps } from './useEditorReview';
import { EditorEvidenceReview } from './EditorEvidenceReview';
import { EditorReportReview } from './EditorReportReview';
import { EditorReleaseReview } from './EditorReleaseReview';

export function EditorReview(props: EditorReviewProps) {
  const viewState = useEditorReview(props);
  const { statusError, onSignIn, setStatusAttempt } = viewState;

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
      <EditorEvidenceReview state={viewState} />
      <EditorReportReview state={viewState} />
      <EditorReleaseReview state={viewState} />
    </>
  );
}

export type { ReviewState } from './editor-review-state';
