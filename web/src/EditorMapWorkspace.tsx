import { ArrowUp, Check, ChevronLeft, Minus, Plus } from 'lucide-react';
import { EditorLegend } from './EditorLegend';
import { MapViewControl } from './MapViewControl';

import { EditorFeatureExplorer } from './EditorFeatureExplorer';
import { EditorInspectionPanels } from './EditorInspectionPanels';
import { EditorMapStage } from './EditorMapStage';
import { EditorRecoveryPanels } from './EditorRecoveryPanels';
import { EditorRouteTester } from './EditorRouteTester';
import { EditorTeamPanels } from './EditorTeamPanels';
import type { EditorConnectionsBindings } from './useEditorConnections';
import type { EditorDrawingBindings } from './useEditorDrawing';
import type { EditorMapLifecycleBindings } from './useEditorMapLifecycle';
import type { EditorRepairBindings } from './useEditorRepair';
import type { EditorReviewPanelBindings } from './useEditorReviewPanel';
import type { EditorSelectionBindings } from './useEditorSelection';
import type { EditorSessionStateBindings } from './useEditorSessionState';
import type { EditorSourcesBindings } from './useEditorSources';
import type { EditorSynchronizationBindings } from './useEditorSynchronization';
import type { EditorTasksBindings } from './useEditorTasks';
type Props = Pick<
  EditorSessionStateBindings,
  | 'data'
  | 'dark'
  | 'appearance'
  | 'onAppearance'
  | 'state'
  | 'store'
  | 'refresh'
  | 'owner'
  | 'prepareOffline'
  | 'workspace'
  | 'taskError'
  | 'setTaskError'
  | 'signIn'
  | 'conflictServer'
  | 'setConflictServer'
  | 'setReviewOverlay'
  | 'reviewConflicts'
  | 'survey'
  | 'setSurvey'
  | 'surveyRecording'
  | 'setSurveyRecording'
  | 'layout'
  | 'tab'
  | 'setTab'
  | 'search'
  | 'setSearch'
  | 'filter'
  | 'setFilter'
  | 'explorer'
  | 'setExplorer'
  | 'layersOpen'
  | 'setLayersOpen'
  | 'layerView'
  | 'setLayerView'
  | 'overlap'
  | 'setOverlap'
  | 'layerOperation'
  | 'setLayerOperation'
  | 'cutterRequest'
  | 'welcomeDismissed'
  | 'setWelcomeDismissed'
  | 'selected'
  | 'setSelected'
  | 'tool'
  | 'buildingMode'
  | 'setBuildingMode'
  | 'buildingSelection'
  | 'setBuildingSelection'
  | 'precisionOpen'
  | 'setPrecisionOpen'
  | 'precision'
  | 'setPrecision'
  | 'threeD'
  | 'setThreeD'
  | 'simple3D'
  | 'setSimple3D'
  | 'settingsTrigger'
  | 'opacity'
  | 'setOpacity'
  | 'preview'
  | 'setPreview'
  | 'ready'
  | 'requestedBuilding'
  | 'handoffNotice'
  | 'setHandoffNotice'
  | 'message'
  | 'setMessage'
  | 'hint'
  | 'error'
  | 'setError'
  | 'busy'
  | 'testOrigin'
  | 'setTestOrigin'
  | 'testDest'
  | 'setTestDest'
  | 'routes'
  | 'setRoutes'
  | 'showRoutes'
  | 'setShowRoutes'
  | 'setReview'
  | 'mapRef'
  | 'controller'
  | 'selectedRef'
  | 'setFocusRequest'
  | 'selectionOverview'
  | 'progress'
  | 'repairFocus'
  | 'setRepairFocus'
  | 'publishedBuilding'
  | 'repairPreview'
  | 'repairErrors'
  | 'gisSources'
  | 'setGisSources'
  | 'validation'
  | 'exactBatch'
> &
  Pick<
    EditorSourcesBindings,
    'mergeBatch' | 'decideDuplicate' | 'setAppearancePreview' | 'rendered'
  > &
  Pick<
    EditorSelectionBindings,
    'select' | 'selectId' | 'commitLayers' | 'zoomLayers'
  > &
  Pick<EditorRepairBindings, 'stageRepair' | 'dismissRepair' | 'applyRepair'> &
  Pick<EditorDrawingBindings, 'begin' | 'addEntrance' | 'approach' | 'remove'> &
  Pick<EditorConnectionsBindings, 'pick' | 'disconnect'> &
  Pick<EditorMapLifecycleBindings, 'mapReady' | 'undo' | 'cancel'> &
  Pick<EditorSynchronizationBindings, 'action' | 'localRecovery'> &
  Pick<
    EditorTasksBindings,
    | 'previewTestRoute'
    | 'visibleTasks'
    | 'toolButtons'
    | 'toggleView'
    | 'resume'
    | 'selectSection'
  > &
  Pick<EditorReviewPanelBindings, 'reviewPanel'>;
export function EditorMapWorkspace(props: Props) {
  const {
    workspace,
    layout,
    tab,
    tool,
    threeD,
    preview,
    setPreview,
    message,
    hint,
    mapRef,
    controller,
    progress,
    cancel,
    toggleView,
  } = props;
  return (
    <section
      className={`editor-map-workspace ${tab === 'settings' ? 'settings-open' : ''}`}
      aria-label="Mapping workspace"
    >
      <EditorMapStage {...props} />
      <EditorFeatureExplorer {...props} />

      <div className="editor-view-controls editor-card">
        <MapViewControl threeD={threeD} onView={toggleView} />
        <button
          className="editor-icon"
          aria-label="Zoom in"
          onClick={() => mapRef.current?.zoomIn()}
        >
          <Plus size={18} />
        </button>
        <button
          className="editor-icon"
          aria-label="Zoom out"
          onClick={() => mapRef.current?.zoomOut()}
        >
          <Minus size={18} />
        </button>
        <button
          className="editor-icon"
          aria-label="Reset north"
          title="Reset north"
          onClick={() => mapRef.current?.easeTo({ bearing: 0 })}
        >
          <ArrowUp size={18} />
        </button>
        {threeD && (
          <>
            <button
              className="editor-icon"
              aria-label="Rotate left"
              onClick={() =>
                mapRef.current?.easeTo({
                  bearing: mapRef.current.getBearing() - 30,
                })
              }
            >
              <ChevronLeft size={18} />
            </button>
          </>
        )}
        <button
          className={`editor-compare ${preview ? 'active' : ''}`}
          disabled={!!tool || !!workspace.unfinished}
          onClick={() => setPreview(!preview)}
        >
          {preview ? 'Back to draft' : 'Compare base'}
        </button>
      </div>
      <EditorTeamPanels {...props} />
      <EditorInspectionPanels {...props} />
      <EditorRouteTester {...props} />
      <div className="editor-bottom">
        <EditorLegend
          open={layout.value.legend}
          onChange={(legend) => layout.update({ legend })}
          threeD={threeD}
        />
        <output className="editor-guidance editor-card">
          {preview
            ? 'Approved source geometry · read-only comparison'
            : hint || message}
          {tool && (
            <span className="editor-finish-controls">
              <span aria-live="polite" className="drawing-progress">
                {progress.message}
              </span>
              <button
                className="editor-primary"
                disabled={!progress.canFinish}
                title={progress.canFinish ? 'Finish drawing' : progress.message}
                onClick={() => controller.current?.finish()}
              >
                <Check size={15} /> Finish
              </button>
              <button className="editor-secondary" onClick={cancel}>
                Cancel
              </button>
            </span>
          )}
        </output>
      </div>
      <EditorRecoveryPanels {...props} />
    </section>
  );
}
