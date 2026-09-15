import { useMemo, useState } from 'react';
import type { CampusData, MapEdit } from './types';
import type { DuplicateCandidate } from './duplicates';
import {
  buildingRoofProposals,
  type BuildingRoofProposal,
} from './building-roofs';

function RoofPlan({ plan }: { plan: BuildingRoofProposal['roofs'][number] }) {
  const points = plan.polygon.flat();
  const west = Math.min(...points.map((p) => p[0])),
    south = Math.min(...points.map((p) => p[1]));
  const sx = Math.cos((south * Math.PI) / 180);
  const scale =
    180 /
    Math.max(
      ...points.map((p) => (p[0] - west) * sx),
      ...points.map((p) => p[1] - south),
      1e-9,
    );
  const project = (p: number[]) => [
    10 + (p[0] - west) * sx * scale,
    190 - (p[1] - south) * scale,
  ];
  return (
    <svg
      viewBox="0 0 200 200"
      className="roof-proposal-plan"
      role="img"
      aria-label="Proposed roof ridges within the unchanged wing outline"
    >
      <path
        d={plan.polygon
          .map(
            (r) => 'M' + r.map((p) => project(p).join(',')).join(' L') + ' Z',
          )
          .join(' ')}
        fillRule="evenodd"
      />
      {plan.roof.lines.map((line) => {
        const a = project(
            plan.roof.points.find((p) => p.id === line.from)!.coordinates,
          ),
          b = project(
            plan.roof.points.find((p) => p.id === line.to)!.coordinates,
          );
        return <line key={line.id} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
      })}
      {plan.roof.points.map((p) => {
        const [cx, cy] = project(p.coordinates);
        return <circle key={p.id} cx={cx} cy={cy} r="2" />;
      })}
    </svg>
  );
}
type RoofReviewProps = {
  data: CampusData;
  duplicates: DuplicateCandidate[];
  edits: MapEdit[];
  disabled: boolean;
  onApply: (batch: MapEdit[]) => Promise<void>;
  onLocate: (id: string) => void;
};
export function BuildingRoofReview(props: RoofReviewProps) {
  const [loaded, setLoaded] = useState(false);
  return (
    <details
      className="building-roof-review change-card"
      onToggle={(e) => {
        if (e.currentTarget.open) setLoaded(true);
      }}
    >
      <summary>Building roofs</summary>
      {loaded && <RoofReviewBody {...props} />}
    </details>
  );
}
function RoofReviewBody({
  data,
  duplicates,
  edits,
  disabled,
  onApply,
  onLocate,
}: RoofReviewProps) {
  const proposals = useMemo(
    () => buildingRoofProposals(data, duplicates, edits),
    [data, duplicates, edits],
  );
  const [excluded, setExcluded] = useState(new Set<string>()),
    [search, setSearch] = useState('');
  const ready = proposals.filter((p) => p.edit),
    selected = ready.filter((p) => !excluded.has(p.id));
  const shown = [...proposals]
    .sort(
      (a, b) =>
        Number(!!b.edit) - Number(!!a.edit) ||
        Number(b.basis === 'photo-form') - Number(a.basis === 'photo-form') ||
        a.name.localeCompare(b.name),
    )
    .filter((p) =>
      `${p.name} ${p.id}`.toLowerCase().includes(search.toLowerCase()),
    );
  return (
    <>
      <p>
        {proposals.length} buildings assessed · {ready.length} proposed roofs
      </p>
      <p className="small-note">
        Review ridge plans before applying. Photo-supported roof forms still use
        approximate ridge positions. Other proposals are illustrative hip roofs
        where the actual shape is unknown. Footprints, total heights, courtyards
        and existing custom roofs are retained.
      </p>
      <label className="field-label">
        Find a building roof
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
          Select all available roofs
        </button>
        <button
          className="editor-secondary"
          onClick={() =>
            setExcluded(
              new Set(
                ready.filter((p) => p.basis !== 'photo-form').map((p) => p.id),
              ),
            )
          }
        >
          Photo-supported forms only
        </button>
      </div>
      <button
        className="editor-primary"
        disabled={disabled || !selected.length}
        onClick={() => void onApply(selected.map((p) => p.edit!))}
      >
        Apply {selected.length} reviewed roofs
      </button>
      <p className="small-note">
        {selected.filter((p) => p.basis === 'photo-form').length}{' '}
        photo-supported forms ·{' '}
        {selected.filter((p) => p.basis === 'approximate').length} illustrative
        roofs selected. Apply is one undo step. Finish drawing or roof work
        first; publication uses your reviewed release.
      </p>
      <div className="building-reference-list">
        {shown.map((p) => (
          <details
            className="building-roof-item building-reference-item"
            key={p.id}
          >
            <summary>
              {p.name}
              <span>
                {p.edit
                  ? p.basis === 'photo-form'
                    ? 'Photo form / approximate ridges'
                    : 'Illustrative roof'
                  : 'Retained / review needed'}
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
                    aria-label={`Include roof for ${p.name}`}
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
                  Include in roof batch
                </label>
                {p.roofs.map((plan, i) => (
                  <div key={plan.partId}>
                    <p>Wing {i + 1}: flat cap → approximate pitched roof</p>
                    <RoofPlan plan={plan} />
                    <p className="small-note">
                      Eaves {plan.roof.eaves.toFixed(2)} m · peak{' '}
                      {Math.max(
                        ...plan.roof.points.map((p) => p.elevation),
                      ).toFixed(2)}{' '}
                      m · {plan.roof.lines.length} ridge connections
                    </p>
                    <p className="small-note">{plan.roof.provenance}</p>
                  </div>
                ))}
              </>
            )}
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
    </>
  );
}
