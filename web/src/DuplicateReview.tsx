import { useState } from 'react';
import { buildingDisplay } from './map-display';
import type { DuplicateCandidate } from './duplicates';
import type { CampusData, MapEdit } from './types';
import { canonical } from './editor-conflicts';

export function DuplicateReview({
  data,
  candidates,
  pending,
  decide,
  inspect,
  undo,
  canUndo,
  exactBatch,
  applyExact,
}: {
  data: CampusData;
  candidates: DuplicateCandidate[];
  pending: boolean;
  decide: (candidate: DuplicateCandidate, survivor?: string) => Promise<void>;
  inspect: (kind: DuplicateCandidate['kind'], id: string) => void;
  undo: () => void;
  canUndo: boolean;
  exactBatch: MapEdit[];
  applyExact: (batch: MapEdit[]) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [proposal, setProposal] = useState<MapEdit[] | null>(null);
  const stale = !!proposal && canonical(proposal) !== canonical(exactBatch);
  const filtered = candidates.filter((c) =>
    `${c.names.join(' ')} ${c.ids.join(' ')} ${c.reason}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="duplicate-review">
      <h2>Duplicate review</h2>
      <p className="small-note">
        Review exact matches as a batch or compare pairs individually. A
        repeated name can belong to separate buildings.
      </p>
      {!!exactBatch.length && (
        <button
          className="editor-secondary"
          disabled={pending}
          onClick={() => setProposal(structuredClone(exactBatch))}
        >
          Review exact duplicate cleanup
        </button>
      )}
      {proposal && (
        <section
          className="change-card"
          aria-label="Proposed duplicate cleanup"
        >
          <h3>Proposed duplicate cleanup</h3>
          {proposal
            .filter((e) => e.deleted && e.properties.mergedInto)
            .map((e) => (
              <p key={`${e.kind}:${e.id}`}>
                Remove {String(e.properties.name || e.id)} ({e.id}) → keep{' '}
                {e.properties.mergedInto}
              </p>
            ))}
          {proposal
            .filter((e) => e.kind === 'entrance')
            .map((e) => (
              <p key={e.id}>
                Redirect entrance {String(e.properties.name || e.id)} to{' '}
                {String(e.properties.placeId || e.properties.buildingId)}
              </p>
            ))}
          <p>
            {proposal.length} correction records in one undoable batch. Saved
            place references follow the survivors.
          </p>
          {stale && (
            <p className="notice">
              The draft changed. Review the updated batch.
            </p>
          )}
          <div className="button-row">
            <button
              className="editor-primary"
              disabled={pending || stale}
              onClick={async () => {
                await applyExact(proposal);
                setProposal(null);
              }}
            >
              Apply reviewed duplicate cleanup
            </button>
            <button className="editor-text" onClick={() => setProposal(null)}>
              Cancel cleanup
            </button>
          </div>
        </section>
      )}
      <button
        className="editor-text"
        disabled={!canUndo || pending}
        onClick={undo}
      >
        Undo last edit
      </button>
      <label className="field-label">
        Find a pair
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name or record ID"
        />
      </label>
      <output>
        {pending
          ? 'Checking the latest draft…'
          : `${filtered.length} pairs to review`}
      </output>
      {!pending && !filtered.length && (
        <p className="small-note">No unresolved pairs match this view.</p>
      )}
      {filtered.slice(0, 50).map((candidate) => (
        <article className="duplicate-pair" key={candidate.key}>
          <h3>{candidate.reason}</h3>
          <p className="small-note">
            {candidate.kind === 'place'
              ? `${Math.round(candidate.distance)} m apart`
              : 'Compare footprint geometry and recorded heights.'}
          </p>
          {candidate.ids.map((id, i) => {
            const place = data.places.find((p) => p.id === id);
            const building = data.map.features.find(
              (f) =>
                f.properties?.kind === 'building' && f.properties.id === id,
            );
            const entrances = (data.entrances || []).filter((e) =>
              candidate.kind === 'place'
                ? e.placeId === id
                : e.buildingId === id,
            );
            return (
              <div className="duplicate-record" key={id}>
                <strong>{candidate.names[i]}</strong>
                <code>{id}</code>
                <small>
                  {candidate.kind === 'place'
                    ? `${place?.category} · ${place?.graphNode ? 'Has a path connection' : 'No direct path connection'}`
                    : buildingDisplay(building?.properties || {}).description}
                </small>
                <small>
                  {entrances.length} entrances ·{' '}
                  {String(
                    candidate.kind === 'place'
                      ? place?.source || 'Unknown source'
                      : building?.properties?.source || 'Unknown source',
                  )}
                </small>
                <div className="duplicate-actions">
                  <button
                    className="editor-text"
                    disabled={pending}
                    onClick={() => inspect(candidate.kind, id)}
                  >
                    Inspect record {i + 1}
                  </button>
                  <button
                    className="editor-primary"
                    disabled={pending}
                    onClick={() => void decide(candidate, id)}
                  >
                    Keep record {i + 1} and merge
                  </button>
                </div>
              </div>
            );
          })}
          <p className="small-note">
            The survivor keeps its geometry and direct path connection. Names
            and provenance are combined; entrances and saved place IDs are
            redirected. Undo restores both records.
          </p>
          <button
            className="editor-text"
            disabled={pending}
            onClick={() => void decide(candidate)}
          >
            Keep these records separate
          </button>
        </article>
      ))}
      {filtered.length > 50 && (
        <p className="small-note">
          Showing the first 50 pairs. Search to narrow the list.
        </p>
      )}
    </div>
  );
}
