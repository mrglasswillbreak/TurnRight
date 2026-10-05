import { useState } from 'react';
import type { Map as MapInstance } from 'maplibre-gl';
import type { CampusData } from './types';
import type { WorkspaceCapabilities } from './gis-types';
import type { ValidationIssue } from './validation';
import { MapView } from './MapView';
import GisWorkspace from './GisWorkspace';
import { supabase } from './supabase';
export default function GisTeamWorkspace({
  data,
  issues,
  capabilities,
  dark,
}: {
  data: CampusData;
  issues: ValidationIssue[];
  capabilities: WorkspaceCapabilities;
  dark: boolean;
}) {
  const [section, setSection] = useState('gis-review'),
    [map, setMap] = useState<MapInstance | null>(null);

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <strong>TurnRight · Campus GIS</strong>
        <nav aria-label="Editor sections" className="editor-navigation">
          {[
            ['gis-data', 'Data'],
            ['gis-analyze', 'Analyze'],
            ['gis-review', 'Review'],
            ['gis-publish', 'Publish'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={section === id ? 'active' : ''}
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <span>{capabilities.roles.join(', ')}</span>
        <button onClick={() => void supabase?.auth.signOut()}>Sign out</button>
      </header>
      <section className="editor-map-workspace">
        <MapView
          data={data}
          dark={dark}
          editor
          onSelect={() => {}}
          onReady={setMap}
        />
        {section && (
          <GisWorkspace
            section={section}
            capabilities={capabilities}
            map={map}
            beforeChange={async () => {}}
            onClose={() => setSection('')}
            onEdit={() => {}}
            issues={issues}
            onIssue={() => {}}
          />
        )}
      </section>
    </main>
  );
}
