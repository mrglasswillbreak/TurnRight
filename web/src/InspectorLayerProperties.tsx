import type { EditorInspectorState } from './useEditorInspector';

export function InspectorLayerProperties({
  state: viewState,
}: {
  state: EditorInspectorState;
}) {
  const { edit, p, onProperty, field } = viewState;

  return (
    <>
      {(edit.kind === 'land' || edit.kind === 'overlay') && (
        <>
          {edit.kind === 'land' && (
            <label className="field-label">
              Land class
              <select
                value={String(p.landClass || 'developed')}
                onChange={(e) => onProperty('landClass', e.target.value)}
              >
                {[
                  'developed',
                  'green',
                  'water',
                  'wetland',
                  'bare',
                  'road',
                  'sidewalk',
                  'parking',
                  'sports',
                  'parcel',
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          {field('Surface', 'surface', 'paved, unpaved, concrete…')}
          {edit.kind === 'overlay' && (
            <>
              {field('Label', 'label')}
              <label className="field-label">
                Colour
                <input
                  type="color"
                  value={String(p.color || '#2563eb')}
                  onChange={(e) => onProperty('color', e.target.value, true)}
                />
              </label>
              <label className="field-label">
                Opacity
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={Number(p.opacity ?? 0.5)}
                  onChange={(e) =>
                    onProperty('opacity', Number(e.target.value), true)
                  }
                />
              </label>
              <label className="field-label">
                Layer order
                <input
                  type="number"
                  min="-1000"
                  max="1000"
                  value={Number(p.order || 0)}
                  onChange={(e) =>
                    onProperty('order', Number(e.target.value), true)
                  }
                />
              </label>
            </>
          )}
          <label className="field-label">
            <input
              type="checkbox"
              checked={p.visible !== false}
              onChange={(e) => onProperty('visible', e.target.checked)}
            />
            Visible on the map
          </label>
        </>
      )}
    </>
  );
}
