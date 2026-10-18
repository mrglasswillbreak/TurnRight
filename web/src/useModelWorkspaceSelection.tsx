import { useEffect, useMemo } from 'react';
import { facadeErrors, facadeWalls } from './building-facades';
import { validateEdit } from './editor-model';
import {
  editableFacade,
  emptyAuthoring,
  modelFeature,
  wallMetrics,
} from './model-authoring';
import {
  detailInstanceFlags,
  detailInstanceId,
  expandDetailInstances,
} from './model-instances';
import { reviewModelWalls } from './model-review';
import { emptyElements } from './model-workspace-shared';
import type { FacadeElement } from './visual-types';

import type { ModelWorkspaceStateBindings } from './useModelWorkspaceState';
type Inputs = Pick<
  ModelWorkspaceStateBindings,
  | 'edit'
  | 'data'
  | 'onSelection'
  | 'workspace'
  | 'setTouchTool'
  | 'initial'
  | 'local'
  | 'mode'
  | 'wallId'
  | 'setWallId'
  | 'selectionKeys'
  | 'setSelected'
  | 'setInstance'
  | 'tab'
  | 'before'
  | 'setError'
  | 'meshPreview'
  | 'wholeRows'
  | 'setWholeRows'
  | 'setReviewResult'
  | 'hiddenItems'
  | 'lockedItems'
  | 'pending'
  | 'setPending'
  | 'pendingAuthoring'
  | 'setPendingAuthoring'
  | 'setPatternId'
  | 'targetBuilding'
  | 'setRoofDraft'
  | 'photoId'
  | 'surfacePreview'
  | 'conversion'
  | 'setConversion'
>;
export function useModelWorkspaceSelection({
  edit,
  data,
  onSelection,
  workspace,
  setTouchTool,
  initial,
  local,
  mode,
  wallId,
  setWallId,
  selectionKeys,
  setSelected,
  setInstance,
  tab,
  before,
  setError,
  meshPreview,
  wholeRows,
  setWholeRows,
  setReviewResult,
  hiddenItems,
  lockedItems,
  pending,
  setPending,
  pendingAuthoring,
  setPendingAuthoring,
  setPatternId,
  targetBuilding,
  setRoofDraft,
  photoId,
  surfacePreview,
  conversion,
  setConversion,
}: Inputs) {
  const stored = workspace?.edits.find(
    (e) => e.kind === 'building' && e.id === edit.id,
  );
  const draft = stored && !stored.deleted ? stored : local;
  const feature = useMemo(() => modelFeature(draft), [draft]),
    original = useMemo(() => modelFeature(initial.current), [initial]);
  const walls = useMemo(() => facadeWalls(feature), [feature]);
  const activeWall =
    wallId && walls.some((w) => w.wallId === wallId)
      ? wallId
      : walls[0]?.wallId || '';
  const visual = data.visuals?.buildings.find((v) => v.id === edit.id);
  const metrics = useMemo(
    () => (activeWall ? wallMetrics(feature, activeWall, visual) : null),
    [feature, activeWall, visual],
  );
  const authoring =
    (pending?.wallId === activeWall && pendingAuthoring) ||
    draft.properties.modelAuthoring ||
    emptyAuthoring();
  const recorded = draft.properties.appearance?.facades?.[activeWall];
  const generatedFacades = useMemo(
    () =>
      Object.fromEntries(
        walls.flatMap((wall) => {
          if (feature.properties?.appearance?.facades?.[wall.wallId]) return [];
          try {
            return [
              [wall.wallId, editableFacade(feature, wall.wallId, visual)],
            ];
          } catch {
            return [];
          }
        }),
      ),
    [walls, feature, visual],
  );
  const facade =
    pending?.wallId === activeWall
      ? pending
      : recorded || conversion || generatedFacades[activeWall];
  const sourceElements = facade?.elements || emptyElements;
  const elements = useMemo(
    () => expandDetailInstances(sourceElements, wholeRows),
    [sourceElements, wholeRows],
  );
  // Keep identities through deletion/Undo without showing missing targets.
  const selected = useMemo(
    () => selectionKeys.filter((id) => elements.some((e) => e.id === id)),
    [selectionKeys, elements],
  );
  const locked = useMemo(
    () => detailInstanceFlags(sourceElements, lockedItems, true),
    [sourceElements, lockedItems],
  );
  const hidden = useMemo(
    () => detailInstanceFlags(sourceElements, hiddenItems),
    [sourceElements, hiddenItems],
  );
  const renderedFeature = useMemo(() => {
    if (before) return original;
    const previewFeature: ReturnType<typeof modelFeature> = {
      ...feature,
      properties: {
        ...feature.properties,
        ...(meshPreview ? { modelDocument: meshPreview } : {}),
        appearance: {
          ...feature.properties?.appearance,
          facades: {
            ...generatedFacades,
            ...feature.properties?.appearance?.facades,
            ...(pending?.wallId === activeWall
              ? { [activeWall]: pending }
              : {}),
          },
        },
      },
    };
    if (tab !== 'surface' || !surfacePreview) return previewFeature;
    if ('edit' in surfacePreview) return modelFeature(surfacePreview.edit);
    const next = structuredClone(previewFeature);
    next.properties ||= {};
    next.properties.appearance ||= {};
    if ('roof' in surfacePreview)
      (next.properties.appearance.roofs ||= {})[surfacePreview.roof.partId] =
        surfacePreview.roof.roof;
    else {
      const base =
        next.properties.appearance.facades?.[surfacePreview.wallId] ||
        editableFacade(feature, surfacePreview.wallId, visual);
      (next.properties.appearance.facades ||= {})[surfacePreview.wallId] = {
        ...base,
        elements: surfacePreview.elements,
      };
    }
    return next;
  }, [
    feature,
    original,
    before,
    tab,
    surfacePreview,
    visual,
    generatedFacades,
    pending,
    activeWall,
    meshPreview,
  ]);
  const active = elements.find((e) => e.id === selected[0]);
  const photos = useMemo(
    () => (data.photos || []).filter((p) => p.buildingId === edit.id),
    [data.photos, edit.id],
  );
  const photo = photos.find((p) => p.id === photoId) || photos[0];
  const buildings = useMemo(
    () =>
      data.map.features
        .filter((f) => f.properties?.kind === 'building')
        .map((f) => ({
          id: String(f.properties!.id),
          name: String(f.properties!.name || 'Unnamed building'),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data.map],
  );
  const targetEdit =
    targetBuilding === edit.id
      ? draft
      : workspace?.edits.find(
          (e) => e.id === targetBuilding && e.kind === 'building',
        ) ||
        (() => {
          const f = data.map.features.find(
            (f) =>
              f.properties?.id === targetBuilding &&
              f.properties.kind === 'building',
          );
          return f
            ? {
                id: targetBuilding,
                kind: 'building' as const,
                geometry: f.geometry,
                properties: f.properties!,
              }
            : undefined;
        })();
  const targetWalls = targetEdit ? facadeWalls(modelFeature(targetEdit)) : [];
  const state =
    workspace?.status === 'Saved'
      ? 'Saved to map draft'
      : workspace?.status || 'Saved locally';
  const unsaved =
    !!pending ||
    !!workspace?.roofDraft ||
    Object.keys(workspace?.modelInputs[edit.id] || {}).length > 0;
  const reviewReady = useMemo(
    () => (mode === 'review' ? reviewModelWalls(draft, data) : null),
    [mode, draft, data],
  );
  useEffect(() => {
    if (reviewReady?.reviewed.length) setReviewResult('');
  }, [reviewReady, setReviewResult]);
  const discardInput = () => {
    setPending(null);
    setRoofDraft(null);
    workspace?.draftRoof(null);
    for (const key of Object.keys(workspace?.modelInputs[edit.id] || {}))
      workspace?.recoverModelInput(edit.id, key);
    setError('Unfinished input discarded; saved draft changes remain.');
  };
  const publishErrors = useMemo(
    () => [
      ...new Set([
        ...validateEdit(draft),
        ...facadeErrors(feature, data.photos, true),
      ]),
    ],
    [draft, feature, data.photos],
  );
  const label = (e: FacadeElement) =>
    authoring.names[e.id] ||
    `${e.kind[0].toUpperCase() + e.kind.slice(1)}${e.count > 1 ? ` ×${e.count}` : ''}`;
  const choose = (id: string, elementId?: string, at = 0) => {
    const records =
      (id === activeWall
        ? sourceElements
        : feature.properties?.appearance?.facades?.[id]?.elements ||
          generatedFacades[id]?.elements) || [];
    const record = records.find((e: FacadeElement) => e.id === elementId);
    const target =
      record && record.count > 1 ? detailInstanceId(record.id, at) : elementId;
    setWholeRows([]);
    setTouchTool('select');
    setWallId(id);
    setSelected(target ? [target] : []);
    setInstance(at);
    setPatternId('');
    if (id !== activeWall) {
      setPending(null);
      setPendingAuthoring(null);
    }
    setConversion(null);
    setError('');
    const w = walls.find((w) => w.wallId === id);
    if (w)
      onSelection({
        buildingId: edit.id,
        partId: w.partId,
        wallId: id,
        elementId,
        instanceIndex: at,
      });
  };
  useEffect(() => {
    const saved = workspace?.modelInputs[edit.id]?.[`pending:${activeWall}`];
    if (saved)
      try {
        const recovered = JSON.parse(saved);
        setPending(recovered.facade || recovered);
        setPendingAuthoring(recovered.authoring || null);
      } catch {
        setError(
          'An unfinished wall could not be restored. Discard its recovery entry to continue.',
        );
      }
  }, [
    activeWall,
    edit.id,
    workspace?.modelInputs,
    setError,
    setPendingAuthoring,
    setPending,
  ]);
  return {
    draft,
    feature,
    original,
    walls,
    activeWall,
    visual,
    metrics,
    authoring,
    recorded,
    generatedFacades,
    facade,
    sourceElements,
    elements,
    selected,
    locked,
    hidden,
    renderedFeature,
    active,
    photos,
    photo,
    buildings,
    targetEdit,
    targetWalls,
    state,
    unsaved,
    reviewReady,
    discardInput,
    publishErrors,
    label,
    choose,
  };
}
export type ModelWorkspaceSelectionBindings = ReturnType<
  typeof useModelWorkspaceSelection
>;
