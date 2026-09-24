import { useMemo, useState } from 'react';
import type { CampusData, MapEdit } from './types';
import { photoModelProposals } from './photo-model-proposals';
export function BuildingPhotoReview({
  data,
  edits,
  disabled,
  onApply,
  onLocate,
}: {
  data: CampusData;
  edits: MapEdit[];
  disabled: boolean;
  onApply: (edits: MapEdit[]) => Promise<void>;
  onLocate: (id: string) => void;
}) {
  const proposals = useMemo(
      () => photoModelProposals(data, edits),
      [data, edits],
    ),
    [excluded, setExcluded] = useState(new Set<string>());
  const selected = proposals.filter(
    (p) => p.edit && !excluded.has(p.record.buildingId),
  );
  return (
    <details className="building-reference-review change-card">
      <summary>Photo &amp; model evidence · 19 buildings</summary>
      <p>
        39 photographs assessed. One auditorium gallery image shows the campus
        gate; it is excluded from these model observations. Wall orientation
        must be confirmed before applying photographic textures.
      </p>
      <p>
        These proposals add framed window detail and evidence notes while
        retaining your colours, custom roofs, and wall assignments. Opening
        positions and frame dimensions remain illustrative.
      </p>
      <button
        className="editor-primary"
        disabled={disabled || !selected.length}
        onClick={() => void onApply(selected.map((p) => p.edit!))}
      >
        Apply {selected.length} reviewed photo detail proposals
      </button>
      {proposals.map(({ record, edit, reason }) => (
        <details className="building-reference-item" key={record.buildingId}>
          <summary>{record.name}</summary>
          {edit && (
            <label>
              <input
                type="checkbox"
                checked={!excluded.has(record.buildingId)}
                onChange={(e) =>
                  setExcluded((old) => {
                    const next = new Set(old);
                    if (e.target.checked) next.delete(record.buildingId);
                    else next.add(record.buildingId);
                    return next;
                  })
                }
              />
              Include in draft
            </label>
          )}
          <p>{reason}</p>
          {record.observed.map((t) => (
            <p key={t}>{t}</p>
          ))}
          {record.needed.map((t) => (
            <p className="small-note" key={t}>
              {t}
            </p>
          ))}
          <button type="button" onClick={() => onLocate(record.buildingId)}>
            Locate and match walls
          </button>
        </details>
      ))}
    </details>
  );
}
