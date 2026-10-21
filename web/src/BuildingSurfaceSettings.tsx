import { ModelField } from './ModelField';
import type { BuildingAppearanceState } from './useBuildingAppearance';
import { BuildingHeightSettings } from './BuildingHeightSettings';
export function BuildingSurfaceSettings({
  state,
}: {
  state: BuildingAppearanceState;
}) {
  const {
    wallId,
    partId,
    embedded,
    resolved,
    edit,
    workspace,
    change,
    reset,
    numeric,
    appearance,
    canPitch,
    pitch,
    own,
    adjustRoofHeight,
    setAdjustRoofHeight,
    wingHeight,
    visual,
  } = state;

  return (
    <>
      <BuildingHeightSettings state={state} />
      <p className="small-note">
        {wallId
          ? 'This wall inherits wing settings.'
          : partId
            ? 'This wing inherits building defaults.'
            : 'Building defaults apply to all wings and walls unless overridden.'}{' '}
        Select surfaces on the 3D model or use the lists above.
      </p>
      <p className="small-note building-night-note">
        Enhanced 3D keeps these saved colours in dark mode. Lighting adds
        shading to the model.
      </p>
      {(['wallColour', 'roofColour', 'windowColour', 'trimColour'] as const)
        .filter((key) => !wallId || key !== 'roofColour')
        .map((key) => (
          <div className="surface-field" key={key}>
            {embedded ? (
              <ModelField
                label={
                  {
                    wallColour: 'Wall colour',
                    roofColour: 'Roof colour',
                    windowColour: 'Window colour',
                    trimColour: 'Trim colour',
                  }[key]
                }
                type="color"
                value={resolved[key]!}
                buildingId={edit.id}
                field={`appearance:${partId || 'building'}:${wallId || ''}:${key}`}
                workspace={workspace}
                onCommit={(v) => change(key, v) !== false}
              />
            ) : (
              <label className="field-label">
                {
                  {
                    wallColour: 'Wall colour',
                    roofColour: 'Roof colour',
                    windowColour: 'Window colour',
                    trimColour: 'Trim colour',
                  }[key]
                }
                <input
                  type="color"
                  value={resolved[key]}
                  onChange={(e) => change(key, e.target.value, true)}
                />
              </label>
            )}
            <output>{resolved[key]}</output>
            {reset(key)}
          </div>
        ))}
      <div className="surface-field">
        <label className="field-label">
          Windows
          <select
            value={resolved.windows ? 'show' : 'hide'}
            onChange={(e) => change('windows', e.target.value === 'show')}
          >
            <option value="show">Show illustrative windows</option>
            <option value="hide">Hide windows</option>
          </select>
        </label>
        {reset('windows')}
      </div>
      {!resolved.windows && (
        <p className="small-note">
          Windows are hidden on this surface. Show windows to preview their
          colour, trim and spacing.
        </p>
      )}
      {numeric(
        'Window spacing (m)',
        'windowSpacing',
        resolved.windowSpacing,
        0.5,
        20,
      )}
      {!wallId && (
        <>
          {partId && appearance.roofs?.[partId] && (
            <p className="notice">
              This wing uses a custom roof. Standard form and pitch take effect
              after choosing Use standard roof in Roof mode.
            </p>
          )}
          <div className="surface-field">
            <label className="field-label">
              Standard roof form
              <select
                value={resolved.roofForm}
                onChange={(e) => change('roofForm', e.target.value)}
              >
                <option value="flat">Flat</option>
                <option value="hip" disabled={!canPitch}>
                  Hip · four-sided wing
                </option>
                <option value="gable" disabled={!canPitch}>
                  Gable · four-sided wing
                </option>
              </select>
            </label>
            {reset('roofForm')}
          </div>
          {resolved.roofForm !== 'flat' &&
            canPitch &&
            numeric('Standard roof pitch (degrees)', 'roofPitch', pitch, 1, 60)}
          {resolved.roofForm !== 'flat' && canPitch && (
            <div className="surface-field">
              <label className="field-label">
                Ridge direction
                <select
                  aria-label="Ridge direction"
                  value={resolved.roofOrientation || 'long'}
                  onChange={(e) => change('roofOrientation', e.target.value)}
                >
                  <option value="long">Along the long edge</option>
                  <option value="short">Across the long edge</option>
                </select>
              </label>
              {reset('roofOrientation')}
            </div>
          )}
          <p className="small-note">
            Custom roof plans override standard forms. Complex outlines use a
            flat cap until a custom roof is applied.
          </p>
        </>
      )}
      {partId && !wallId && (
        <>
          <div className="surface-field">
            <label className="field-label">
              Wing height information
              <select
                value={own.heightMode || 'inherit'}
                onChange={(e) =>
                  change(
                    'heightMode',
                    e.target.value === 'inherit' ? undefined : e.target.value,
                  )
                }
              >
                <option value="inherit">Inherit building height</option>
                <option value="metres">Metres</option>
                <option value="floors">Floors · 3 m per floor</option>
                <option value="unknown">Unknown · illustrative 6 m</option>
              </select>
            </label>
            {reset('heightMode')}
            {appearance.roofs?.[partId!] && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={adjustRoofHeight}
                  onChange={(e) => setAdjustRoofHeight(e.target.checked)}
                />
                Adjust custom roof elevations with wing height
              </label>
            )}
          </div>
          {own.heightMode === 'floors' ? (
            numeric('Wing floors', 'floors', resolved.floors, 1, 50, 1)
          ) : own.heightMode === 'metres' ? (
            numeric('Wing total height (m)', 'height', wingHeight, 0.1, 150)
          ) : (
            <p className="small-note">
              Current height: {wingHeight} m{' '}
              {own.heightMode === 'unknown' ||
              visual.heightKind === 'illustrative'
                ? '· illustrative, unverified'
                : ''}
            </p>
          )}
        </>
      )}
      <div className="surface-field">
        <label className="field-label">
          Evidence confidence
          <select
            value={resolved.confidence}
            onChange={(e) => change('confidence', e.target.value)}
          >
            <option value="inferred">Inferred</option>
            <option value="observed">Observed in a reference</option>
            <option value="documented">Documented dimensions</option>
          </select>
        </label>
        {reset('confidence')}
      </div>
      <div className="surface-field">
        {embedded ? (
          <ModelField
            label="Appearance source / date"
            type="text"
            value={resolved.provenance || ''}
            buildingId={edit.id}
            field={`appearance:${partId || 'building'}:${wallId || ''}:provenance`}
            workspace={workspace}
            onCommit={(v) => change('provenance', v) !== false}
          />
        ) : (
          <label className="field-label">
            Appearance source / date
            <textarea
              maxLength={2000}
              value={resolved.provenance || ''}
              onChange={(e) => change('provenance', e.target.value, true)}
            />
          </label>
        )}
        {reset('provenance')}
      </div>
    </>
  );
}
