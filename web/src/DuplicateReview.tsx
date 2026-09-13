import { useState } from 'react';
import { buildingDisplay } from './map-display';
import type { DuplicateCandidate } from './duplicates';
import type { CampusData } from './types';

export function DuplicateReview({ data, candidates, pending, decide, inspect, undo, canUndo }: {
  data: CampusData; candidates: DuplicateCandidate[]; pending: boolean;
  decide: (candidate: DuplicateCandidate, survivor?: string) => Promise<void>;
  inspect: (kind: DuplicateCandidate['kind'], id: string) => void;
  undo: () => void; canUndo: boolean;
}) {
  const [search, setSearch] = useState('');
  const filtered = candidates.filter(c => `${c.names.join(' ')} ${c.ids.join(' ')} ${c.reason}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="duplicate-review">
    <h2>Duplicate review</h2>
    <p className="small-note">Exact matches with equivalent attributes and connections are consolidated when this queue opens. Review the remaining pairs individually. A repeated name can belong to separate buildings.</p>
    <button className="editor-text" disabled={!canUndo || pending} onClick={undo}>Undo last edit</button>
    <label className="field-label">Find a pair<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or record ID" /></label>
    <p role="status">{pending ? 'Checking the latest draft…' : `${filtered.length} pairs to review`}</p>
    {!pending && !filtered.length && <p className="small-note">No unresolved pairs match this view.</p>}
    {filtered.slice(0, 50).map(candidate => <article className="duplicate-pair" key={candidate.key}>
      <h3>{candidate.reason}</h3>
      <p className="small-note">{candidate.kind === 'place' ? `${Math.round(candidate.distance)} m apart` : 'Compare footprint geometry and recorded heights.'}</p>
      {candidate.ids.map((id, i) => {
        const place = data.places.find(p => p.id === id);
        const building = data.map.features.find(f => f.properties?.kind === 'building' && f.properties.id === id);
        const entrances = (data.entrances || []).filter(e => candidate.kind === 'place' ? e.placeId === id : e.buildingId === id);
        return <div className="duplicate-record" key={id}>
          <strong>{candidate.names[i]}</strong><code>{id}</code>
          <small>{candidate.kind === 'place' ? `${place?.category} · ${place?.graphNode ? 'Has a path connection' : 'No direct path connection'}` : buildingDisplay(building?.properties || {}).description}</small>
          <small>{entrances.length} entrances · {String(candidate.kind === 'place' ? place?.source || 'Unknown source' : building?.properties?.source || 'Unknown source')}</small>
          <div className="duplicate-actions">
            <button className="editor-text" disabled={pending} onClick={() => inspect(candidate.kind, id)}>Inspect record {i + 1}</button>
            <button className="editor-primary" disabled={pending} onClick={() => void decide(candidate, id)}>Keep record {i + 1} and merge</button>
          </div>
        </div>;
      })}
      <p className="small-note">The survivor keeps its geometry and direct path connection. Names and provenance are combined; entrances and saved place IDs are redirected. Undo restores both records.</p>
      <button className="editor-text" disabled={pending} onClick={() => void decide(candidate)}>Keep these records separate</button>
    </article>)}
    {filtered.length > 50 && <p className="small-note">Showing the first 50 pairs. Search to narrow the list.</p>}
  </div>;
}
