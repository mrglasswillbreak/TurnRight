import type { EditorReviewState } from './useEditorReview';

export function ReleaseImpactSummary({
  state: viewState,
}: {
  state: EditorReviewState;
}) {
  const { impact } = viewState;

  return (
    <section className="release-impact" aria-label="Release impact">
      <h3>Release impact</h3>
      {impact.pending && <p>Comparing this draft with the public map…</p>}
      {impact.error && (
        <p className="form-error" role="alert">
          {impact.error}{' '}
          <button className="editor-text" onClick={impact.retry}>
            Retry impact review
          </button>
        </p>
      )}
      {impact.result && (
        <>
          <p>
            {impact.result.changes.filter((c) => c.change === 'added').length}{' '}
            added ·{' '}
            {impact.result.changes.filter((c) => c.change === 'changed').length}{' '}
            changed ·{' '}
            {impact.result.changes.filter((c) => c.change === 'deleted').length}{' '}
            deleted
          </p>
          <details>
            <summary>
              Changed features and entrances ({impact.result.changes.length})
            </summary>
            {impact.result.changes.map((c) => (
              <p key={`${c.kind}:${c.id}`}>
                {c.change} · {c.kind} · {c.name}
              </p>
            ))}
          </details>
          <p>
            {impact.result.newlyDisconnected.length} newly disconnected
            destinations (lost approach or reachability from the comparison
            origin).
          </p>
          {impact.result.newlyDisconnected.map((p) => (
            <p className="notice" key={p.id}>
              {p.name}
            </p>
          ))}
          <div className="source-comparison">
            <table>
              <thead>
                <tr>
                  <th>Walk</th>
                  <th>Public map</th>
                  <th>This draft</th>
                </tr>
              </thead>
              <tbody>
                {[...impact.result.walks, ...impact.result.drives].map(
                  (walk) => (
                    <tr key={walk.name}>
                      <th>{walk.name}</th>
                      <td>
                        {walk.before.status}
                        {walk.before.distance !== undefined
                          ? ` · ${walk.before.distance} m`
                          : ''}
                      </td>
                      <td>
                        {walk.after.status}
                        {walk.after.distance !== undefined
                          ? ` · ${walk.after.distance} m`
                          : ''}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
