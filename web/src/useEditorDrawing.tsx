import type { Geometry } from 'geojson';
import { featureEdit, geometryEdits } from './editor-features';
import { distance } from './geo';
import { buildingPlace } from './map-display';
import type { MapEdit, Position } from './types';

import type { EditorRepairBindings } from './useEditorRepair';
import type { EditorSelectionBindings } from './useEditorSelection';
import type { EditorSessionStateBindings } from './useEditorSessionState';
type Inputs = Pick<
  EditorSessionStateBindings,
  | 'workspace'
  | 'setTab'
  | 'explorer'
  | 'setExplorer'
  | 'setLayerOperation'
  | 'cutterRequest'
  | 'setSelected'
  | 'tool'
  | 'setTool'
  | 'setPreview'
  | 'setMessage'
  | 'setHint'
  | 'showRoutes'
  | 'setShowRoutes'
  | 'controller'
  | 'selectedRef'
  | 'drawingPanels'
  | 'restoreDrawingPanels'
  | 'repairFocus'
  | 'repairPreview'
  | 'validation'
> &
  Pick<EditorSelectionBindings, 'commit'> &
  Pick<EditorRepairBindings, 'stageRepair'>;
export function useEditorDrawing({
  workspace,
  setTab,
  explorer,
  setExplorer,
  setLayerOperation,
  cutterRequest,
  setSelected,
  tool,
  setTool,
  setPreview,
  setMessage,
  setHint,
  showRoutes,
  setShowRoutes,
  controller,
  selectedRef,
  drawingPanels,
  restoreDrawingPanels,
  repairFocus,
  repairPreview,
  validation,
  commit,
  stageRepair,
}: Inputs) {
  const begin = (
    kind: MapEdit['kind'],
    props: MapEdit['properties'] = {},
    seed?: Position[],
  ) => {
    workspace.endHistoryGroup();
    if (repairPreview) {
      setMessage(
        'Apply or cancel the repair review before starting a drawing.',
      );
      return;
    }
    if (tool || workspace.unfinished || workspace.roofDraft) {
      setMessage('Finish or cancel the current drawing first.');
      return;
    }
    if (!controller.current) return;
    drawingPanels.current = { explorer, routes: showRoutes };
    setExplorer(false);
    setShowRoutes(false);
    setHint('');
    setSelected(null);
    selectedRef.current = null;
    setTool(kind);
    setPreview(false);
    setTab('map');
    const name =
      kind === 'path'
        ? 'Campus path'
        : kind === 'entrance'
          ? 'Entrance'
          : kind === 'building'
            ? 'Building'
            : kind === 'closure'
              ? 'Temporary closure'
              : kind === 'barrier'
                ? 'Barrier'
                : 'Campus place';
    controller.current?.begin(
      kind,
      {
        name,
        ...(['land', 'overlay'].includes(kind)
          ? {}
          : { access: 'yes', category: 'other' }),
        ...props,
      },
      seed,
    );
    setMessage(
      kind === 'entrance'
        ? 'Click the ground edge of the building to place its entrance.'
        : kind === 'path'
          ? 'Click to add path points. Click a highlighted path to connect. Enter to finish.'
          : kind === 'building'
            ? 'Click around the ground footprint. Enter to finish the outline.'
            : `Click the map to add a ${kind}.`,
    );
  };
  const addEntrance = () => {
    const edit = selectedRef.current;
    if (!edit) return;
    const building = validation.data.map.features.find(
      (f) =>
        f.properties?.kind === 'building' &&
        (edit.kind === 'building'
          ? f.properties.id === edit.id
          : buildingPlace(validation.data, f)?.id === edit.id),
    );
    const place =
      edit.kind === 'place'
        ? validation.data.places.find((p) => p.id === edit.id)
        : building
          ? buildingPlace(validation.data, building)
          : undefined;
    const buildingId = building?.properties?.id;
    begin('entrance', {
      name: `${place?.name || edit.properties.name || 'Building'} entrance`,
      placeId: place?.id || '',
      buildingId,
    });
  };
  const approach = () => {
    const edit = selectedRef.current;
    if (!edit || edit.kind !== 'entrance' || edit.geometry.type !== 'Point')
      return;
    begin(
      'path',
      { name: `${edit.properties.name} approach`, entranceId: edit.id },
      [edit.geometry.coordinates as Position],
    );
  };
  const create = (edit: MapEdit) => {
    if (
      edit.properties.temporaryGeometry &&
      (cutterRequest.current || edit.properties.geometryRequest)
    ) {
      setLayerOperation({
        ...((cutterRequest.current ||
          edit.properties
            .geometryRequest) as import('./layer-geometry-engine').GeometryRequest),
        cutter: edit.geometry,
      });
      cutterRequest.current = null;
      controller.current?.cancel();
      setTool(null);
      restoreDrawingPanels();
      return;
    }
    const batch = [edit];
    if (
      edit.kind === 'path' &&
      edit.geometry.type === 'LineString' &&
      typeof edit.properties.entranceId === 'string'
    ) {
      const entrance = featureEdit(
        validation.data,
        'entrance',
        edit.properties.entranceId,
        workspace.edits,
      );
      if (
        entrance?.geometry.type === 'Point' &&
        distance(
          entrance.geometry.coordinates as Position,
          edit.geometry.coordinates[0] as Position,
        ) < 0.2
      )
        batch.push({
          ...entrance,
          properties: {
            ...entrance.properties,
            connectTo: undefined,
            connection: {
              type: 'node',
              nodeId: edit.properties.vertexIds![0],
              coordinates: edit.geometry.coordinates[0] as Position,
            },
          },
        });
    }
    commit(batch, edit);
    setMessage('Added to your draft. Select it to adjust the details.');
  };
  const updateGeometry = (geometry: Geometry) => {
    const current = selectedRef.current;
    if (!current) return;
    const batch = geometryEdits(
      current,
      geometry,
      validation.data,
      workspace.edits,
    );
    for (const edit of batch)
      if (edit.properties.derivedSurface)
        edit.properties.derivedSurface = {
          ...edit.properties.derivedSurface,
          manual: true,
        };
    if (repairFocus) stageRepair(batch);
    else
      commit(
        batch,
        batch.find((e) => e.id === current.id && e.kind === current.kind)!,
      );
  };
  const remove = () => {
    const current = selectedRef.current;
    if (current) {
      workspace.commit([{ ...current, deleted: true }]);
      setSelected(null);
      selectedRef.current = null;
      controller.current?.select(null);
      setMessage(`${current.properties.name} removed. Undo to restore it.`);
    }
  };
  return { begin, addEntrance, approach, create, updateGeometry, remove };
}
export type EditorDrawingBindings = ReturnType<typeof useEditorDrawing>;
