import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { MapEdit, CampusData } from './types';
import type {
  BuildingSelection,
  RoofDraft,
  SurfaceStyle,
} from './visual-types';
import {
  buildingTopology,
  polygonsOf,
  resolveBuildingVisual,
  styleFor,
  topologyFits,
  resetBuildingAssignments,
  standardRoofSupported,
  generatedRoofPitch,
} from './building-surfaces';
import { RoofPlanEditor } from './RoofPlanEditor';
import './building-editor.css';
import type { EditorWorkspace } from './editor-workspace';
import { ModelField } from './ModelField';
import { useCompactModel } from './model-mobile';
import { fitRoofHeight, inheritsBuildingHeight } from './model-height';
import { buildingDisplay } from './map-display';
import type { ValidationIssue } from './validation';
const PhotoModelWorkspace = lazy(() => import('./PhotoModelWorkspace'));

export type BuildingMode = 'appearance' | 'outline' | 'roof';
export function BuildingAppearanceEditor({
  edit,
  data,
  mode,
  onMode,
  selection,
  onSelection,
  onEdit,
  onHeightEdit,
  roofDraft,
  onRoofDraft,
  onApplyRoof,
  embedded = false,
  workspace,
  onHistory,
  reviewRequest,
  onReviewOpened,
}: {
  edit: MapEdit;
  data: CampusData;
  mode: BuildingMode;
  onMode: (mode: BuildingMode) => void;
  selection?: BuildingSelection;
  onSelection: (selection: BuildingSelection) => void;
  onEdit: (edit: MapEdit, field?: string) => void | boolean;
  onHeightEdit?: (edit: MapEdit) => void | boolean;
  roofDraft: RoofDraft | null;
  onRoofDraft: (draft: RoofDraft | null) => void;
  onApplyRoof: (edit: MapEdit) => void;
  embedded?: boolean;
  workspace?: EditorWorkspace;
  onHistory?: (redo?: boolean) => void;
  reviewRequest?: ValidationIssue;
  onReviewOpened?: () => void;
}) {
  const compact = useCompactModel();
  const workspaceTrigger = useRef<HTMLElement | null>(null);
  const [photoModelOpen, setPhotoModelOpen] = useState(false);
  const [adjustRoofHeight, setAdjustRoofHeight] = useState(true);
  const [pendingHeightMode, setPendingHeightMode] = useState<string>();
  const heightMode =
    workspace?.modelInputs[edit.id]?.['building:heightMode'] ||
    pendingHeightMode ||
    String(edit.properties.heightMode || 'metres');
  const [workspaceMode, setWorkspaceMode] = useState<
    'details' | 'review' | BuildingMode
  >('details');
  useEffect(() => {
    if (!embedded && reviewRequest) {
      workspaceTrigger.current = document.activeElement as HTMLElement;
      setWorkspaceMode('review');
      setPhotoModelOpen(true);
      onReviewOpened?.();
    }
  }, [embedded, reviewRequest, onReviewOpened]);
  const feature = useMemo(
    () => ({
      type: 'Feature' as const,
      geometry: edit.geometry,
      properties: { ...edit.properties, id: edit.id },
    }),
    [edit.geometry, edit.properties, edit.id],
  );
  const topology = useMemo(() => buildingTopology(feature), [feature]),
    appearance = edit.properties.appearance || {};
  const visual = useMemo(
    () =>
      resolveBuildingVisual(
        feature,
        data.visuals?.buildings.find((b) => b.id === edit.id),
      ),
    [feature, data.visuals, edit.id],
  );
  const part = topology.parts.find((p) => p.id === selection?.partId),
    index = topology.parts.findIndex((p) => p === part);
  // Undo or a reviewed outline change may remove the selected surface. Resolve
  // a safe inspector immediately, before the selection-repair effect runs.
  const partId = part?.id,
    wallId = part?.rings.some((r) =>
      r.wallIds.includes(selection?.wallId || ''),
    )
      ? selection?.wallId
      : undefined;
  const own = wallId
    ? appearance.walls?.[wallId] || {}
    : partId
      ? appearance.parts?.[partId] || {}
      : appearance;
  const resolved = styleFor(appearance, visual, partId, wallId);
  const locked = !!roofDraft;
  const brokenTopology =
    !!edit.properties.buildingTopology &&
    !topologyFits(edit.geometry, edit.properties.buildingTopology);
  const partIds = new Set(topology.parts.map((p) => p.id)),
    wallIds = new Set(
      topology.parts.flatMap((p) => p.rings.flatMap((r) => r.wallIds)),
    );
  const orphans = ['parts', 'walls', 'roofs'].some((key) =>
    Object.keys(appearance[key as 'parts'] || {}).some(
      (id) => !(key === 'walls' ? wallIds : partIds).has(id),
    ),
  );
  const invalidSelection =
    (!!selection?.partId && !part) || (!!selection?.wallId && !wallId);
  useEffect(() => {
    if (invalidSelection)
      onSelection({ buildingId: edit.id, partId: part?.id });
  }, [invalidSelection, onSelection, edit.id, part?.id]);
  const change = (
    field: keyof SurfaceStyle,
    value: unknown,
    continuous = false,
  ) => {
    const next = structuredClone(appearance);
    const target: SurfaceStyle = wallId
      ? ((next.walls ||= {})[wallId] ||= {})
      : partId
        ? ((next.parts ||= {})[partId] ||= {})
        : next;
    if (
      field === 'heightMode' &&
      value === 'floors' &&
      target.floors === undefined
    )
      target.floors = Math.max(1, Math.round(wingHeight / 3));
    if (
      field === 'heightMode' &&
      value === 'metres' &&
      target.height === undefined
    )
      target.height = wingHeight;
    if (field === 'roofPitch' && value !== undefined && !target.roofForm)
      target.roofForm = resolved.roofForm;
    if (
      value === undefined &&
      ['height', 'floors', 'heightMode'].includes(field)
    ) {
      delete target.height;
      delete target.floors;
      delete target.heightMode;
    } else if (value === undefined) delete target[field];
    else Object.assign(target, { [field]: value });
    let updated: MapEdit = {
      ...edit,
      properties: {
        ...edit.properties,
        appearance: next,
        buildingTopology: topology,
      },
    };
    if (
      partId &&
      !wallId &&
      adjustRoofHeight &&
      ['height', 'floors', 'heightMode'].includes(field)
    ) {
      const part = updated.properties.appearance?.parts?.[partId];
      const height =
        part?.heightMode === 'floors'
          ? Number(part.floors) * 3
          : part?.heightMode === 'unknown'
            ? 6
            : (part?.height ?? buildingDisplay(edit.properties).metres);
      updated = fitRoofHeight(updated, partId, height);
    }
    return onEdit(
      updated,
      continuous
        ? `${partId || 'building'}:${wallId || ''}:${field}`
        : undefined,
    );
  };
  const reset = (key: keyof SurfaceStyle) =>
    own[key] !== undefined && (
      <button
        type="button"
        className="inherit-value"
        onClick={() => change(key, undefined)}
      >
        Use inherited value<span className="sr-only"> for {key}</span>
      </button>
    );
  const numeric = (
    label: string,
    key: 'windowSpacing' | 'roofPitch' | 'height' | 'floors',
    value: number | undefined,
    min: number,
    max: number,
    step = 0.1,
  ) => (
    <div className="surface-field" key={key}>
      {embedded && value !== undefined ? (
        <ModelField
          label={label}
          value={value}
          field={`appearance:${partId || 'building'}:${wallId || ''}:${key}`}
          buildingId={edit.id}
          workspace={workspace}
          min={min}
          max={max}
          step={step}
          onCommit={(value) => change(key, Number(value)) !== false}
        />
      ) : (
        <label className="field-label">
          {label}
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value ?? ''}
            placeholder={
              key === 'roofPitch' ? 'Generated proportions' : undefined
            }
            onChange={(e) =>
              change(
                key,
                e.target.value === '' ? undefined : Number(e.target.value),
                true,
              )
            }
          />
        </label>
      )}
      {reset(key)}
    </div>
  );
  const choose = (partId?: string, wallId?: string) =>
    onSelection({ buildingId: edit.id, partId, wallId });
  const changeHeight = (field: string, value: unknown) => {
    if (
      field === 'heightMode' &&
      value === 'floors' &&
      !(
        Number.isInteger(edit.properties.floors) &&
        Number(edit.properties.floors) > 0
      )
    ) {
      if (workspace)
        workspace.recoverModelInput(edit.id, 'building:heightMode', 'floors');
      else setPendingHeightMode('floors');
      return true;
    }
    let next: MapEdit = {
      ...edit,
      properties: {
        ...edit.properties,
        ...(['height', 'floors'].includes(field) ? { heightMode } : {}),
        [field]: value,
      },
    };
    if (
      adjustRoofHeight &&
      ['height', 'floors', 'heightMode'].includes(field)
    ) {
      const p = next.properties;
      const valid =
        p.heightMode === 'floors'
          ? Number.isInteger(p.floors) && Number(p.floors) > 0
          : Number(p.height) > 0;
      if (valid)
        for (const part of topology.parts)
          if (inheritsBuildingHeight(p.appearance?.parts?.[part.id]))
            next = fitRoofHeight(next, part.id, buildingDisplay(p).metres);
    }
    const accepted = (onHeightEdit || onEdit)(next) !== false;
    if (accepted && ['height', 'floors', 'heightMode'].includes(field)) {
      workspace?.recoverModelInput(edit.id, 'building:heightMode');
      setPendingHeightMode(undefined);
    }
    return accepted;
  };
  const wingHeight =
    own.heightMode === 'floors'
      ? Number(own.floors) * 3
      : own.heightMode === 'unknown'
        ? 6
        : (own.height ?? visual.partHeights?.[index]?.height ?? visual.height);
  const polygons = polygonsOf(edit.geometry);
  const canPitch = (partId ? [polygons[index]] : polygons).every(
    standardRoofSupported,
  );
  const pitch =
    resolved.roofPitch ??
    (canPitch
      ? Number(
          generatedRoofPitch(polygons[Math.max(0, index)], wingHeight).toFixed(
            1,
          ),
        )
      : undefined);
  return (
    <section
      className="building-appearance"
      aria-label="Building appearance editor"
    >
      {!embedded && (
        <div className="model-entry-actions">
          <button
            type="button"
            onClick={(event) => {
              workspaceTrigger.current = event.currentTarget;
              setWorkspaceMode('details');
              setPhotoModelOpen(true);
            }}
          >
            {compact ? 'Photo & model' : 'Edit selected model'}
          </button>
          <button
            type="button"
            onClick={(event) => {
              workspaceTrigger.current = event.currentTarget;
              setWorkspaceMode('appearance');
              setPhotoModelOpen(true);
            }}
          >
            Height &amp; floors
          </button>
        </div>
      )}
      {photoModelOpen && (
        <Suspense
          fallback={
            <output aria-live="polite">Opening model workspace…</output>
          }
        >
          <PhotoModelWorkspace
            key={edit.id}
            edit={edit}
            data={data}
            selection={selection}
            onSelection={onSelection}
            onEdit={onEdit}
            onClose={() => setPhotoModelOpen(false)}
            returnFocus={workspaceTrigger}
            workspace={workspace}
            onHistory={onHistory}
            initialMode={workspaceMode}
          />
        </Suspense>
      )}
      {!embedded && !photoModelOpen && (
        <fieldset className="building-modes" aria-label="Building editing mode">
          {(['appearance', 'outline', 'roof'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              disabled={locked && m !== 'roof'}
              onClick={(event) => {
                workspaceTrigger.current = event.currentTarget;
                onMode(m);
                setWorkspaceMode(m);
                setPhotoModelOpen(true);
              }}
            >
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </fieldset>
      )}
      {(!photoModelOpen || embedded) && (
        <>
          <label className="field-label">
            Building / wing
            <select
              aria-label="Building or wing"
              disabled={locked}
              value={partId || ''}
              onChange={(e) => choose(e.target.value || undefined)}
            >
              <option value="">Whole building · defaults</option>
              {topology.parts.map((p, i) => (
                <option key={p.id} value={p.id}>
                  Wing {i + 1}
                </option>
              ))}
            </select>
          </label>
          {part && mode !== 'roof' && (
            <label className="field-label">
              Wall
              <select
                aria-label="Wall"
                disabled={locked}
                value={wallId || ''}
                onChange={(e) => choose(part.id, e.target.value || undefined)}
              >
                <option value="">All walls · wing defaults</option>
                {part.rings.flatMap((r, ri) =>
                  r.wallIds.map((id, wi) => (
                    <option key={id} value={id}>
                      {ri ? `Courtyard ${ri}` : 'Outside'} wall {wi + 1}
                    </option>
                  )),
                )}
              </select>
            </label>
          )}
          {(brokenTopology || orphans) && (
            <div className="notice" role="alert">
              <p>
                {brokenTopology
                  ? 'Surface identities no longer match the outline. Review a reset before continuing.'
                  : 'Some appearance settings refer to removed surfaces.'}
              </p>
              <button
                onClick={() =>
                  onEdit(resetBuildingAssignments(edit, !brokenTopology))
                }
              >
                {brokenTopology
                  ? 'Reset surface identities and assignments'
                  : 'Reset unassigned surfaces'}
              </button>
            </div>
          )}
          {(topology.issues || []).map((issue) => (
            <div className="notice" role="alert" key={issue.id}>
              <p>{issue.message}</p>
              {issue.candidates.map((candidate, i) => (
                <button
                  key={i}
                  onClick={() => {
                    const next = structuredClone(appearance);
                    if (issue.wallId)
                      (next.walls ||= {})[issue.wallId] = candidate;
                    else {
                      (next.parts ||= {})[issue.partId] = candidate;
                      delete next.roofs?.[issue.partId];
                    }
                    onEdit({
                      ...edit,
                      properties: {
                        ...edit.properties,
                        appearance: next,
                        buildingTopology: {
                          ...topology,
                          issues: topology.issues?.filter(
                            (item) => item.id !== issue.id,
                          ),
                        },
                      },
                    });
                  }}
                >
                  Use former style {i + 1} (
                  {candidate.wallColour || 'inherited'})
                </button>
              ))}
              <button
                onClick={() => {
                  const next = structuredClone(appearance);
                  if (issue.wallId) delete next.walls?.[issue.wallId];
                  else {
                    delete next.parts?.[issue.partId];
                    delete next.roofs?.[issue.partId];
                  }
                  onEdit({
                    ...edit,
                    properties: {
                      ...edit.properties,
                      appearance: next,
                      buildingTopology: {
                        ...topology,
                        issues: topology.issues?.filter(
                          (item) => item.id !== issue.id,
                        ),
                      },
                    },
                  });
                }}
              >
                Reset surface assignments
              </button>
            </div>
          ))}
          {mode === 'outline' ? (
            <p className="small-note">
              Move outline vertices on the map. Surface styles follow their
              walls; joining differently styled walls requires review.
            </p>
          ) : mode === 'roof' ? (
            part ? (
              <RoofPlanEditor
                autoSave={embedded}
                workspace={workspace}
                key={part.id}
                edit={edit}
                partId={part.id}
                polygon={polygonsOf(edit.geometry)[index]}
                topology={part}
                height={wingHeight}
                illustrative={
                  own.heightMode === 'unknown' ||
                  (!own.height &&
                    !own.floors &&
                    (visual.partHeights?.[index]?.kind || visual.heightKind) ===
                      'illustrative')
                }
                draft={
                  roofDraft?.buildingId === edit.id &&
                  roofDraft.partId === part.id
                    ? roofDraft
                    : null
                }
                onDraft={onRoofDraft}
                focusedSurface={selection?.roofTriangle}
                onSurface={(index) =>
                  onSelection({
                    buildingId: edit.id,
                    partId: part.id,
                    role: 'roof',
                    roofTriangle: index,
                  })
                }
                onApply={onApplyRoof}
              />
            ) : (
              <p className="notice">
                Choose a wing above to edit its roof plan.
              </p>
            )
          ) : (
            <>
              {embedded && (
                <fieldset className="model-building-height">
                  <legend>
                    Building height · all wings inherit unless overridden
                  </legend>
                  <label>
                    Building height information
                    <select
                      value={heightMode}
                      onChange={(e) =>
                        changeHeight('heightMode', e.target.value)
                      }
                    >
                      <option value="metres">
                        Height in metres, or unknown
                      </option>
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
                        Number.isInteger(Number(v)) &&
                        changeHeight('floors', Number(v))
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
                      <button
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
                            workspace?.recoverModelInput(
                              edit.id,
                              'building:height',
                            );
                            workspace?.recoverModelInput(
                              edit.id,
                              'building:floors',
                            );
                          }
                        }}
                      >
                        Use unknown building height
                      </button>
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
                    Enter only recorded information. Unknown height uses an
                    illustrative block; a floor count estimates 3 m per floor.
                  </p>
                  {Object.keys(appearance.roofs || {}).length > 0 && (
                    <>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={adjustRoofHeight}
                          onChange={(e) =>
                            setAdjustRoofHeight(e.target.checked)
                          }
                        />
                        Adjust custom roof elevations with height; preserve roof
                        proportions
                      </label>
                      <p className="small-note">
                        Fixed roof elevations control the visible wall height.
                        Turning this off keeps those elevations. Details retain
                        their physical dimensions and affected walls need
                        review.
                      </p>
                      <button
                        onClick={() => {
                          let next = edit;
                          for (const part of topology.parts)
                            if (
                              inheritsBuildingHeight(
                                appearance.parts?.[part.id],
                              )
                            )
                              next = fitRoofHeight(
                                next,
                                part.id,
                                buildingDisplay(edit.properties).metres,
                              );
                          (onHeightEdit || onEdit)(next);
                        }}
                      >
                        Fit inherited custom roofs to current building height
                      </button>
                    </>
                  )}
                  {topology.parts
                    .filter(
                      (p) => !inheritsBuildingHeight(appearance.parts?.[p.id]),
                    )
                    .map((p) => (
                      <p className="model-height-override" key={p.id}>
                        Wing {topology.parts.indexOf(p) + 1} has its own height.{' '}
                        <button
                          onClick={() => {
                            const next = structuredClone(edit);
                            const own =
                              next.properties.appearance!.parts![p.id];
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
                          Use building height for Wing{' '}
                          {topology.parts.indexOf(p) + 1}
                        </button>
                      </p>
                    ))}
                </fieldset>
              )}
              <p className="small-note">
                {wallId
                  ? 'This wall inherits wing settings.'
                  : partId
                    ? 'This wing inherits building defaults.'
                    : 'Building defaults apply to all wings and walls unless overridden.'}{' '}
                Select surfaces on the 3D model or use the lists above.
              </p>
              <p className="small-note building-night-note">
                Enhanced 3D keeps these saved colours in dark mode. Lighting
                adds shading to the model.
              </p>
              {(
                [
                  'wallColour',
                  'roofColour',
                  'windowColour',
                  'trimColour',
                ] as const
              )
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
                    onChange={(e) =>
                      change('windows', e.target.value === 'show')
                    }
                  >
                    <option value="show">Show illustrative windows</option>
                    <option value="hide">Hide windows</option>
                  </select>
                </label>
                {reset('windows')}
              </div>
              {!resolved.windows && (
                <p className="small-note">
                  Windows are hidden on this surface. Show windows to preview
                  their colour, trim and spacing.
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
                      This wing uses a custom roof. Standard form and pitch take
                      effect after choosing Use standard roof in Roof mode.
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
                    numeric(
                      'Standard roof pitch (degrees)',
                      'roofPitch',
                      pitch,
                      1,
                      60,
                    )}
                  <p className="small-note">
                    Custom roof plans override standard forms. Complex outlines
                    use a flat cap until a custom roof is applied.
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
                            e.target.value === 'inherit'
                              ? undefined
                              : e.target.value,
                          )
                        }
                      >
                        <option value="inherit">Inherit building height</option>
                        <option value="metres">Metres</option>
                        <option value="floors">Floors · 3 m per floor</option>
                        <option value="unknown">
                          Unknown · illustrative 6 m
                        </option>
                      </select>
                    </label>
                    {reset('heightMode')}
                    {appearance.roofs?.[partId!] && (
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={adjustRoofHeight}
                          onChange={(e) =>
                            setAdjustRoofHeight(e.target.checked)
                          }
                        />
                        Adjust custom roof elevations with wing height
                      </label>
                    )}
                  </div>
                  {own.heightMode === 'floors' ? (
                    numeric('Wing floors', 'floors', resolved.floors, 1, 50, 1)
                  ) : own.heightMode === 'metres' ? (
                    numeric(
                      'Wing total height (m)',
                      'height',
                      wingHeight,
                      0.1,
                      150,
                    )
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
                      onChange={(e) =>
                        change('provenance', e.target.value, true)
                      }
                    />
                  </label>
                )}
                {reset('provenance')}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
