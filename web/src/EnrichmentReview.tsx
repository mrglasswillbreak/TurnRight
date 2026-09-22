import { useState } from 'react';
import type { Position } from './types';
import { finitePosition, firstPosition } from './validation';

interface Candidate {
  id: string;
  status: string;
  reason: string;
  name?: string;
  matches?: string[];
  geometry?: { coordinates?: unknown };
  proposedPlace?: { coordinates: Position; name: string };
}
/** Local review artifacts contain proposed evidence, never automatic approvals. */
export function EnrichmentReview({
  onLocate,
}: {
  onLocate: (coordinates: Position) => void;
}) {
  const [rows, setRows] = useState<Candidate[]>([]),
    [error, setError] = useState(''),
    [query, setQuery] = useState(''),
    [limit, setLimit] = useState(40);
  const [summary, setSummary] = useState('');
  const filtered = rows.filter((r) =>
    `${r.id} ${r.name || ''} ${r.reason}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <details className="enrichment-review">
      <summary>Campus enrichment and survey queue</summary>
      <p>
        Open coverage.json or review.geojson from a campus enrichment run. These
        files contain proposals; publication still requires source and release
        review.
      </p>
      <label className="field-label">
        Review artifact
        <input
          type="file"
          accept=".json,.geojson,application/json"
          onChange={async (event) => {
            try {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.size > 12_000_000)
                throw new Error('Review artifact exceeds campus size limit.');
              const report = JSON.parse(await file.text());
              const candidates =
                report.type === 'FeatureCollection'
                  ? report.features?.map(
                      (f: {
                        properties: Candidate;
                        geometry: Candidate['geometry'];
                      }) => ({ ...f.properties, geometry: f.geometry }),
                    )
                  : report.candidates;
              if (
                !Array.isArray(candidates) ||
                candidates.length > 30000 ||
                candidates.some(
                  (r) =>
                    !r ||
                    typeof r.id !== 'string' ||
                    typeof r.reason !== 'string' ||
                    typeof r.status !== 'string',
                )
              )
                throw new Error('Choose a valid enrichment review artifact.');
              setRows(candidates);
              setLimit(40);
              setError('');
              setSummary(
                report.before && report.after
                  ? `${report.baselineVersion}: ${report.before.places} → ${report.after.places} places; ${report.before.buildings} → ${report.after.buildings} buildings. ${report.after.streetNames?.length || 0} recorded street names.`
                  : `${candidates.length} geometry candidates`,
              );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {summary && <p>{summary}</p>}
      {!!rows.length && (
        <>
          <label className="field-label">
            Find review candidates
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(40);
              }}
            />
          </label>
          <p>
            {filtered.length} candidates. “Awaiting evidence” includes
            source-backed items waiting for owner review.
          </p>
          {filtered.slice(0, limit).map((r, i) => {
            const point =
              firstPosition(r.geometry?.coordinates) ||
              r.proposedPlace?.coordinates;
            return (
              <div className="change-card" key={`${r.id}:${i}`}>
                <strong>{r.name || r.proposedPlace?.name || r.id}</strong>
                <p>
                  {r.status}: {r.reason}
                </p>
                {r.matches && <p>Compare with: {r.matches.join(', ')}</p>}
                {finitePosition(point) && (
                  <button onClick={() => onLocate(point)}>
                    Show candidate location
                  </button>
                )}
              </div>
            );
          })}
          {filtered.length > limit && (
            <button onClick={() => setLimit(limit + 40)}>
              Show more candidates
            </button>
          )}
        </>
      )}
    </details>
  );
}
