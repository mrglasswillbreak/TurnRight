import { ImportMapPreview } from './ImportMapPreview';
import { mapFormats } from './map-formats';
import type { CampusWorkspaceState } from './useCampusWorkspace';

export function CampusImportSummary({
  state,
}: {
  state: CampusWorkspaceState;
}) {
  const { job, current, currentData, dark, counts } = state;
  if (!job) return null;
  return (
    <>
      {job.summary && (
        <>
          <details>
            <summary>Supported vector formats</summary>
            {mapFormats.map((f) => (
              <p key={f.name}>
                {f.name}: {f.extensions.join(', ')}
              </p>
            ))}
          </details>
          {job.summary.sampling?.some((s) => s.shown < s.total) && (
            <p className="notice">
              Preview is sampled across layers; validation includes every
              feature.{' '}
              {job.summary.sampling
                .map((s) => `${s.layer}: ${s.shown}/${s.total}`)
                .join(' · ')}
            </p>
          )}
          {!!job.summary.repairs?.length && (
            <details open>
              <summary>
                {job.summary.reportCounts?.repairs ??
                  job.summary.repairs.length}{' '}
                automatic geometry repairs
              </summary>
              {(job.summary.reportCounts?.repairs || 0) >
                job.summary.repairs.length && (
                <p className="hint">
                  Showing the first {job.summary.repairs.length} receipts.{' '}
                  {job.artifacts_expired_at
                    ? 'The remaining receipts expired with the old source files.'
                    : 'The complete report is retained with the private import candidate.'}
                </p>
              )}
              {job.summary.repairs.map((r, i) => (
                <p key={i}>
                  {r.layer} · {r.sourceId}: {r.actions.join(', ')}
                  {r.areaChangePercent !== undefined
                    ? ` (${r.areaChangePercent.toPrecision(3)}% area change)`
                    : ''}
                </p>
              ))}
            </details>
          )}
          {!!job.summary.diagnostics?.length && (
            <details>
              <summary>Retained owner corrections</summary>
              {job.summary.diagnostics.map((d, i) => (
                <p key={i}>
                  {d.sourceId}: {d.message}
                </p>
              ))}
            </details>
          )}
          <ImportMapPreview
            campus={current}
            base={currentData}
            features={job.summary.features}
            dark={dark}
          />
          {counts && (
            <div className="import-counts">
              <span>
                <strong>{counts.added}</strong> additions
              </span>
              <span>
                <strong>{counts.modified}</strong> changes
              </span>
              <span>
                <strong>{counts.removed}</strong> removals
              </span>
              <span>
                <strong>{counts.skipped}</strong> skipped
              </span>
            </div>
          )}
          {job.summary.errors.map((v, i) => (
            <p key={i} role="alert" className="campus-error">
              {v}
            </p>
          ))}
          {job.summary.warnings.map((v, i) => (
            <p key={i} className="small-note">
              {v}
            </p>
          ))}
          {job.summary.duplicates.length > 0 && (
            <p>
              {job.summary.duplicates.length} overlapping buildings require
              duplicate review.
            </p>
          )}
        </>
      )}
    </>
  );
}
