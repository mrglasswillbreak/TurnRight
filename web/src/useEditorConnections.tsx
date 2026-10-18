import { useRef } from 'react';
import { type SnapTarget } from './editor-features';
import { distance, projectSegment } from './geo';
import type { Position } from './types';

import type { EditorDrawingBindings } from './useEditorDrawing';
import type { EditorRepairBindings } from './useEditorRepair';
import type { EditorSelectionBindings } from './useEditorSelection';
import type { EditorSessionStateBindings } from './useEditorSessionState';
type Inputs = Pick<
  EditorSessionStateBindings,
  'setMessage' | 'controller' | 'selectedRef' | 'validation'
> &
  Pick<EditorSelectionBindings, 'selectId' | 'commit'> &
  Pick<EditorRepairBindings, 'stageRepair'> &
  Pick<EditorDrawingBindings, 'create' | 'updateGeometry' | 'remove'>;
export function useEditorConnections({
  setMessage,
  controller,
  selectedRef,
  validation,
  selectId,
  commit,
  stageRepair,
  create,
  updateGeometry,
  remove,
}: Inputs) {
  const pick = (mode: 'start' | 'end' | 'join' | 'entrance-link' | 'block') => {
    controller.current?.pick(mode);
    setMessage(
      mode === 'join'
        ? 'Click the crossing where this path should join another path.'
        : mode === 'block'
          ? 'Click a path segment away from a junction to block it.'
          : 'Click a highlighted path or junction to make the connection.',
    );
  };
  const connect = (snap: SnapTarget, mode: string) => {
    const current = selectedRef.current;
    if (!current || !snap.target) return;
    const edit = structuredClone(current);
    if (mode === 'block') {
      if (snap.target.type !== 'segment') {
        setMessage(
          'Click the middle of a segment to choose which path to block.',
        );
        return;
      }
      const target = snap.target;
      const ids = validation.data.graph.edges
        .filter(
          (e) =>
            e.sourceId === target.sourceId &&
            ((e.from === target.from && e.to === target.to) ||
              (e.to === target.from && e.from === target.to)),
        )
        .map((e) => e.id);
      edit.properties.edgeIds = [
        ...new Set([
          ...(Array.isArray(edit.properties.edgeIds)
            ? (edit.properties.edgeIds as string[])
            : []),
          ...ids,
        ]),
      ];
    } else if (edit.kind === 'entrance' && edit.geometry.type === 'Point') {
      if (
        distance(edit.geometry.coordinates as Position, snap.coordinates) > 5
      ) {
        setMessage(
          'Draw a connecting path to cover the gap from this entrance.',
        );
        return;
      }
      edit.geometry.coordinates = snap.coordinates;
      edit.properties.connection = snap.target;
      delete edit.properties.connectTo;
    } else if (edit.kind === 'path' && edit.geometry.type === 'LineString') {
      const points = edit.geometry.coordinates as Position[];
      let index = mode === 'start' ? 0 : points.length - 1;
      if (mode === 'join') {
        const candidates = points
          .slice(1)
          .map((p, i) => ({
            i: i + 1,
            projection: projectSegment(snap.coordinates, points[i], p),
          }))
          .sort((a, b) => a.projection.distance - b.projection.distance);
        if (!candidates[0] || candidates[0].projection.distance > 0.2) {
          setMessage(
            'Choose a crossing on the selected path. Move an endpoint to connect across a gap.',
          );
          return;
        }
        const existing = points.findIndex(
          (p) => distance(p, snap.coordinates) < 0.2,
        );
        index = existing >= 0 ? existing : candidates[0].i;
        if (existing < 0) {
          points.splice(index, 0, snap.coordinates);
          edit.properties.vertexIds!.splice(
            index,
            0,
            `${edit.id}:vertex:${crypto.randomUUID()}`,
          );
        }
      }
      if (distance(points[index], snap.coordinates) > 5) {
        setMessage(
          'Move the endpoint within 5 m of the intended connection first.',
        );
        return;
      }
      points[index] = snap.coordinates;
      const vertexId = edit.properties.vertexIds![index];
      edit.properties.connections = [
        ...(edit.properties.connections || []).filter(
          (c) => c.vertexId !== vertexId,
        ),
        { vertexId, target: snap.target },
      ];
      delete edit.properties.connectStart;
      delete edit.properties.connectEnd;
    }
    stageRepair([edit], 'Review proposed connection');
  };
  const disconnect = (vertexId?: string) => {
    const current = selectedRef.current;
    if (!current) return;
    const edit = structuredClone(current);
    if (edit.kind === 'entrance') {
      delete edit.properties.connection;
      delete edit.properties.connectTo;
    } else {
      // Otherwise the topology pass would immediately recreate the removed join.
      edit.properties.autoConnectCrossings = false;
      edit.properties.connections = edit.properties.connections?.filter(
        (c) => c.vertexId !== vertexId,
      );
      edit.properties.vertexIds = edit.properties.vertexIds?.map((id) =>
        id === vertexId ? `${edit.id}:vertex:${crypto.randomUUID()}` : id,
      );
      delete edit.properties.connectStart;
      delete edit.properties.connectEnd;
    }
    commit([edit]);
  };
  const live = useRef({
    selectId,
    create,
    updateGeometry,
    remove,
    connect,
    validation,
  });
  live.current = {
    selectId,
    create,
    updateGeometry,
    remove,
    connect,
    validation,
  };
  return { pick, disconnect, live };
}
export type EditorConnectionsBindings = ReturnType<typeof useEditorConnections>;
