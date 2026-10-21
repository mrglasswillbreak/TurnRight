import { useBuildingPreview } from './useBuildingPreview';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MapInstance } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { displayGeometry, buildingPlace } from './map-display';
import type { createCampusModels, ModelStatus } from './campus-model-layer';
import { placeFeatures, closureFeatures } from './map-sources';
import { visitorPresentation, ALL_VISITOR_LAYERS } from './visitor-layers';
import { MapViewProps } from './map-view-types';
import { noRoutes } from './map-view-data';
import { useMapRoadGeometry } from './useMapRoadGeometry';
import { useMapAttribution } from './useMapAttribution';
import { useMapStreetSelection } from './useMapStreetSelection';
import { useMapExtraLayers } from './useMapExtraLayers';
import { useCampusMapLifecycle } from './useCampusMapLifecycle';
import { useWorldOverview } from './useWorldOverview';
import { useMapTheme } from './useMapTheme';
import { useMapDimensions } from './useMapDimensions';
import { useMapBuildingPresentation } from './useMapBuildingPresentation';
import { useMapModelRenderer } from './useMapModelRenderer';
import { useMapModelOptions } from './useMapModelOptions';
import { useMapSources } from './useMapSources';
import { useMapPlaceSelection } from './useMapPlaceSelection';
import { useMapEntranceMarkers } from './useMapEntranceMarkers';
import { useMapRoutes } from './useMapRoutes';
import { useMapGpsPosition } from './useMapGpsPosition';

export type MapViewControllerProps = MapViewProps;
export function useMapView({
  animationPaused = false,
  data: originalData,
  visitorLayers = ALL_VISITOR_LAYERS,
  selectedStreet,
  selected,
  routes = noRoutes,
  activeRoute = 0,
  fix,
  dark = false,
  threeD = false,
  simple = false,
  editor = false,
  buildingOpacity = 0.92,
  editing = false,
  buildingSelection,
  follow = false,
  motionActive = false,
  panelBesideMap = false,
  onSelect,
  onBuildingSelect,
  onManualPan,
  onWorldViewChange,
  onReady,
}: MapViewControllerProps) {
  const data = useMemo(
    () =>
      editor
        ? originalData
        : visitorPresentation(originalData, visitorLayers, selected?.id),
    [originalData, visitorLayers, selected?.id, editor],
  );

  const container = useRef<HTMLDivElement>(null),
    mapRef = useRef<MapInstance | null>(null);

  const callbacks = useRef({
    onSelect,
    onBuildingSelect,
    onManualPan,
    onWorldViewChange,
    onReady,
  });

  callbacks.current = {
    onSelect,
    onBuildingSelect,
    onManualPan,
    onWorldViewChange,
    onReady,
  };

  const ready = useRef(false);

  const models = useRef<ReturnType<typeof createCampusModels> | null>(null);

  const [modelIds, setModelIds] = useState<string[]>([]),
    [modelStatus, setModelStatus] = useState<ModelStatus>('ready'),
    [modelAttempt, setModelAttempt] = useState(0);

  const campusGeometry = useMemo(
    () => displayGeometry(data.map, data.visuals),
    [data.map, data.visuals],
  );

  const roadPaths = useMemo<FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: campusGeometry.features.filter(
        (f) => f.properties?.kind === 'path',
      ),
    }),
    [campusGeometry],
  );

  const [roadGeometry, setRoadGeometry] = useState<{
    source: FeatureCollection;
    geometry: FeatureCollection;
  }>();
  useMapRoadGeometry({ campusGeometry, setRoadGeometry });

  const placesGeometry = useMemo(
    () => placeFeatures(data.places),
    [data.places],
  );

  const closuresGeometry = useMemo(
    () => closureFeatures(data.graph, data.closures),
    [data.graph, data.closures],
  );

  const sourceData = useMemo(
    () => ({
      campus: campusGeometry,
      'road-display':
        roadGeometry?.source === campusGeometry
          ? roadGeometry.geometry
          : roadPaths,
      boundary: displayGeometry({
        type: 'FeatureCollection',
        features: [data.boundary],
      }),
      places: placesGeometry,
      closures: closuresGeometry,
    }),
    [
      campusGeometry,
      roadGeometry,
      roadPaths,
      data.boundary,
      placesGeometry,
      closuresGeometry,
    ],
  );

  const latestSources = useRef(sourceData);

  latestSources.current = sourceData;

  const appliedSources = useRef<Record<string, unknown>>({});

  const latestData = useRef(data);

  latestData.current = data;

  const camera = useRef({ selected, routes, activeRoute, dark, threeD });

  camera.current = { selected, routes, activeRoute, dark, threeD };

  const [mapError, setMapError] = useState('');

  const [worldError, setWorldError] = useState(false),
    [worldAttempt, setWorldAttempt] = useState(0),
    [worldView, setWorldView] = useState(false);

  const [motionMap, setMotionMap] = useState<MapInstance | null>(null);

  const restoreLayerZoom = useRef<
    typeof import('./map-extra-layers').layerZoomLimits | undefined
  >(undefined);
  useMapAttribution({ motionMap, data, editor });

  useEffect(() => {
    if (!editor)
      document.title =
        'TurnRight · ' + String(data.boundary.properties?.name || 'Campus map');
  }, [editor, data.boundary]);

  const selectedId = selected?.id || '';
  useMapStreetSelection({ mapRef, selectedStreet, data, container, ready });

  const selectedLng = selected?.coordinates[0],
    selectedLat = selected?.coordinates[1];

  const selectedBuildingId = useMemo(
    () =>
      buildingSelection?.buildingId ||
      (selectedId
        ? String(
            data.map.features.find(
              (f) =>
                f.properties?.kind === 'building' &&
                buildingPlace(data, f)?.id === selectedId,
            )?.properties?.id || '',
          )
        : ''),
    [data, selectedId, buildingSelection?.buildingId],
  );
  useMapExtraLayers({ motionMap, dark, restoreLayerZoom });
  useCampusMapLifecycle({
    container,
    camera,
    editor,
    setMapError,
    mapRef,
    setWorldView,
    callbacks,
    panelBesideMap,
    latestData,
    latestSources,
    appliedSources,
    models,
    ready,
    setMotionMap,
  });
  useWorldOverview({
    motionMap,
    editor,
    setWorldError,
    mapRef,
    camera,
    worldAttempt,
  });
  useMapTheme({ mapRef, dark, ready, panelBesideMap, editor });
  useMapDimensions({ mapRef, threeD, editor, ready, panelBesideMap });
  useMapBuildingPresentation({
    mapRef,
    modelIds,
    buildingOpacity,
    selectedId,
    dark,
    restoreLayerZoom,
    ready,
    editor,
    selectedBuildingId,
  });

  const buildingPreview = useBuildingPreview(
    data,
    selectedBuildingId,
    editor && threeD && !simple,
  );

  const modelOptions = useRef<Parameters<typeof createCampusModels>[1]>({
    data,
    enabled: false,
    dark,
    selectedId: selectedBuildingId,
    onReady: setModelIds,
    onStatus: setModelStatus,
  });

  modelOptions.current = {
    data,
    sceneryData: originalData,
    sceneryEnabled: editor || visitorLayers.greenery,
    enabled: threeD && !simple && !editing,
    selection: buildingSelection,
    opacity: buildingOpacity,
    overrides: buildingPreview.models,
    dark,
    selectedId: selectedBuildingId,
    onReady: setModelIds,
    onStatus: setModelStatus,
  };

  const visualRevision =
    data.visuals?.revision || (editor ? 'editor-preview' : undefined);
  useMapModelRenderer({
    motionMap,
    visualRevision,
    threeD,
    simple,
    setModelStatus,
    mapRef,
    models,
    modelOptions,
    modelAttempt,
  });
  useMapModelOptions({
    models,
    modelOptions,
    data,
    dark,
    threeD,
    simple,
    editing,
    buildingOpacity,
    selectedBuildingId,
    buildingSelection,
    buildingPreview,
  });
  useMapSources({ mapRef, sourceData, appliedSources, ready });
  useMapPlaceSelection({
    mapRef,
    selectedId,
    selectedLng,
    selectedLat,
    panelBesideMap,
  });
  useMapEntranceMarkers({ mapRef, selectedId, editor, data });
  useMapRoutes({
    mapRef,
    routes,
    activeRoute,
    selected,
    ready,
    panelBesideMap,
  });
  useMapGpsPosition({ mapRef, fix, ready, panelBesideMap });
  return {
    motionMap,
    editor,
    fix,
    follow,
    motionActive,
    routes,
    activeRoute,
    container,
    worldView,
    worldError,
    setWorldAttempt,
    animationPaused,
    selectedBuildingId,
    selected,
    threeD,
    simple,
    editing,
    buildingPreview,
    modelStatus,
    setModelAttempt,
    mapError,
    campusGeometry,
    setRoadGeometry,
    data,
    mapRef,
    selectedStreet,
    ready,
    dark,
    restoreLayerZoom,
    camera,
    setMapError,
    setWorldView,
    callbacks,
    panelBesideMap,
    latestData,
    latestSources,
    appliedSources,
    models,
    setMotionMap,
    setWorldError,
    worldAttempt,
    modelIds,
    buildingOpacity,
    selectedId,
    visualRevision,
    setModelStatus,
    modelOptions,
    modelAttempt,
    buildingSelection,
    sourceData,
    selectedLng,
    selectedLat,
  };
}
export type MapViewState = ReturnType<typeof useMapView>;
