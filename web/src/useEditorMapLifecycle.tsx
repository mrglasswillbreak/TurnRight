import type { Feature } from 'geojson';
import type { Map as MapInstance } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { canonicalBuildingId } from './arrival';
import {
  campusLayers,
  editableLayer,
  layerKey,
  layerMembership,
} from './campus-layers';
import { featureEdit } from './editor-features';
import { consumeEditorBuilding, editorHandoffStorage } from './editor-link';
import { EditorMap } from './editor-map';
import { editKey } from './editor-workspace';
import { sourceGeometry } from './source-comparison';

import type { EditorConnectionsBindings } from './useEditorConnections';
import type { EditorDrawingBindings } from './useEditorDrawing';
import type { EditorSessionStateBindings } from './useEditorSessionState';
import type { EditorSourcesBindings } from './useEditorSources';
type Inputs = Pick<
  EditorSessionStateBindings,
  | 'data'
  | 'workspace'
  | 'drafts'
  | 'reviewOverlay'
  | 'survey'
  | 'surveying'
  | 'tab'
  | 'setExplorer'
  | 'layerView'
  | 'setOverlap'
  | 'setSelected'
  | 'tool'
  | 'setTool'
  | 'preview'
  | 'ready'
  | 'setReady'
  | 'requestedBuilding'
  | 'setHandoffNotice'
  | 'setMessage'
  | 'setHint'
  | 'setRoutes'
  | 'review'
  | 'mapRef'
  | 'controller'
  | 'selectedRef'
  | 'restoreDrawingPanels'
  | 'base'
  | 'validation'
> &
  Pick<EditorSourcesBindings, 'invalid'> &
  Pick<EditorDrawingBindings, 'begin' | 'remove'> &
  Pick<EditorConnectionsBindings, 'live'>;
export function useEditorMapLifecycle({
  data,
  workspace,
  drafts,
  reviewOverlay,
  survey,
  surveying,
  tab,
  setExplorer,
  layerView,
  setOverlap,
  setSelected,
  tool,
  setTool,
  preview,
  ready,
  setReady,
  requestedBuilding,
  setHandoffNotice,
  setMessage,
  setHint,
  setRoutes,
  review,
  mapRef,
  controller,
  selectedRef,
  restoreDrawingPanels,
  base,
  validation,
  invalid,
  begin,
  remove,
  live,
}: Inputs) {
  const mapReady = (map: MapInstance) => {
    mapRef.current = map;
    map.setMaxPitch(60);
    const instance = new EditorMap(map, live.current.validation.data, {
      select: (kind, id, anchor) =>
        live.current.selectId(kind, id, false, anchor),
      create: (edit) => live.current.create(edit),
      geometry: (geometry) => live.current.updateGeometry(geometry),
      remove: () => live.current.remove(),
      draft: (drawing) => workspace.draft(drawing),
      connect: (target, mode) => live.current.connect(target, mode),
      hint: setHint,
      choose: (features, anchor) => setOverlap({ features, anchor }),
    });
    controller.current = instance;
    setReady((r) => r + 1);
    return () => {
      instance.dispose();
      if (controller.current === instance) controller.current = null;
      mapRef.current = null;
    };
  };
  useEffect(() => {
    const requested = requestedBuilding.current;
    if (!requested || !ready) return;
    const id = canonicalBuildingId(validation.data, requested);
    if (
      workspace.unfinished ||
      (workspace.roofDraft && workspace.roofDraft.buildingId !== id)
    ) {
      setHandoffNotice(
        'Finish or discard the recovered drawing or roof before opening the building selected on the public map.',
      );
      return;
    }
    requestedBuilding.current = undefined;
    history.replaceState(
      history.state,
      '',
      consumeEditorBuilding(location.href, editorHandoffStorage()),
    );
    const target = featureEdit(
      validation.data,
      'building',
      id,
      workspace.edits,
    );
    if (!target || target.deleted) {
      setHandoffNotice(
        'The building selected on the public map is unavailable in this workspace. It may have been removed or replaced.',
      );
      return;
    }
    setHandoffNotice('');
    live.current.selectId('building', id, true);
    setExplorer(false);
  }, [
    ready,
    validation.data,
    workspace,
    workspace.unfinished,
    workspace.roofDraft,
    setExplorer,
    requestedBuilding,
    live,
    setHandoffNotice,
  ]);
  useEffect(() => {
    const definitions = campusLayers(validation.data).items;
    const current = selectedRef.current;
    if (current) {
      const member = layerMembership(validation.data, definitions).get(
        layerKey(current.kind, current.id),
      );
      const layer = definitions.find((l) => l.id === member);
      if (layer && !editableLayer(layer, definitions)) {
        setSelected(null);
        selectedRef.current = null;
        controller.current?.select(null);
      }
    }
    controller.current?.update(
      validation.data,
      drafts,
      data,
      invalid,
      preview || survey || tab === 'changes',
      layerView,
    );
  }, [
    validation,
    drafts,
    data,
    invalid,
    preview,
    ready,
    survey,
    layerView,
    tab,
    controller,
    setSelected,
    selectedRef,
  ]);
  useEffect(() => {
    const features: Feature[] = [];
    for (const [side, color] of [
      [review?.before, '#d45555'],
      [review?.after, '#26a07c'],
    ] as const) {
      const geometry = sourceGeometry(side);
      if (geometry)
        features.push({ type: 'Feature', properties: { color }, geometry });
    }
    controller.current?.review(
      reviewOverlay.length ? reviewOverlay : tab === 'changes' ? features : [],
    );
  }, [review, ready, tab, reviewOverlay, controller]);
  const undo = (redo = false) => {
    if (tool) {
      controller.current?.cancel();
      setTool(null);
      restoreDrawingPanels();
    }
    if (workspace.roofDraft) {
      setMessage('Apply or cancel the roof plan before undoing other edits.');
      return;
    }
    if (redo) workspace.redo();
    else workspace.undo();
    const previous = selectedRef.current;
    const stored =
      previous && workspace.edits.find((e) => editKey(e) === editKey(previous));
    const next =
      previous &&
      (!stored || (stored.deleted && stored.properties.revertToSource))
        ? featureEdit(base, previous.kind, previous.id, [])
        : stored;
    setSelected(next && !next.deleted ? next : null);
    selectedRef.current = next && !next.deleted ? next : null;
    controller.current?.select(selectedRef.current);
    setRoutes([]);
  };
  const cancel = () => {
    controller.current?.cancel();
    setTool(null);
    restoreDrawingPanels();
    setSelected(null);
    setHint('');
    setMessage('Drawing cancelled. Select a feature or choose a tool.');
  };
  const keyboard = useRef({ begin, undo, cancel, remove });
  keyboard.current = { begin, undo, cancel, remove };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (surveying.current) return;
      // Modal workspaces own Escape, history and tool shortcuts while open.
      // The window capture listener must not cancel the selected map feature.
      if (
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], .process-monitor [aria-expanded="true"]',
        )
      )
        return;
      if (
        (event.target as HTMLElement)?.closest(
          'input, textarea, select, [contenteditable=true]',
        )
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.stopImmediatePropagation();
        keyboard.current.undo(event.shiftKey);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        keyboard.current.cancel();
      } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const kind = (
          { p: 'path', e: 'entrance', b: 'building', m: 'place' } as const
        )[event.key.toLowerCase() as 'p'];
        if (kind) {
          event.preventDefault();
          keyboard.current.begin(kind);
        }
      }
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, [surveying]);
  return { mapReady, undo, cancel };
}
export type EditorMapLifecycleBindings = ReturnType<
  typeof useEditorMapLifecycle
>;
