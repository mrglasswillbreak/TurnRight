import {
  campusLayers,
  catalogueErrors,
  editableLayer,
  layerFeatures,
  layerKey,
  layerMembership,
} from './campus-layers';
import { editorCamera } from './editor-camera';
import { featureEdit } from './editor-features';
import { validateEdit } from './editor-model';
import { editKey } from './editor-workspace';
import type { MapEdit, Position } from './types';

import type { EditorSessionStateBindings } from './useEditorSessionState';
type Inputs = Pick<
  EditorSessionStateBindings,
  | 'workspace'
  | 'setTab'
  | 'setOverlap'
  | 'setSelected'
  | 'setTool'
  | 'setBuildingMode'
  | 'setBuildingSelection'
  | 'setPreview'
  | 'setMessage'
  | 'setError'
  | 'setRoutes'
  | 'mapRef'
  | 'controller'
  | 'selectedRef'
  | 'setFocusRequest'
  | 'selectionOverview'
  | 'restoreDrawingPanels'
  | 'setRepairFocus'
  | 'validation'
>;
export function useEditorSelection({
  workspace,
  setTab,
  setOverlap,
  setSelected,
  setTool,
  setBuildingMode,
  setBuildingSelection,
  setPreview,
  setMessage,
  setError,
  setRoutes,
  mapRef,
  controller,
  selectedRef,
  setFocusRequest,
  selectionOverview,
  restoreDrawingPanels,
  setRepairFocus,
  validation,
}: Inputs) {
  const select = (edit: MapEdit, refocus = false, anchor?: Position) => {
    const definitions = campusLayers(validation.data).items,
      member = layerMembership(validation.data, definitions).get(
        layerKey(edit.kind, edit.id),
      ),
      layer = definitions.find((l) => l.id === member);
    if (layer && !editableLayer(layer, definitions)) {
      setMessage('Show and unlock this layer before editing its features.');
      return;
    }
    setOverlap(null);
    workspace.endHistoryGroup();
    if (workspace.roofDraft && workspace.roofDraft.buildingId !== edit.id) {
      setMessage(
        'Apply or cancel the roof plan before selecting another feature.',
      );
      return;
    }
    if (workspace.unfinished) {
      setMessage(
        'Finish or cancel the current drawing before selecting another feature.',
      );
      return;
    }
    if (
      mapRef.current &&
      (refocus ||
        !selectedRef.current ||
        editKey(selectedRef.current) !== editKey(edit))
    ) {
      selectionOverview.current ??= editorCamera(mapRef.current);
      setFocusRequest({ edit, anchor });
    }
    setRepairFocus(null);
    setSelected(edit);
    selectedRef.current = edit;
    setTool(null);
    setPreview(false);
    setTab('map');
    setBuildingMode(workspace.roofDraft ? 'roof' : 'appearance');
    setBuildingSelection(
      edit.kind === 'building' ? { buildingId: edit.id } : undefined,
    );
    controller.current?.select(edit, edit.kind !== 'building');
  };
  const selectId = (
    kind: MapEdit['kind'],
    id: string,
    refocus = false,
    anchor?: Position,
  ) => {
    const edit = featureEdit(validation.data, kind, id, workspace.edits);
    if (edit) select(edit, refocus, anchor);
  };
  const commit = (
    batch: MapEdit[],
    current: MapEdit | null = batch.find(
      (e) => !e.deleted && e.kind !== 'layer',
    ) || null,
  ) => {
    workspace.commit(batch, null);
    setSelected(current);
    selectedRef.current = current;
    setTool(null);
    restoreDrawingPanels();
    setRoutes([]);
    controller.current?.select(current);
  };
  const commitLayers = (batch: MapEdit[]) => {
    const errors = batch.flatMap((e) => validateEdit(e));
    const definitions = new Map(
      campusLayers(validation.data).items.map((l) => [l.id, l]),
    );
    for (const e of batch)
      if (e.kind === 'layer')
        definitions.set(
          e.id,
          e.properties
            .layerDefinition as import('./campus-layer-types').CampusLayer,
        );
    errors.push(...catalogueErrors([...definitions.values()]));
    if (errors.length) {
      setError(errors.join(' '));
      return;
    }
    workspace.commit(batch, null);
    setMessage(
      `${batch.length} layer or feature changes added to the draft. Undo restores the whole operation.`,
    );
  };
  const zoomLayers = (keys: string[]) => {
    const points: Position[] = [];
    const collect = (v: unknown) => {
      if (!Array.isArray(v)) return;
      if (typeof v[0] === 'number') points.push(v as Position);
      else v.forEach(collect);
    };
    layerFeatures(validation.data)
      .filter((f) => keys.includes(f.key))
      .forEach((f) => {
        if ('coordinates' in f.geometry) collect(f.geometry.coordinates);
      });
    if (points.length)
      mapRef.current?.fitBounds(
        [
          [
            Math.min(...points.map((p) => p[0])),
            Math.min(...points.map((p) => p[1])),
          ],
          [
            Math.max(...points.map((p) => p[0])),
            Math.max(...points.map((p) => p[1])),
          ],
        ],
        { padding: 100, maxZoom: 19 },
      );
  };
  return { select, selectId, commit, commitLayers, zoomLayers };
}
export type EditorSelectionBindings = ReturnType<typeof useEditorSelection>;
