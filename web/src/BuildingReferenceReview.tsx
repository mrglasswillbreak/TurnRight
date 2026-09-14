import { useMemo, useState } from 'react';
import type { CampusData, MapEdit } from './types';
import type { DuplicateCandidate } from './duplicates';
import type { SurfaceStyle } from './visual-types';
import { buildingReferenceProposals } from './building-references';

const labels: Record<string, string> = {
  wallColour: 'Walls',
  roofColour: 'Roof',
  windowColour: 'Windows',
  trimColour: 'Trim',
  windowSpacing: 'Window spacing (m)',
  windows: 'Show windows',
  confidence: 'Evidence confidence',
  provenance: 'Evidence notes',
  floors: 'Approximate floor count',
};
function Value({ value }: { value: unknown }) {
  if (typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value))
    return (
      <span className="reference-colour">
        <i style={{ backgroundColor: value }} />
        {value}
      </span>
    );
  return (
    <>
      {value === undefined
        ? 'Unknown'
        : value === true
          ? 'On'
          : value === false
            ? 'Off'
            : String(value)}
    </>
  );
}
export function BuildingReferenceReview({
  data,
  duplicates,
  edits,
  disabled,
  onApply,
  onLocate,
}: {
  data: CampusData;
  duplicates: DuplicateCandidate[];
  edits: MapEdit[];
  disabled: boolean;
  onApply: (batch: MapEdit[]) => Promise<void>;
  onLocate: (id: string) => void;
}) {
  const proposals = useMemo(
    () => buildingReferenceProposals(data, duplicates, edits),
    [data, duplicates, edits],
  );
  const [excluded, setExcluded] = useState(new Set<string>());
  const [search, setSearch] = useState('');
  const ready = proposals.filter((p) => p.edit);
  const selected = ready.filter((p) => !excluded.has(p.id));
  const shown = [...proposals]
    .sort(
      (a, b) =>
        Number(!!b.edit) - Number(!!a.edit) ||
        Number(b.basis === 'photograph') - Number(a.basis === 'photograph') ||
        a.name.localeCompare(b.name),
    )
    .filter((p) =>
      `${p.name} ${p.id}`.toLowerCase().includes(search.toLowerCase()),
    );
  return (
    <details className="building-reference-review change-card">
      <summary>Building appearances</summary>
      <p>
        {proposals.length} buildings assessed · {ready.length} proposed updates
      </p>
      <p className="small-note">
        Review photo-based palettes and illustrative facades. Existing custom
        colours, wings, walls and roofs are retained. Apply is one undo step;
        the public map changes after your reviewed release.
      </p>
      <label className="field-label">
        Find a building reference
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="button-row">
        <button
          className="editor-secondary"
          onClick={() => setExcluded(new Set())}
        >
          Select all available
        </button>
        <button
          className="editor-secondary"
          onClick={() =>
            setExcluded(
              new Set(
                ready.filter((p) => p.basis !== 'photograph').map((p) => p.id),
              ),
            )
          }
        >
          Photo references only
        </button>
      </div>
      <button
        className="editor-primary"
        disabled={disabled || !selected.length}
        onClick={() => void onApply(selected.map((p) => p.edit!))}
      >
        Apply {selected.length} reviewed appearances
      </button>
      <p className="small-note">
        {selected.filter((p) => p.basis === 'photograph').length} photo
        references ·{' '}
        {selected.filter((p) => p.basis === 'source-height').length}{' '}
        illustrative facades selected. Finish active drawing or roof work before
        applying.
      </p>
      <div className="building-reference-list">
        {shown.map((p) => (
          <details className="building-reference-item" key={p.id}>
            <summary>
              {p.name}
              <span>
                {p.edit
                  ? p.basis === 'photograph'
                    ? 'Photo reference'
                    : 'Illustrative facade'
                  : 'Review needed / retained'}
              </span>
            </summary>
            <p className="small-note">{p.id}</p>
            {p.reason ? (
              <p>{p.reason}</p>
            ) : (
              <>
                <label className="reference-include">
                  <input
                    type="checkbox"
                    aria-label={`Include ${p.name}`}
                    checked={!excluded.has(p.id)}
                    onChange={(e) =>
                      setExcluded((current) => {
                        const next = new Set(current);
                        if (e.target.checked) next.delete(p.id);
                        else next.add(p.id);
                        return next;
                      })
                    }
                  />
                  Include in batch
                </label>
                <table className="reference-values">
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>Current</th>
                      <th>Proposed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.fields
                      .filter((k) => !['confidence', 'provenance'].includes(k))
                      .map((k) => (
                        <tr key={k}>
                          <th>{labels[k] || k}</th>
                          <td>
                            <Value value={p.before[k as keyof SurfaceStyle]} />
                          </td>
                          <td>
                            <Value value={p.after[k as keyof SurfaceStyle]} />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </>
            )}
            {p.notes.map((note, i) => (
              <p className="small-note" key={i}>
                {note}
              </p>
            ))}
            {p.sources.map((r) => (
              <p className="small-note" key={r.id}>
                <a href={r.url} target="_blank" rel="noreferrer">
                  View reference · {r.author}
                </a>{' '}
                · {r.date} · {r.license}
              </p>
            ))}
            <button
              className="editor-secondary"
              disabled={disabled}
              onClick={() => onLocate(p.id)}
            >
              Locate building
            </button>
          </details>
        ))}
      </div>
    </details>
  );
}
