import type { EditorInspectorState } from './useEditorInspector';

export function InspectorRoadProperties({
  state: viewState,
}: {
  state: EditorInspectorState;
}) {
  const { edit, p, field, onProperty } = viewState;

  return (
    <>
      {(edit.kind === 'path' ||
        (edit.kind === 'land' &&
          ['road', 'sidewalk'].includes(String(p.landClass)))) && (
        <fieldset className="road-properties">
          <legend>Road detail</legend>
          {field('Road class', 'highway', 'residential, service, footway…')}
          {edit.kind === 'path' &&
            field('Surface', 'surface', 'Unknown unless documented')}
          <label className="field-label">
            Width
            <input
              type="number"
              min="0.01"
              max={p.widthUnit === 'ft' ? 656.16 : 200}
              step="0.1"
              value={
                p.width == null
                  ? ''
                  : Number(p.width) / (p.widthUnit === 'ft' ? 0.3048 : 1)
              }
              onChange={(e) =>
                onProperty(
                  'width',
                  e.target.value
                    ? Number(e.target.value) *
                        (p.widthUnit === 'ft' ? 0.3048 : 1)
                    : null,
                  true,
                )
              }
            />
          </label>
          <label className="field-label">
            Width unit
            <select
              value={String(p.widthUnit || 'm')}
              onChange={(e) => onProperty('widthUnit', e.target.value)}
            >
              <option value="m">Metres</option>
              <option value="ft">Feet</option>
            </select>
          </label>
          <label className="field-label">
            Width evidence
            <select
              value={String(p.widthEvidence || 'source')}
              onChange={(e) => onProperty('widthEvidence', e.target.value)}
            >
              <option value="source">Documented source</option>
              <option value="owner">Owner observation</option>
              <option value="illustrative">Illustrative estimate</option>
            </select>
          </label>
          {field('Width source / notes', 'widthSource')}
          <p className="small-note">
            Surface geometry and width describe appearance. Access and
            connections belong to routing paths. Changing a recorded width does
            not reshape a surveyed polygon.
          </p>
        </fieldset>
      )}
    </>
  );
}
