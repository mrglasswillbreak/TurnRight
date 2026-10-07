import { BrandMark } from './BrandMark';
import {
  WorkspaceFrame,
  WorkspacePane,
  useWorkspaceLayout,
} from './WorkspaceFrame';
import { WorkspaceNavigation, WorkspaceSections } from './WorkspaceNavigation';
import { workspaceForSection } from './editor-layout';
import { useState, lazy, Suspense } from 'react';
import type { Map as MapInstance } from 'maplibre-gl';
import type { CampusData } from './types';
import type { WorkspaceCapabilities } from './gis-types';
import type { ValidationIssue } from './validation';
import { MapView } from './MapView';
import GisWorkspace from './GisWorkspace';
import { supabase } from './supabase';
import { AppearanceSettings } from './AppearanceSettings';
import type { Appearance } from './appearance';
const ProcessMonitor = lazy(() => import('./ProcessMonitor'));
export default function GisTeamWorkspace({
  data,
  issues,
  capabilities,
  dark,
  appearance,
  onAppearance,
}: {
  data: CampusData;
  issues: ValidationIssue[];
  capabilities: WorkspaceCapabilities;
  dark: boolean;
  appearance: Appearance;
  onAppearance: (value: Appearance) => Promise<boolean>;
}) {
  const layout = useWorkspaceLayout(
    capabilities.userId,
    capabilities.campusId,
    capabilities,
  );
  const [settings, setSettings] = useState(false);
  const [section, setSection] = useState<string>(layout.value.workspace),
    [map, setMap] = useState<MapInstance | null>(null);

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <a className="editor-brand" href="/" aria-label="TurnRight public map">
          <span className="brandmark">
            <BrandMark />
          </span>
          <strong>
            TurnRight<span>Team workspace</span>
          </strong>
        </a>
        <WorkspaceNavigation
          section={section}
          canEdit={false}
          onSelect={(id) => {
            setSection(id);
            layout.update({ workspace: workspaceForSection(id) });
          }}
        />
        <button aria-label="Settings" onClick={() => setSettings(!settings)}>
          Settings
        </button>
        <span>{capabilities.roles.join(', ')}</span>
        <button onClick={() => void supabase?.auth.signOut()}>Sign out</button>
      </header>
      <WorkspaceFrame
        layout={layout}
        activity={
          <Suspense fallback={null}>
            <ProcessMonitor />
          </Suspense>
        }
        workspace={workspaceForSection(section)}
        tools={
          <WorkspaceSections
            section={section}
            canEdit={false}
            onSelect={setSection}
          />
        }
      >
        <section className="editor-map-workspace">
          <MapView
            data={data}
            dark={dark}
            editor
            onSelect={() => {}}
            onReady={setMap}
          />
          {!settings && section && (
            <GisWorkspace
              section={section}
              capabilities={capabilities}
              map={map}
              beforeChange={async () => {}}
              onClose={() => setSection(layout.value.workspace)}
              onEdit={() => {}}
              issues={issues}
              onIssue={() => {}}
            />
          )}
          {settings && (
            <WorkspacePane id="right" title="Settings">
              <div className="gis-workspace gis-pane">
                <AppearanceSettings
                  preference={appearance}
                  dark={dark}
                  onChange={onAppearance}
                />
                <button onClick={layout.reset}>Reset workspace layout</button>
                {capabilities.capabilities.includes('manage') && (
                  <button
                    onClick={() => {
                      setSettings(false);
                      setSection('members');
                    }}
                  >
                    Campus memberships
                  </button>
                )}
                <button onClick={() => setSettings(false)}>
                  Close settings
                </button>
              </div>
            </WorkspacePane>
          )}
        </section>
      </WorkspaceFrame>
    </main>
  );
}
