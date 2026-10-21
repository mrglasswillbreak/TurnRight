import { useEffect } from 'react';
import type { GeoJSONSource } from 'maplibre-gl';
import type { MapViewState } from './useMapView';
export function useMapRoutes({
  mapRef,
  routes,
  activeRoute,
  selected,
  ready,
  panelBesideMap,
}: Pick<
  MapViewState,
  'mapRef' | 'routes' | 'activeRoute' | 'selected' | 'ready' | 'panelBesideMap'
>): void {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const route = routes[activeRoute];
      (map.getSource('route-labels') as GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: route
          ? [
              {
                type: 'Feature',
                properties: { name: 'Start' },
                geometry: { type: 'Point', coordinates: route.coordinates[0] },
              },
              {
                type: 'Feature',
                properties: {
                  name: (
                    (route.mode === 'driving' && !route.legs
                      ? route.parkingName
                      : selected?.name) || 'Destination'
                  ).replace(/[^\x20-\x7E]/g, ' '),
                },
                geometry: {
                  type: 'Point',
                  coordinates: route.coordinates.at(-1)!,
                },
              },
            ]
          : [],
      });
      (map.getSource('routes') as GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: [...routes.entries()]
          .sort(
            ([i], [j]) => Number(i === activeRoute) - Number(j === activeRoute),
          )
          .flatMap(([i, journey]) =>
            (journey.legs || [journey]).map((r) => ({
              type: 'Feature',
              properties: {
                active: i === activeRoute,
                mode: r.mode || 'walking',
              },
              geometry: {
                type: 'LineString',
                coordinates:
                  r.coordinates.length > 1
                    ? r.coordinates
                    : [...r.coordinates, ...r.coordinates],
              },
            })),
          ),
      });
    };
    if (ready.current) apply();
    else map.once('load', apply);
    return () => {
      map.off('load', apply);
    };
  }, [routes, activeRoute, panelBesideMap, selected?.name, mapRef, ready]);
}
