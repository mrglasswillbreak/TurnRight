import type { ArrivalGuide, CampusData, MapEdit } from './types';

export function ArrivalEditor({
  edit,
  onProperty,
}: {
  edit: MapEdit;
  data: CampusData;
  onProperty: (key: string, value: unknown) => void;
}) {
  if (!['place', 'entrance', 'building'].includes(edit.kind)) return null;
  const guide = (edit.properties.arrival || {}) as ArrivalGuide;
  const evidence = Object.values(guide.evidence || {}).flat()[0];
  const changeGuide = (key: keyof ArrivalGuide, value: unknown) => {
    const next = { ...guide, [key]: value };
    onProperty('arrival', next);
  };
  const applyEvidence = (source: string, checked: string) => {
    const ref = {
      sourceId: source,
      recordId: `arrival:${edit.id}`,
      checkedAt: checked,
    };
    onProperty('arrival', {
      ...guide,
      observedAt: checked,
      evidence: Object.fromEntries(
        [
          'description',
          'restrictions',
          'steps',
          'ramp',
          'surface',
          'doorwayWidthCm',
        ].map((key) => [key, [ref]]),
      ),
    });
  };
  return (
    <section className="arrival-editor">
      {edit.kind !== 'building' && (
        <details>
          <summary>Entrance & arrival observations</summary>
          {(['description', 'restrictions', 'surface'] as const).map((key) => (
            <label className="field-label" key={key}>
              {key === 'description'
                ? 'Approach instructions'
                : key === 'restrictions'
                  ? 'Recorded restrictions'
                  : 'Recorded surface'}
              <textarea
                value={guide[key] || ''}
                onChange={(e) => changeGuide(key, e.target.value || undefined)}
              />
            </label>
          ))}
          <label className="field-label">
            Recorded steps (blank = unknown)
            <input
              type="number"
              min="0"
              value={guide.steps ?? ''}
              onChange={(e) =>
                changeGuide(
                  'steps',
                  e.target.value === '' ? undefined : Number(e.target.value),
                )
              }
            />
          </label>
          <label className="field-label">
            Ramp
            <select
              value={guide.ramp || 'unknown'}
              onChange={(e) => changeGuide('ramp', e.target.value)}
            >
              <option value="unknown">Unknown</option>
              <option value="yes">Recorded present</option>
              <option value="no">Recorded absent</option>
            </select>
          </label>
          <label className="field-label">
            Measured doorway width (cm)
            <input
              type="number"
              min="1"
              value={guide.doorwayWidthCm ?? ''}
              onChange={(e) =>
                changeGuide(
                  'doorwayWidthCm',
                  e.target.value === '' ? undefined : Number(e.target.value),
                )
              }
            />
          </label>
          <label className="field-label">
            Public evidence description
            <input
              value={evidence?.sourceId || ''}
              onChange={(e) =>
                applyEvidence(e.target.value, guide.observedAt || '')
              }
              placeholder="Owner observation, campus notice…"
            />
          </label>
          <label className="field-label">
            Observation date
            <input
              type="date"
              value={guide.observedAt?.slice(0, 10) || ''}
              onChange={(e) =>
                applyEvidence(evidence?.sourceId || '', e.target.value)
              }
            />
          </label>
          {guide.needsReview && (
            <label>
              <input
                type="checkbox"
                checked={false}
                onChange={() => changeGuide('needsReview', false)}
              />{' '}
              I reviewed instructions and photos after this entrance moved.
            </label>
          )}
          <p className="small-note">
            Record only observed facts. These fields never grant access or
            create an accessible route.
          </p>
        </details>
      )}
    </section>
  );
}
