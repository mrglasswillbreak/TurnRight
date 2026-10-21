import { useEffect } from 'react';
import * as maplibregl from 'maplibre-gl';
import { entranceConnected, placeEntrances } from './arrival';
import type { MapViewState } from './useMapView';
export function useMapEntranceMarkers({
  mapRef,
  selectedId,
  editor,
  data,
}: Pick<MapViewState, 'mapRef' | 'selectedId' | 'editor' | 'data'>): void {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId || editor) return;
    const markers = placeEntrances(data, selectedId).map((entrance) => {
      const connected = entranceConnected(data, entrance);
      const element = document.createElement('button');
      element.type = 'button';
      element.className = `entrance-marker ${connected ? 'connected' : 'unconfirmed'}`;
      element.textContent = connected ? '↪' : '?';
      const label = `${entrance.name}: ${connected ? 'connected entrance' : 'unconfirmed or restricted connection'}`;
      element.setAttribute('aria-label', label);
      element.title = label;
      return new maplibregl.Marker({ element })
        .setLngLat(entrance.coordinates)
        .setPopup(new maplibregl.Popup({ offset: 18 }).setText(label))
        .addTo(map);
    });
    const place = data.places.find((p) => p.id === selectedId);
    const approach =
      place?.arrivalKind === 'mapped-approach' &&
      data.graph.nodes.find((node) => node.id === place.graphNode);
    if (approach) {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'entrance-marker mapped-approach';
      element.textContent = '◇';
      const label = `Mapped approach to ${place.name}; final entrance not verified`;
      element.setAttribute('aria-label', label);
      element.title = label;
      markers.push(
        new maplibregl.Marker({ element })
          .setLngLat(approach.coordinates)
          .setPopup(new maplibregl.Popup({ offset: 18 }).setText(label))
          .addTo(map),
      );
    }
    return () => markers.forEach((marker) => marker.remove());
  }, [data, selectedId, editor, mapRef]);
}
