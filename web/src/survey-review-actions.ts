import type { Map as MapInstance } from 'maplibre-gl';
import type { CampusData, Position } from './types';
import type { SurveySession, SurveyLine, reviewCommand } from './survey-model';
import { snapTarget } from './editor-features';
import { distance } from './geo';
export type Selection = { line: string; vertex: number } | { marker: string };
export function surveyReviewActions({
  session,
  selection,
  connect,
  connectionData,
  center,
  map,
  command,
}: {
  session?: SurveySession;
  selection: Selection | null;
  connect: boolean;
  connectionData: CampusData;
  center: Position;
  map: MapInstance;
  command: (work: Parameters<typeof reviewCommand>[1]) => void;
}) {
  const selectedLine =
    selection && 'line' in selection
      ? session?.review.find((l) => l.id === selection.line)
      : undefined;

  const vertexIndex = selection && 'line' in selection ? selection.vertex : 0;

  const selectedMarker =
    selection && 'marker' in selection
      ? session?.markers.find((m) => m.id === selection.marker)
      : undefined;

  const snap = connect
    ? snapTarget(
        connectionData,
        center,
        (p) => map.project(p),
        session?.replacement?.edit.id,
      )
    : undefined;

  const reviewSnap = connect
    ? session?.review
        .flatMap((l) => l.vertices)
        .find((v) => {
          if (selectedLine?.vertices[vertexIndex]?.id === v.id) return false;
          const p = map.project(v.coordinates),
            q = map.project(center);
          return (
            distance(v.coordinates, center) <= 5 &&
            Math.hypot(p.x - q.x, p.y - q.y) <= 12
          );
        })
    : undefined;

  const placeHere = () =>
    command((state) => {
      const target =
        snap?.target ||
        (reviewSnap
          ? {
              type: 'node' as const,
              nodeId: reviewSnap.id,
              coordinates: reviewSnap.coordinates,
            }
          : undefined);
      if (connect && !target)
        throw new Error(
          'Move the crosshair onto a highlighted path or vertex (within 5 metres and 12 pixels).',
        );
      const coordinates = target?.coordinates || center;
      if (selectedMarker) {
        const m = state.markers.find((m) => m.id === selectedMarker.id)!;
        m.coordinates = coordinates;
        m.connection = target;
      }
      if (selectedLine) {
        const l = state.review.find((l) => l.id === selectedLine.id)!,
          v = l.vertices[vertexIndex];
        if (
          v.pinned &&
          session?.replacement?.anchors.some((a) => a.id === v.id)
        )
          throw new Error(
            'This junction is fixed. Move shared junctions with the editor’s separate command.',
          );
        v.coordinates = coordinates;
        v.connection = target;
        l.reviewed = false;
      }
    });

  const editLine = (fn: (line: SurveyLine) => void) =>
    command((s) => {
      const l = s.review.find((l) => l.id === selectedLine?.id);
      if (l) {
        fn(l);
        l.reviewed = false;
      }
    });

  return {
    selectedLine,
    vertexIndex,
    selectedMarker,
    snap,
    reviewSnap,
    placeHere,
    editLine,
  };
}
