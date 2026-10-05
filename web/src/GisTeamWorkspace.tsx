import ReadOnlyLayerTable from './ReadOnlyLayerTable';
import { EditorSettings } from './EditorSettings';
import type { Appearance } from './appearance';
import { useEffect, useMemo, useState } from 'react';
import type { Map as MapInstance } from 'maplibre-gl';
import type { CampusData } from './types';
import type { WorkspaceCapabilities } from './gis-types';
import type { ValidationIssue } from './validation';
import type { LayerViewState } from './campus-layer-types';
import { MapView } from './MapView';
import GisWorkspace from './GisWorkspace';
import EditorCatalogue from './EditorCatalogue';
import DatasetInspector from './DatasetInspector';
import { EditorChrome, DockResize } from './EditorChrome';
import type { FeatureRef } from './editor-session';
import { useEditorSession } from './EditorSession';
import { campusLayers, layerPresentation } from './campus-layers';
import { api, supabase } from './supabase';
import { campusUrl, type CampusIdentity } from './campus-context';
export default function GisTeamWorkspace({
  data,
  issues,
  capabilities,
  dark,
  campus,
  appearance,
  onAppearance,
}: {
  appearance: Appearance;
  onAppearance: (value: Appearance) => Promise<boolean>;
  data: CampusData;
  issues: ValidationIssue[];
  capabilities: WorkspaceCapabilities;
  dark: boolean;
  campus: CampusIdentity;
}) {
  const session = useEditorSession();
  const [simple, setSimple] = useState(false),
    [opacity, setOpacity] = useState(1);
  const [map, setMap] = useState<MapInstance | null>(null),
    [view, setView] = useState<LayerViewState>({});
  const [inspection, setInspection] = useState<{
    title: string;
    properties: Record<string, unknown>;
  }>();
  const [campuses, setCampuses] = useState<CampusIdentity[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    if (session.state.task === 'campuses')
      void api<{ campuses: CampusIdentity[] }>('campus-list')
        .then((r) => setCampuses(r.campuses))
        .catch((e) => setError(e.message));
  }, [session.state.task]);
  const presented = useMemo(
    () => layerPresentation(data, true, view),
    [data, view],
  );
  const inspect = (
    title: string,
    properties: Record<string, unknown>,
    feature?: FeatureRef,
  ) => {
    setInspection({ title, properties });
    session.navigate('map');
    session.setState((s) => ({
      ...s,
      selection: feature ? [feature] : [],
      panel: 'inspector',
    }));
  };
  const issue = (value: ValidationIssue) => {
    if (value.coordinates)
      map?.easeTo({
        center: value.coordinates,
        zoom: Math.max(map.getZoom(), 18),
      });
    inspect('Issue inspection', {
      message: value.message,
      feature: value.featureId,
      severity: value.severity || 'error',
    });
  };
  return (
    <EditorChrome
      campus={campus.name}
      onTask={session.navigate}
      saveStatus="Read-only map"
      onRefresh={() => void session.refresh().catch((e) => setError(e.message))}
      onSignOut={() => void supabase?.auth.signOut()}
    >
      <section className="editor-map-workspace" aria-label="Mapping workspace">
        <MapView
          data={presented}
          dark={dark}
          simple={simple}
          buildingOpacity={opacity}
          onSelect={(place) =>
            inspect(place.name, place as unknown as Record<string, unknown>, {
              campusId: campus.id,
              kind: 'place',
              id: place.id,
            })
          }
          onBuildingSelect={(feature) =>
            inspect(
              String(feature.properties?.name || 'Building'),
              feature.properties || {},
              {
                campusId: campus.id,
                kind: 'building',
                id: String(feature.properties?.id || feature.id),
              },
            )
          }
          onReady={setMap}
        />
        <EditorCatalogue
          layers={campusLayers(data).items}
          view={view}
          onView={setView}
          map={map}
          onImport={() => session.navigate('campuses')}
          onProperties={(entry) => {
            if (entry.dataset) session.navigate('dataset-settings');
            else
              inspect(
                entry.name,
                entry.layer as unknown as Record<string, unknown>,
              );
          }}
        />
        <GisWorkspace
          section={session.state.task}
          capabilities={capabilities}
          map={map}
          beforeChange={async () => {}}
          onClose={() => session.navigate('map')}
          onEdit={() => {}}
          issues={issues}
          onIssue={issue}
        />
        <ReadOnlyLayerTable data={data} onInspect={inspect} />
        <DatasetInspector map={map} onEdit={() => {}} />
        {session.state.task === 'map' &&
          inspection &&
          !session.state.selection[0]?.datasetId && (
            <aside className="editor-task-dock editor-card">
              <DockResize axis="horizontal" dimension="inspector" />
              <header>
                <h2>{inspection.title}</h2>
                <button
                  aria-label="Close properties"
                  onClick={() => setInspection(undefined)}
                >
                  ×
                </button>
              </header>
              <p>Read-only inspection</p>
              <dl>
                {Object.entries(inspection.properties)
                  .filter(([, v]) => v !== undefined)
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>
                        {typeof value === 'object'
                          ? JSON.stringify(value)
                          : String(value)}
                      </dd>
                    </div>
                  ))}
              </dl>
            </aside>
          )}
        {session.state.task === 'campuses' && (
          <aside className="editor-task-dock editor-card">
            <header>
              <h2>Switch campus</h2>
              <button onClick={() => session.navigate('map')}>Back</button>
            </header>
            {error && <p role="alert">{error}</p>}
            {campuses.map((c) => (
              <p key={c.id}>
                <a href={campusUrl('/admin', c.slug)}>{c.name}</a>
              </p>
            ))}
          </aside>
        )}
        {session.state.task === 'settings' && (
          <EditorSettings
            appearance={appearance}
            dark={dark}
            onAppearance={onAppearance}
            map={map}
            threeD={false}
            simple={simple}
            onSimple={setSimple}
            opacity={opacity}
            onOpacity={setOpacity}
            onClose={() => session.navigate('map')}
          />
        )}
      </section>
    </EditorChrome>
  );
}
