import { useEffect, useMemo } from 'react';
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

export type BuildingMode = 'appearance' | 'outline' | 'roof';
export function BuildingAppearanceEditor({
  edit,
  data,
  mode,
  onMode,
  selection,
  onSelection,
  onEdit,
  roofDraft,
  onRoofDraft,
  onApplyRoof,
}: {
  edit: MapEdit;
  data: CampusData;
  mode: BuildingMode;
  onMode: (mode: BuildingMode) => void;
  selection?: BuildingSelection;
  onSelection: (selection: BuildingSelection) => void;
  onEdit: (edit: MapEdit, field?: string) => void;
  roofDraft: RoofDraft | null;
  onRoofDraft: (draft: RoofDraft | null) => void;
  onApplyRoof: (edit: MapEdit) => void;
}) {
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
    onEdit(
      {
        ...edit,
        properties: {
          ...edit.properties,
          appearance: next,
          buildingTopology: topology,
        },
      },
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
      {reset(key)}
    </div>
  );
  const choose = (partId?: string, wallId?: string) =>
    onSelection({ buildingId: edit.id, partId, wallId });
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
      <fieldset className="building-modes" aria-label="Building editing mode">
        {(['appearance', 'outline', 'roof'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            disabled={locked && m !== 'roof'}
            onClick={() => onMode(m)}
          >
            {m[0].toUpperCase() + m.slice(1)}
          </button>
        ))}
      </fieldset>
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
                if (issue.wallId) (next.walls ||= {})[issue.wallId] = candidate;
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
              Use former style {i + 1} ({candidate.wallColour || 'inherited'})
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
          Move outline vertices on the map. Surface styles follow their walls;
          joining differently styled walls requires review.
        </p>
      ) : mode === 'roof' ? (
        part ? (
          <RoofPlanEditor
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
              roofDraft?.buildingId === edit.id && roofDraft.partId === part.id
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
          <p className="notice">Choose a wing above to edit its roof plan.</p>
        )
      ) : (
        <>
          <p className="small-note">
            {wallId
              ? 'This wall inherits wing settings.'
              : partId
                ? 'This wing inherits building defaults.'
                : 'Building defaults apply to all wings and walls unless overridden.'}{' '}
            Select surfaces on the 3D model or use the lists above.
          </p>
          {(['wallColour', 'roofColour', 'windowColour', 'trimColour'] as const)
            .filter((key) => !wallId || key !== 'roofColour')
            .map((key) => (
              <div className="surface-field" key={key}>
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
                Custom roof plans override standard forms. Complex outlines use
                a flat cap until a custom roof is applied.
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
                    <option value="unknown">Unknown · illustrative 6 m</option>
                  </select>
                </label>
                {reset('heightMode')}
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
            <label className="field-label">
              Appearance source / date
              <textarea
                maxLength={2000}
                value={resolved.provenance || ''}
                onChange={(e) => change('provenance', e.target.value, true)}
              />
            </label>
            {reset('provenance')}
          </div>
        </>
      )}
    </section>
  );
}
