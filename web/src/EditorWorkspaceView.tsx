import { BrandMark } from './BrandMark';
import { SystemHealthButton } from './SystemHealthButton';
import { PhotoActivity } from './PhotoSession';
import { WorkspaceFrame } from './WorkspaceFrame';
import { WorkspaceNavigation, WorkspaceSections } from './WorkspaceNavigation';
import type { Appearance } from './appearance';
import { campusUrl } from './campus-context';
import { workspaceForSection } from './editor-layout';
import { type SourceRecord } from './editor-model';
import { EditorWorkspace } from './editor-workspace';
import { supabase } from './supabase';
import type { CampusData, MapEdit } from './types';

import { EditorState } from './editor-workspace-shared';

import { EditorMapWorkspace } from './EditorMapWorkspace';
import { useEditorConnections } from './useEditorConnections';
import { useEditorDrawing } from './useEditorDrawing';
import { useEditorMapLifecycle } from './useEditorMapLifecycle';
import { useEditorRepair } from './useEditorRepair';
import { useEditorReviewPanel } from './useEditorReviewPanel';
import { useEditorSelection } from './useEditorSelection';
import { useEditorSessionState } from './useEditorSessionState';
import { useEditorSources } from './useEditorSources';
import { useEditorSynchronization } from './useEditorSynchronization';
import { useEditorTasks } from './useEditorTasks';

export function Editor(props: {
  data: CampusData;
  dark: boolean;
  appearance: Appearance;
  onAppearance: (value: Appearance) => Promise<boolean>;
  state: EditorState;
  sources: SourceRecord[];
  workspace: EditorWorkspace;
  offlineContext: boolean;
  syncedAt?: string;
  refresh: () => Promise<MapEdit[]>;
  owner: string;
  prepareOffline: () => Promise<void>;
  updateReady?: boolean;
  installUpdate?: () => Promise<void>;
}) {
  const editorSessionStateBindings = useEditorSessionState(props);
  const {
    state,
    offlineContext,
    syncedAt,
    updateReady,
    installUpdate,
    workspace,
    networkOnline,
    survey,
    setSurvey,
    surveyRecording,
    layout,
    tab,
    setTab,
    layersOpen,
    tool,
    settingsTrigger,
    setPreview,
    setError,
  } = editorSessionStateBindings;
  const editorSourcesBindings = useEditorSources({
    ...editorSessionStateBindings,
  });
  const editorSelectionBindings = useEditorSelection({
    ...editorSessionStateBindings,
  });
  const editorRepairBindings = useEditorRepair({
    ...editorSessionStateBindings,
    ...editorSelectionBindings,
  });
  const editorDrawingBindings = useEditorDrawing({
    ...editorSessionStateBindings,
    ...editorSelectionBindings,
    ...editorRepairBindings,
  });
  const editorConnectionsBindings = useEditorConnections({
    ...editorSessionStateBindings,
    ...editorSelectionBindings,
    ...editorRepairBindings,
    ...editorDrawingBindings,
  });
  const editorMapLifecycleBindings = useEditorMapLifecycle({
    ...editorSessionStateBindings,
    ...editorSourcesBindings,
    ...editorDrawingBindings,
    ...editorConnectionsBindings,
  });
  const editorSynchronizationBindings = useEditorSynchronization({
    ...editorSessionStateBindings,
  });
  const { exportBackup, localRecovery, refreshWorkspace } =
    editorSynchronizationBindings;
  const editorTasksBindings = useEditorTasks({
    ...editorSessionStateBindings,
    ...editorSourcesBindings,
  });
  const { selectSection } = editorTasksBindings;
  const editorReviewPanelBindings = useEditorReviewPanel({
    ...editorSessionStateBindings,
    ...editorSelectionBindings,
    ...editorRepairBindings,
    ...editorSynchronizationBindings,
  });
  return (
    <main className={`editor-shell ${survey ? 'survey-active' : ''}`}>
      {(offlineContext || !networkOnline) && (
        <output className="editor-offline">
          Working offline · Last synchronized:{' '}
          {syncedAt ? new Date(syncedAt).toLocaleString() : 'Unknown'}
          <button onClick={refreshWorkspace}>Reconnect and synchronize</button>
          <button onClick={localRecovery}>Download local recovery</button>
        </output>
      )}
      {updateReady && (
        <output className="editor-update">
          App update ready.{' '}
          {surveyRecording
            ? 'Pause recording before updating.'
            : 'Recovery data will be kept.'}
          <button
            disabled={surveyRecording}
            onClick={async () => {
              if (await workspace.prepareUpdate()) await installUpdate?.();
            }}
          >
            Install update
          </button>
        </output>
      )}
      <header className="editor-header">
        <a
          className="editor-brand"
          href={campusUrl('/')}
          aria-label="TurnRight public map"
        >
          <span className="brandmark">
            <BrandMark size={23} />
          </span>
          <strong>
            TurnRight<span>Map editor</span>
          </strong>
        </a>
        <details className="workspace-menu campus-menu">
          <summary>{state.campus?.name || 'LASU Ojo'}</summary>
          <div>
            <button
              disabled={
                !!tool ||
                !!workspace.unfinished ||
                !!workspace.roofDraft ||
                surveyRecording
              }
              onClick={() => selectSection('campuses')}
            >
              Campuses
            </button>
          </div>
        </details>
        <WorkspaceNavigation
          section={tab}
          onSelect={selectSection}
          disabled={
            survey || !!tool || !!workspace.unfinished || !!workspace.roofDraft
          }
        />
        <div className="editor-header-right">
          <output
            className={`editor-save-state ${workspace.status === 'Saved' ? 'saved' : ''}`}
          >
            <span />
            {workspace.status}
          </output>
          <button
            className="editor-icon"
            aria-label="Settings"
            title="Settings"
            ref={settingsTrigger}
            onClick={() => selectSection('settings')}
          >
            ⚙
          </button>
          <details className="workspace-menu">
            <summary>Workspace</summary>
            <div>
              {state.capabilities?.operationalMonitoring && (
                <SystemHealthButton />
              )}
              <button onClick={localRecovery}>Download local recovery</button>
              <button onClick={exportBackup}>Export backup</button>
              <button onClick={refreshWorkspace}>Refresh workspace</button>
              <button
                onClick={() => {
                  layout.reset();
                  setTab('map');
                }}
              >
                Reset layout
              </button>
              {state.capabilities?.capabilities.includes('manage') && (
                <button onClick={() => selectSection('members')}>
                  Campus memberships
                </button>
              )}
              <button
                onClick={async () => {
                  if (await workspace.flush()) await supabase?.auth.signOut();
                }}
              >
                Sign out
              </button>
            </div>
          </details>
        </div>
      </header>
      <WorkspaceFrame
        sourceReview={tab === 'changes'}
        layout={layout}
        suspendPanes={survey}
        activity={<PhotoActivity />}
        workspace={workspaceForSection(tab)}
        tools={
          <>
            <WorkspaceSections
              section={layersOpen ? 'layers' : tab}
              onSelect={selectSection}
              disabled={
                survey ||
                !!tool ||
                !!workspace.unfinished ||
                !!workspace.roofDraft
              }
            />{' '}
            {!survey && tab === 'map' && (
              <button
                className="editor-survey-entry"
                onClick={() => {
                  if (workspace.unfinished) {
                    setError('Finish or cancel the drawing before surveying.');
                    return;
                  }
                  setSurvey(true);
                  setTab('map');
                  setPreview(false);
                }}
              >
                Survey
              </button>
            )}
          </>
        }
      >
        <EditorMapWorkspace
          {...editorSessionStateBindings}
          {...editorSourcesBindings}
          {...editorSelectionBindings}
          {...editorRepairBindings}
          {...editorDrawingBindings}
          {...editorConnectionsBindings}
          {...editorMapLifecycleBindings}
          {...editorSynchronizationBindings}
          {...editorTasksBindings}
          {...editorReviewPanelBindings}
        />
      </WorkspaceFrame>
    </main>
  );
}
