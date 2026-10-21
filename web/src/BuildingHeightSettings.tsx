import { Check as ActionCheck } from 'lucide-react';
import { ModelButton } from './ModelButton';
import type { MapEdit } from './types';
import { ModelField } from './ModelField';
import { fitRoofHeight, inheritsBuildingHeight } from './model-height';
import { buildingDisplay } from './map-display';
import type { BuildingAppearanceState } from './useBuildingAppearance';

export function BuildingHeightSettings({
  state,
}: {
  state: BuildingAppearanceState;
}) {
  const {
    embedded,
    heightMode,
    changeHeight,
    edit,
    workspace,
    onHeightEdit,
    onEdit,
    setPendingHeightMode,
    appearance,
    adjustRoofHeight,
    setAdjustRoofHeight,
    topology,
  } = state;

  return (
    <>
      {embedded && (
        <fieldset className="model-building-height">
          <legend>Building height · all wings inherit unless overridden</legend>
          <label>
            Building height information
            <select
              value={heightMode}
              onChange={(e) => changeHeight('heightMode', e.target.value)}
            >
              <option value="metres">Height in metres, or unknown</option>
              <option value="floors">Documented floor count</option>
            </select>
          </label>
          {heightMode === 'floors' ? (
            <ModelField
              label="Building floors"
              value={Number(edit.properties.floors) || ''}
              field="building:floors"
              buildingId={edit.id}
              workspace={workspace}
              min={1}
              max={50}
              step={1}
              onCommit={(v) =>
                Number.isInteger(Number(v)) && changeHeight('floors', Number(v))
              }
            />
          ) : (
            <>
              <ModelField
                label="Building height (m)"
                value={
                  edit.properties.height === undefined
                    ? ''
                    : Number(edit.properties.height)
                }
                field="building:height"
                buildingId={edit.id}
                workspace={workspace}
                min={0.1}
                max={150}
                onCommit={(v) => changeHeight('height', Number(v))}
              />
              <ModelButton
                variant="outline"
                icon={<ActionCheck />}
                onClick={() => {
                  const properties: MapEdit['properties'] = {
                    ...edit.properties,
                    heightMode: 'metres',
                  };
                  delete properties.height;
                  delete properties.floors;
                  const accepted =
                    (onHeightEdit || onEdit)({
                      ...edit,
                      properties,
                    }) !== false;
                  if (accepted) {
                    setPendingHeightMode(undefined);
                    workspace?.recoverModelInput(
                      edit.id,
                      'building:heightMode',
                    );
                    workspace?.recoverModelInput(edit.id, 'building:height');
                    workspace?.recoverModelInput(edit.id, 'building:floors');
                  }
                }}
              >
                Use unknown building height
              </ModelButton>
              <label>
                <input
                  type="checkbox"
                  checked={!!edit.properties.heightEstimated}
                  onChange={(e) =>
                    changeHeight('heightEstimated', e.target.checked)
                  }
                />{' '}
                Height is approximate
              </label>
            </>
          )}
          <ModelField
            label="Building height source / notes"
            type="text"
            value={String(edit.properties.heightSource || '')}
            field="building:heightSource"
            buildingId={edit.id}
            workspace={workspace}
            onCommit={(v) => changeHeight('heightSource', v)}
          />
          <p className="small-note">
            Enter only recorded information. Unknown height uses an illustrative
            block; a floor count estimates 3 m per floor.
          </p>
          {Object.keys(appearance.roofs || {}).length > 0 && (
            <>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={adjustRoofHeight}
                  onChange={(e) => setAdjustRoofHeight(e.target.checked)}
                />
                Adjust custom roof elevations with height; preserve roof
                proportions
              </label>
              <p className="small-note">
                Fixed roof elevations control the visible wall height. Turning
                this off keeps those elevations. Details retain their physical
                dimensions and affected walls need review.
              </p>
              <ModelButton
                variant="outline"
                onClick={() => {
                  let next = edit;
                  for (const part of topology.parts)
                    if (inheritsBuildingHeight(appearance.parts?.[part.id]))
                      next = fitRoofHeight(
                        next,
                        part.id,
                        buildingDisplay(edit.properties).metres,
                      );
                  (onHeightEdit || onEdit)(next);
                }}
              >
                Fit inherited custom roofs to current building height
              </ModelButton>
            </>
          )}
          {topology.parts
            .filter((p) => !inheritsBuildingHeight(appearance.parts?.[p.id]))
            .map((p) => (
              <p className="model-height-override" key={p.id}>
                Wing {topology.parts.indexOf(p) + 1} has its own height.{' '}
                <ModelButton
                  variant="outline"
                  icon={<ActionCheck />}
                  onClick={() => {
                    const next = structuredClone(edit);
                    const own = next.properties.appearance!.parts![p.id];
                    delete own.height;
                    delete own.floors;
                    delete own.heightMode;
                    (onHeightEdit || onEdit)(
                      adjustRoofHeight
                        ? fitRoofHeight(
                            next,
                            p.id,
                            buildingDisplay(next.properties).metres,
                          )
                        : next,
                    );
                  }}
                >
                  Use building height for Wing {topology.parts.indexOf(p) + 1}
                </ModelButton>
              </p>
            ))}
        </fieldset>
      )}
    </>
  );
}
