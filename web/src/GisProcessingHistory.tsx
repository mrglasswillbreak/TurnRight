import { WorkspacePane } from './WorkspaceFrame';
import { gisApi } from './gis-api';
import type { GisAnalysisState } from './useGisAnalysis';

export function GisProcessingHistory({
  state: viewState,
}: {
  state: GisAnalysisState;
}) {
  const {
    jobs,
    rerun,
    canEdit,
    busy,
    attempt,
    mutate,
    setPreview,
    setReviewed,
    setError,
    preview,
    reviewed,
  } = viewState;

  return (
    <WorkspacePane
      id="bottom"
      title="Processing history"
      className="gis-pane gis-workspace"
    >
      <h3>Processing history</h3>
      <p>
        Jobs retain the actor, input revisions, parameters, CRS, engine versions
        and diagnostics. Rerun settings uses the current revisions shown above.
      </p>
      {jobs.map((job) => (
        <article key={job.id} className="gis-job">
          <strong>{job.request.name}</strong> · {job.tool} · {job.status}
          <progress value={job.progress} max={100} />
          <p>{job.message}</p>
          <small>
            {new Date(job.created_at).toLocaleString()} · {job.actor} · revision{' '}
            {job.input_revision}
          </small>
          <div className="gis-toolbar">
            <button onClick={() => rerun(job)}>Rerun settings</button>
            {canEdit &&
              ['queued', 'running', 'succeeded'].includes(job.status) && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void attempt(() =>
                      mutate(() => gisApi('gis-job-cancel', { id: job.id })),
                    )
                  }
                >
                  Cancel
                </button>
              )}
            {job.status === 'succeeded' && job.tool !== 'export' && (
              <button
                disabled={busy}
                onClick={() =>
                  void attempt(async () => {
                    setPreview({
                      id: job.id,
                      features: await gisApi('gis-job-preview', {
                        id: job.id,
                      }),
                    });
                    setReviewed(false);
                  })
                }
              >
                Inspect staged output
              </button>
            )}
            {job.artifact && (
              <button
                onClick={() => {
                  const download = window.open('', '_blank');
                  if (!download) {
                    setError('Allow the download window to open this export.');
                    return;
                  }
                  download.opener = null;
                  void attempt(async () => {
                    try {
                      const result = await gisApi('gis-job-artifact', {
                        id: job.id,
                      });
                      download.location.replace(result.url);
                    } catch (error) {
                      download.close();
                      throw error;
                    }
                  });
                }}
              >
                Download export
              </button>
            )}
          </div>
          <details>
            <summary>Parameters and engine</summary>
            <pre>
              {JSON.stringify(
                {
                  request: job.request,
                  engine: job.engine,
                  output: job.output_dataset_id,
                },
                null,
                2,
              )}
            </pre>
          </details>
          {preview?.id === job.id && (
            <>
              <p>
                Map preview: first {preview.features.length} output features.
                All output features are validated before committing.
              </p>
              <details>
                <summary>Output attributes</summary>
                <pre>
                  {JSON.stringify(
                    preview.features.slice(0, 5).map((f) => f.properties),
                    null,
                    2,
                  )}
                </pre>
              </details>
              <label>
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                I inspected the result and diagnostics
              </label>
              <button
                disabled={!canEdit || !reviewed || busy}
                onClick={() =>
                  void attempt(() =>
                    mutate(() => gisApi('gis-job-apply', { id: job.id })),
                  )
                }
              >
                Apply as private layer
              </button>
            </>
          )}
        </article>
      ))}
    </WorkspacePane>
  );
}
