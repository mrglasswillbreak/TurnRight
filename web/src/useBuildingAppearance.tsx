import { Check as ActionCheck } from 'lucide-react';
import { ModelButton } from './ModelButton';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  standardRoofSupported,
  generatedRoofPitch,
} from './building-surfaces';
import type { EditorWorkspace } from './editor-workspace';
import { ModelField } from './ModelField';
import { fitRoofHeight, inheritsBuildingHeight } from './model-height';
import { buildingDisplay } from './map-display';
import type { ValidationIssue } from './validation';
import { BuildingMode } from './building-appearance-workspace';

export type BuildingAppearanceProps = {
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
};
export function useBuildingAppearance({
  edit,
  data,
  mode,
  onMode: _onMode,
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
}: BuildingAppearanceProps) {
  const workspaceTrigger = useRef<HTMLElement | null>(null);

  const [photoModelOpen, setPhotoModelOpen] = useState(false);

  const [adjustRoofHeight, setAdjustRoofHeight] = useState(true);

  const [pendingHeightMode, setPendingHeightMode] = useState<string>();

  const heightMode =
    workspace?.modelInputs[edit.id]?.['building:heightMode'] ||
    pendingHeightMode ||
    String(edit.properties.heightMode || 'metres');

  const [workspaceField, setWorkspaceField] = useState<string>();

  const [workspaceMode, setWorkspaceMode] = useState<
    'details' | 'review' | 'mesh' | BuildingMode
  >('details');

  useEffect(() => {
    if (!embedded && reviewRequest) {
      workspaceTrigger.current = document.activeElement as HTMLElement;
      setWorkspaceMode(
        reviewRequest.field === 'modelDocument'
          ? 'mesh'
          : reviewRequest.repair === 'review-model'
            ? 'review'
            : /roof/i.test(reviewRequest.field || '')
              ? 'roof'
              : 'appearance',
      );
      setWorkspaceField(
        reviewRequest.repair === 'review-model'
          ? undefined
          : reviewRequest.field,
      );
      if (reviewRequest.repair !== 'review-model')
        onSelection({ buildingId: edit.id });
      setPhotoModelOpen(true);
      onReviewOpened?.();
    }
  }, [embedded, reviewRequest, onReviewOpened, onSelection, edit.id]);

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
      <ModelButton
        variant="outline"
        icon={<ActionCheck />}
        type="button"
        className="inherit-value"
        onClick={() => change(key, undefined)}
      >
        Use inherited value<span className="sr-only"> for {key}</span>
      </ModelButton>
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
  return {
    embedded,
    workspaceTrigger,
    setWorkspaceMode,
    setPhotoModelOpen,
    topology,
    edit,
    appearance,
    photoModelOpen,
    data,
    selection,
    onSelection,
    onEdit,
    workspace,
    onHistory,
    workspaceMode,
    workspaceField,
    locked,
    partId,
    choose,
    part,
    mode,
    wallId,
    brokenTopology,
    orphans,
    index,
    wingHeight,
    own,
    visual,
    roofDraft,
    onRoofDraft,
    onApplyRoof,
    heightMode,
    changeHeight,
    onHeightEdit,
    setPendingHeightMode,
    adjustRoofHeight,
    setAdjustRoofHeight,
    resolved,
    change,
    reset,
    numeric,
    canPitch,
    pitch,
  };
}
export type BuildingAppearanceState = ReturnType<typeof useBuildingAppearance>;
