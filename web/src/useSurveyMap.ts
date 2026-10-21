import { useEffect } from 'react';
import type { GeoJSONSource, MapMouseEvent } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { featureEdit } from './editor-features';
import { distance } from './geo';
import type { Position } from './types';
import type { SurveySessionState, Selection } from './useSurveySession';

export function useSurveyMap({
  map,
  data,
  setCenter,
  crosshair,
  setFollowing,
  live,
  screen,
  setPath,
  edits,
  setBoundaries,
  recording,
  marker,
  setSelection,
  setCutStart,
  selection,
  path,
  boundaries,
  fix,
  connectCenter,
  nodes,
  version,
}: Pick<
  SurveySessionState,
  | 'map'
  | 'data'
  | 'setCenter'
  | 'crosshair'
  | 'setFollowing'
  | 'live'
  | 'screen'
  | 'setPath'
  | 'edits'
  | 'setBoundaries'
  | 'recording'
  | 'marker'
  | 'setSelection'
  | 'setCutStart'
  | 'selection'
  | 'path'
  | 'boundaries'
  | 'fix'
  | 'connectCenter'
  | 'nodes'
  | 'version'
>) {
  useEffect(() => {
    const empty: FeatureCollection = {
      type: 'FeatureCollection',
      features: [],
    };
    map.addSource('survey-overlay', { type: 'geojson', data: empty });
    map.addLayer({
      id: 'survey-lines',
      source: 'survey-overlay',
      type: 'line',
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['case', ['get', 'raw'], 6, 4],
        'line-opacity': ['case', ['get', 'raw'], 0.35, 1],
      },
    });
    map.addLayer({
      id: 'survey-points',
      source: 'survey-overlay',
      type: 'circle',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['case', ['get', 'selected'], 9, 5],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
      },
    });
    const move = () => setCenter(crosshair());
    const pan = () => setFollowing(false);
    const click = (event: MapMouseEvent) => {
      const state = live.current;
      if (state.screen === 'replace') {
        const features = map.queryRenderedFeatures(event.point, {
          layers: ['roads'].filter((id) => !!map.getLayer(id)),
        });
        const f = features.find((f) => f.properties?.kind === 'path');
        if (f) {
          setPath(
            featureEdit(data, 'path', String(f.properties.id), edits) || null,
          );
          setBoundaries([]);
        }
        return;
      }
      if (state.recording?.session.state !== 'review') return;
      let best = 24,
        hit: Selection | null = null;
      for (const line of state.recording.session.review)
        line.vertices.forEach((v, i) => {
          const p = map.project(v.coordinates),
            d = Math.hypot(p.x - event.point.x, p.y - event.point.y);
          if (d < best) {
            best = d;
            hit = { line: line.id, vertex: i };
          }
        });
      for (const m of state.recording.session.markers) {
        const p = map.project(m.coordinates),
          d = Math.hypot(p.x - event.point.x, p.y - event.point.y);
        if (d < best) {
          best = d;
          hit = { marker: m.id };
        }
      }
      if (hit) {
        setSelection(hit);
        setCutStart(null);
      }
    };
    map.on('move', move);
    map.on('dragstart', pan);
    map.on('click', click);
    move();
    return () => {
      map.off('move', move);
      map.off('dragstart', pan);
      map.off('click', click);
      for (const id of ['survey-points', 'survey-lines'])
        if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource('survey-overlay')) map.removeSource('survey-overlay');
    };
  }, [
    map,
    crosshair,
    data,
    edits,
    setCenter,
    setFollowing,
    live,
    setPath,
    setBoundaries,
    setSelection,
    setCutStart,
  ]);

  useEffect(() => {
    const features: Feature[] = [];
    const line = (points: Position[], color: string, raw = false) => {
      if (points.length > 1)
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: points },
          properties: { color, raw },
        });
    };
    const point = (p: Position, color: string, selected = false) =>
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: p },
        properties: { color, selected },
      });
    if (recording) {
      for (const segment of recording.session.segments)
        line(
          recording.samples
            .filter(
              (s) => s.segmentId === segment.id && s.status === 'accepted',
            )
            .map((s) => s.coordinates),
          '#727b88',
          true,
        );
      for (const l of recording.session.review) {
        line(
          l.vertices.map((v) => v.coordinates),
          l.reviewed ? '#168365' : '#ee9636',
        );
        l.vertices.forEach((v, i) =>
          point(
            v.coordinates,
            v.pinned ? '#9b55c6' : '#168365',
            !!selection &&
              'line' in selection &&
              selection.line === l.id &&
              selection.vertex === i,
          ),
        );
      }
      for (const m of recording.session.markers)
        point(
          m.coordinates,
          '#b85197',
          !!selection && 'marker' in selection && selection.marker === m.id,
        );
      if (recording.session.replacement?.edit.geometry.type === 'LineString')
        line(
          recording.session.replacement.edit.geometry.coordinates as Position[],
          '#d95865',
          true,
        );
      for (const anchor of recording.session.replacement?.anchors || [])
        point(anchor.coordinates, '#9b55c6');
    }
    if (screen === 'replace' && path?.geometry.type === 'LineString') {
      line(path.geometry.coordinates as Position[], '#d95865');
      path.geometry.coordinates.forEach((p, i) =>
        point(p as Position, '#9b55c6', boundaries.includes(i)),
      );
    }
    const accuracyMarker = marker || fix;
    if (
      accuracyMarker &&
      Number.isFinite(accuracyMarker.accuracy) &&
      accuracyMarker.accuracy > 0
    ) {
      const ring: Position[] = [];
      for (let i = 0; i <= 48; i++) {
        const angle = (i * Math.PI) / 24;
        ring.push([
          accuracyMarker.coordinates[0] +
            (Math.cos(angle) * accuracyMarker.accuracy) /
              (111320 *
                Math.cos((accuracyMarker.coordinates[1] * Math.PI) / 180)),
          accuracyMarker.coordinates[1] +
            (Math.sin(angle) * accuracyMarker.accuracy) / 111320,
        ]);
      }
      line(ring, '#538cdb', true);
      point(accuracyMarker.coordinates, '#307ede');
    }
    if (connectCenter) {
      for (const edge of data.graph.edges) {
        const a = nodes.get(edge.from),
          b = nodes.get(edge.to);
        if (
          a &&
          b &&
          (distance(connectCenter, a.coordinates) < 30 ||
            distance(connectCenter, b.coordinates) < 30)
        ) {
          line([a.coordinates, b.coordinates], '#4b83dd');
          point(a.coordinates, '#4b83dd');
          point(b.coordinates, '#4b83dd');
        }
      }
    }
    (map.getSource('survey-overlay') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features,
    });
  }, [
    fix,
    version,
    recording,
    selection,
    marker,
    screen,
    path,
    boundaries,
    connectCenter,
    data.graph.edges,
    map,
    nodes,
  ]);
}
