import { campusUrl } from './campus-context';
import { Layers, RefreshCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadJson } from './download-json';
import { BaselineReview } from './BaselineReview';
import type { EditorReviewState } from './useEditorReview';
import { ReleaseValidation } from './ReleaseValidation';
import { ReleaseImpactSummary } from './ReleaseImpactSummary';
export function EditorReleaseReview({
  state: viewState,
}: {
  state: EditorReviewState;
}) {
  const {
    tab,
    draftCount,
    workspace,
    baselineVersion,
    publishedVersion,
    validation,
    setPreview,
    preview,
    summary,
    setSummary,
    busy,
    modelReviews,
    impact,
    action,
    liveState,
  } = viewState;

  return (
    <>
      {tab === 'releases' && (
        <>
          <h2>Review, then publish</h2>
          <p>
            {draftCount} unpublished corrections · {workspace.status}
          </p>
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
          <BaselineReview />
          <p className="small-note">
            Editor baseline: {baselineVersion}
            <br />
            Public package loaded: {publishedVersion}
          </p>
          {baselineVersion !== publishedVersion && (
            <p className="notice">
              The working baseline and public package have different version
              labels. Review the actual changes below; accepted updates and
              saved access corrections are retained for the next release.
            </p>
          )}
          <ReleaseValidation state={viewState} />
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
          {validation.data.driving && (
            <p className="notice">
              Driving:{' '}
              {
                validation.data.graph.edges.filter(
                  (e) =>
                    e.vehicleAllowed &&
                    e.vehicle &&
                    ['yes', 'reviewed'].includes(e.vehicle.access) &&
                    !e.vehicle.conditional,
                ).length
              }{' '}
              permitted directed road segments;{' '}
              {validation.data.driving.parking.length} parking/drop-off points.
              Driving and walking connections are validated separately.
            </p>
          )}
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
          <ReleaseImpactSummary state={viewState} />
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
              modelReviews.length > 0 ||
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
                  href={
                    new URL(campusUrl(release.preview_url), release.preview_url)
                      .href
                  }
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
                      ? 'Stale preview: submit the current workspace for approval and build a new preview.'
                      : 'The server checks this snapshot again before publication.'}
                  </p>
                  <Button
                    disabled={
                      busy ||
                      validation.pending ||
                      validation.errors.length > 0 ||
                      modelReviews.length > 0 ||
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
                        'Submit this campus release for independent restoration review?',
                      )
                    )
                      void action(
                        'rollback',
                        { id: release.id },
                        'Restoration submitted. Open Review for independent approval, then Publish to build its preview.',
                      );
                  }}
                >
                  Submit restoration for review
                </Button>
              )}
            </div>
          ))}
        </>
      )}
    </>
  );
}
