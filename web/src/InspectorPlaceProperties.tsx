import type { EditorInspectorState } from './useEditorInspector';

export function InspectorPlaceProperties({
  state: viewState,
}: {
  state: EditorInspectorState;
}) {
  const { edit, p, onProperty, field } = viewState;

  return (
    <>
      {edit.kind === 'place' && (
        <>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={p.landmark === true}
              onChange={(e) => onProperty('landmark', e.target.checked)}
            />
            Curated public landmark
          </label>
          <label className="field-label">
            Category
            <select
              value={String(p.category || 'other')}
              onChange={(e) => onProperty('category', e.target.value)}
            >
              {[
                'academic',
                'library',
                'food',
                'services',
                'worship',
                'residence',
                'sports',
                'gate',
                'other',
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          {field('Also known as', 'aliases', 'Separate names with commas')}
          {field('Department', 'department')}
          {field('Faculty', 'faculty')}
          <details>
            <summary>Business details and evidence</summary>
            {field('Type of place', 'subtype', 'restaurant, cafe, bookshop…')}
            {field('Address', 'address')}
            {field('Public business phone', 'phone')}
            {field('Website', 'website', 'https://…')}
            {field(
              'Recorded opening hours',
              'openingHours',
              'Recorded schedule, not live status',
            )}
            <label className="field-label">
              Recorded business status
              <select
                value={String(p.businessStatus || 'unknown')}
                onChange={(e) => onProperty('businessStatus', e.target.value)}
              >
                <option value="unknown">Unknown</option>
                <option value="operating">Operating business</option>
                <option value="temporarily-closed">Temporarily closed</option>
                <option value="closed">Closed</option>
              </select>
            </label>
            {field(
              'Evidence source for changed details',
              'detailSource',
              'Source URL or campus observation reference',
            )}
            <label className="field-label">
              Date checked
              <input
                type="date"
                value={String(p.detailCheckedAt || '').slice(0, 10)}
                onChange={(e) => onProperty('detailCheckedAt', e.target.value)}
              />
            </label>
            <p className="small-note">
              Record only supported details. Source evidence is public; keep
              private survey notes out of these fields.
            </p>
          </details>
        </>
      )}
    </>
  );
}
