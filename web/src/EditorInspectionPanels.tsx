import { ArrowUpRight, DoorOpen, X } from 'lucide-react';
import { Suspense } from 'react';
import { WorkspacePane } from './WorkspaceFrame';
import { remapBuildingSurfaces } from './building-surfaces';
import { editKey } from './editor-workspace';
import {
  BuildingAppearanceEditor,
  DuplicateReview,
  EditorInspector,
} from './editor-workspace-shared';
import { photoEdits } from './photo-workspace';
import { propertyEdits } from './road-properties';

import type { EditorConnectionsBindings } from './useEditorConnections';
import type { EditorDrawingBindings } from './useEditorDrawing';
import type { EditorMapLifecycleBindings } from './useEditorMapLifecycle';
import type { EditorRepairBindings } from './useEditorRepair';
import type { EditorReviewPanelBindings } from './useEditorReviewPanel';
import type { EditorSelectionBindings } from './useEditorSelection';
import type { EditorSessionStateBindings } from './useEditorSessionState';
import type { EditorSourcesBindings } from './useEditorSources';

type Props = Pick<
  EditorSessionStateBindings,
  | 'data'
  | 'owner'
  | 'workspace'
  | 'tab'
  | 'setTab'
  | 'setFilter'
  | 'setExplorer'
  | 'setLayerOperation'
  | 'welcomeDismissed'
  | 'setWelcomeDismissed'
  | 'selected'
  | 'setSelected'
  | 'tool'
  | 'buildingMode'
  | 'setBuildingMode'
  | 'buildingSelection'
  | 'setBuildingSelection'
  | 'preview'
  | 'setMessage'
  | 'busy'
  | 'showRoutes'
  | 'mapRef'
  | 'controller'
  | 'selectedRef'
  | 'setFocusRequest'
  | 'selectionOverview'
  | 'repairFocus'
  | 'setRepairFocus'
  | 'publishedBuilding'
  | 'validation'
  | 'exactBatch'
> &
  Pick<EditorSourcesBindings, 'mergeBatch' | 'decideDuplicate'> &
  Pick<EditorSelectionBindings, 'selectId'> &
  Pick<EditorRepairBindings, 'stageRepair'> &
  Pick<EditorDrawingBindings, 'addEntrance' | 'approach' | 'remove'> &
  Pick<EditorConnectionsBindings, 'pick' | 'disconnect'> &
  Pick<EditorMapLifecycleBindings, 'undo'> &
  Pick<EditorReviewPanelBindings, 'reviewPanel'>;
export function EditorInspectionPanels(props: Props) {
  const {
    data,
    owner,
    workspace,
    tab,
    setTab,
    setFilter,
    setExplorer,
    setLayerOperation,
    welcomeDismissed,
    setWelcomeDismissed,
    selected,
    setSelected,
    tool,
    buildingMode,
    setBuildingMode,
    buildingSelection,
    setBuildingSelection,
    preview,
    setMessage,
    busy,
    showRoutes,
    mapRef,
    controller,
    selectedRef,
    setFocusRequest,
    selectionOverview,
    repairFocus,
    setRepairFocus,
    publishedBuilding,
    validation,
    exactBatch,
    mergeBatch,
    decideDuplicate,
    selectId,
    stageRepair,
    addEntrance,
    approach,
    remove,
    pick,
    disconnect,
    undo,
    reviewPanel,
  } = props;
  return tab !== 'changes' &&
    !tab.startsWith('gis-') &&
    tab !== 'members' &&
    tab !== 'map' &&
    tab !== 'settings' &&
    tab !== 'campuses' ? (
    <WorkspacePane id="right" title="Review details">
      <aside className="editor-review-panel editor-card">
        <div className="editor-panel-heading">
          <span className="editor-eyebrow">PRIVATE WORKSPACE</span>
          <button
            className="editor-icon"
            aria-label="Close review panel"
            onClick={() => setTab('map')}
          >
            <X size={18} />
          </button>
        </div>
        {tab === 'duplicates' ? (
          <Suspense fallback={<p>Opening duplicate review…</p>}>
            <DuplicateReview
              data={validation.data}
              candidates={validation.duplicates}
              pending={validation.pending || busy}
              decide={decideDuplicate}
              inspect={(kind, id) => selectId(kind, id, true)}
              undo={() => undo()}
              canUndo={!!workspace.past.length}
              exactBatch={exactBatch}
              applyExact={(batch) =>
                mergeBatch(
                  batch,
                  'Reviewed duplicate cleanup applied. Undo restores the batch.',
                )
              }
            />
          </Suspense>
        ) : (
          reviewPanel
        )}
      </aside>
    </WorkspacePane>
  ) : selected && !preview && !showRoutes && tab === 'map' ? (
    <Suspense
      fallback={
        <aside className="editor-inspector editor-card">
          Loading properties…
        </aside>
      }
    >
      <EditorInspector
        photoOwner={owner}
        photoSaveStatus={workspace.status}
        publishedPhotos={data.photos}
        onPhotoUndo={() => undo()}
        onPhotos={(change) => {
          if (workspace.roofDraft || workspace.unfinished || validation.pending)
            throw Error(
              'Finish the current edit and wait for map validation before changing photos.',
            );
          const batch = photoEdits(validation.data, workspace.edits, change);
          workspace.commit(batch, null);
          const next = batch.find(
            (e) => e.id === selected.id && e.kind === selected.kind,
          );
          if (next) {
            setSelected(next);
            selectedRef.current = next;
          }
        }}
        onGeometry={(geometry) => {
          if (selected)
            stageRepair(
              [remapBuildingSurfaces(selected, geometry)],
              'Review corrected building geometry',
            );
        }}
        key={editKey(selected)}
        edit={selected}
        data={validation.data}
        issues={validation.issues
          .filter(
            (i) =>
              i.featureId === selected.id &&
              (!i.featureKind || i.featureKind === selected.kind),
          )
          .map((i) => i.message)}
        focusField={repairFocus?.field}
        onEndField={workspace.endHistoryGroup}
        buildingEditor={
          selected.kind === 'building' && (
            <Suspense fallback={<output>Loading building tools…</output>}>
              <BuildingAppearanceEditor
                reviewRequest={
                  repairFocus?.repair === 'review-model' ||
                  /^(height|floors|appearance|roof|wall)/i.test(
                    repairFocus?.field || '',
                  )
                    ? repairFocus || undefined
                    : undefined
                }
                onReviewOpened={() => setRepairFocus(null)}
                workspace={workspace}
                onHistory={undo}
                edit={selected}
                data={validation.data}
                mode={buildingMode}
                selection={buildingSelection}
                onMode={(mode) => {
                  workspace.endHistoryGroup();
                  setBuildingMode(mode);
                  if (mode === 'roof')
                    setBuildingSelection((s) => ({
                      buildingId: selected.id,
                      partId: s?.partId,
                    }));
                }}
                onSelection={(value) => {
                  workspace.endHistoryGroup();
                  setBuildingSelection(value);
                }}
                onEdit={(edit, field) => {
                  workspace.commit(
                    [edit],
                    workspace.unfinished,
                    field ? `${editKey(edit)}:${field}` : undefined,
                  );
                  setSelected(edit);
                  selectedRef.current = edit;
                }}
                roofDraft={workspace.roofDraft}
                onRoofDraft={(value) => workspace.draftRoof(value)}
                onApplyRoof={(edit) => {
                  workspace.applyRoof(edit);
                  setSelected(edit);
                  selectedRef.current = edit;
                  setMessage('Roof applied. Undo restores the previous roof.');
                }}
              />
            </Suspense>
          )
        }
        onProperty={(key, value, continuous) => {
          if (workspace.roofDraft) {
            setMessage(
              'Apply or cancel the roof plan before changing other building properties.',
            );
            return;
          }
          const batch = propertyEdits(
            validation.data,
            workspace.edits,
            [selected],
            key,
            value,
          );
          const edit = batch[0];
          if (repairFocus) {
            stageRepair(batch, 'Review feature repair');
            return;
          }
          workspace.commit(
            batch,
            workspace.unfinished,
            continuous ? `${editKey(edit)}:${key}` : undefined,
          );
          setSelected(edit);
          selectedRef.current = edit;
        }}
        onLayerGeometry={(operation) =>
          setLayerOperation({
            operation,
            keys: [`${selected.kind}:${selected.id}`],
          })
        }
        onEntrance={addEntrance}
        onApproach={approach}
        onPick={pick}
        onDisconnect={disconnect}
        onDelete={remove}
        onRestorePublished={
          publishedBuilding
            ? () =>
                stageRepair(
                  [publishedBuilding],
                  'Restore published building · review before applying',
                )
            : undefined
        }
        onClose={() => {
          workspace.endHistoryGroup();
          setFocusRequest(null);
          if (selectionOverview.current)
            mapRef.current?.easeTo({
              ...selectionOverview.current,
              pitch: mapRef.current.getPitch(),
              duration: 450,
            });
          selectionOverview.current = null;
          setSelected(null);
          setBuildingSelection(undefined);
          selectedRef.current = null;
          controller.current?.select(null);
        }}
      />
    </Suspense>
  ) : (
    !tool &&
    !preview &&
    !showRoutes &&
    tab === 'map' &&
    !welcomeDismissed && (
      <aside className="editor-welcome editor-card">
        <button
          type="button"
          className="editor-icon editor-welcome-dismiss"
          aria-label="Dismiss welcome card"
          title="Dismiss welcome card"
          onClick={() => {
            setWelcomeDismissed(true);
            try {
              localStorage.setItem(
                'turnright:editor-welcome-dismissed',
                'true',
              );
            } catch {
              // Dismiss for this visit when browser storage is unavailable.
            }
            mapRef.current?.getCanvas().focus();
          }}
        >
          <X size={18} aria-hidden="true" />
        </button>
        <span className="editor-welcome-icon">
          <DoorOpen size={23} />
        </span>
        <span className="editor-eyebrow">FILL IN THE MISSING PIECES</span>
        <h2>
          A better way
          <br />
          into every place.
        </h2>
        <p>
          Select a building, mark its entrance, and connect it to the paths
          people walk.
        </p>
        <div>
          <span>1</span> Choose a place on the map
        </div>
        <div>
          <span>2</span> Add entrances and paths
        </div>
        <div>
          <span>3</span> Test, review, and publish
        </div>
        <button
          className="editor-primary"
          onClick={() => {
            setFilter('needs');
            setExplorer(true);
          }}
        >
          Find places to map <ArrowUpRight size={16} />
        </button>
      </aside>
    )
  );
}
