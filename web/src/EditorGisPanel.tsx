import { Suspense } from 'react';
import { editKey } from './editor-workspace';
import { GisWorkspace } from './editor-workspace-shared';
import type { MapEdit } from './types';

import type { EditorSelectionBindings } from './useEditorSelection';
import type { EditorSessionStateBindings } from './useEditorSessionState';

type Props = Pick<
  EditorSessionStateBindings,
  | 'state'
  | 'refresh'
  | 'workspace'
  | 'tab'
  | 'setTab'
  | 'setSelected'
  | 'mapRef'
  | 'setRepairFocus'
  | 'gisSources'
  | 'setGisSources'
  | 'validation'
> &
  Pick<EditorSelectionBindings, 'select'>;
export function EditorGisPanel(props: Props) {
  const {
    state,
    refresh,
    workspace,
    tab,
    setTab,
    setSelected,
    mapRef,
    setRepairFocus,
    gisSources,
    setGisSources,
    validation,
    select,
  } = props;
  return (
    (tab.startsWith('gis-') || tab === 'members') && (
      <Suspense
        fallback={<p className="campus-workspace">Opening GIS workspace…</p>}
      >
        <GisWorkspace
          section={tab}
          capabilities={state.capabilities}
          map={mapRef.current}
          beforeChange={async () => {
            if (
              workspace.unfinished ||
              workspace.roofDraft ||
              !(await workspace.flush())
            )
              throw new Error(
                'Finish the current edit and resolve pending saves first.',
              );
          }}
          onClose={() => setTab('map')}
          issues={validation.issues}
          onIssue={(issue) => {
            setRepairFocus(issue);
            setTab('map');
          }}
          onEndEditingSession={async () => {
            if (!(await workspace.flush()))
              throw Error('Resolve pending saves first.');
            workspace.releaseDatasetFeatures();
            setGisSources([]);
            setSelected(null);
            await refresh();
          }}
          onEdit={(source, edit) => {
            if (
              new Set([
                ...gisSources.map((s) =>
                  s.entity === 'feature'
                    ? s.payload.properties?.kind +
                      ':' +
                      s.payload.properties?.id
                    : s.entity === 'place'
                      ? 'place:' + s.payload.id
                      : s.id,
                ),
                ...workspace.edits
                  .filter((e) => e.properties.gisManaged)
                  .map((e) => editKey(e)),
              ]).size >= 500 &&
              !gisSources.some((s) => s.id === source?.id) &&
              !workspace.edits.some(
                (e) => e.id === edit?.id && e.kind === edit?.kind,
              )
            )
              throw new Error(
                'This editing session contains 500 GIS features. Use Data → Geometry editing session to save and end it, or use a processing job.',
              );
            if (source)
              setGisSources((rows) => [
                ...rows.filter((r) => r.id !== source.id),
                source,
              ]);
            if (edit) workspace.includeServerFeature(edit);
            const target =
              edit ||
              (source?.entity === 'feature'
                ? {
                    id: String(source.payload.properties?.id),
                    kind: source.payload.properties?.kind as MapEdit['kind'],
                    geometry: source.payload.geometry,
                    properties: source.payload.properties || {},
                    deleted: false,
                  }
                : source?.entity === 'place'
                  ? {
                      id: source.payload.id,
                      kind: 'place' as const,
                      geometry: {
                        type: 'Point' as const,
                        coordinates: source.payload.coordinates,
                      },
                      properties: {
                        ...source.payload,
                        kind: 'place',
                        gisManaged: true,
                      },
                      deleted: false,
                    }
                  : null);
            if (target) select(target, true);
          }}
        />
      </Suspense>
    )
  );
}
