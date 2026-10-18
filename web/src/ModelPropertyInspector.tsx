import { RotateCcw as ActionRotateCcw } from 'lucide-react';
import { Suspense } from 'react';
import { Panel } from 'react-resizable-panels';
import { buildingTopology } from './building-surfaces';
import { BuildingAppearanceEditor } from './BuildingAppearanceEditor';
import { editableFacade } from './model-authoring';
import { ModelMeshPanel } from './model-workspace-shared';
import { ModelButton } from './ModelButton';
import { ModelOutlineCanvas } from './ModelOutlineCanvas';

import { ModelCanvasControls } from './ModelCanvasControls';
import { ModelDetailProperties } from './ModelDetailProperties';
import { ModelRecoveryReview } from './ModelRecoveryReview';
import type { ModelCommitBindings } from './useModelCommit';
import type { ModelDetailCommandsBindings } from './useModelDetailCommands';
import type { ModelEditingControlsBindings } from './useModelEditingControls';
import type { ModelSelectionActionsBindings } from './useModelSelectionActions';
import type { ModelWorkspaceSelectionBindings } from './useModelWorkspaceSelection';
import type { ModelWorkspaceStateBindings } from './useModelWorkspaceState';
type Props = Pick<
  ModelWorkspaceStateBindings,
  | 'edit'
  | 'data'
  | 'selection'
  | 'onSelection'
  | 'workspace'
  | 'compact'
  | 'landscape'
  | 'reviewOpen'
  | 'setReviewOpen'
  | 'setContextPoint'
  | 'panel'
  | 'setDetent'
  | 'setTouchTool'
  | 'openPanel'
  | 'initial'
  | 'wallViews'
  | 'mode'
  | 'setMode'
  | 'setSelected'
  | 'instance'
  | 'setInstance'
  | 'tab'
  | 'setTab'
  | 'before'
  | 'setBefore'
  | 'setError'
  | 'grid'
  | 'setGrid'
  | 'setMeshPreview'
  | 'meshSelection'
  | 'setMeshSelection'
  | 'previewScene'
  | 'setWholeRows'
  | 'reviewResult'
  | 'setReviewResult'
  | 'setPaste'
  | 'pending'
  | 'name'
  | 'setName'
  | 'pattern'
  | 'setPattern'
  | 'patternId'
  | 'setPatternId'
  | 'setTargetWall'
  | 'roofDraft'
  | 'webglUnavailable'
  | 'conversion'
  | 'setConversion'
> &
  Pick<
    ModelWorkspaceSelectionBindings,
    | 'draft'
    | 'feature'
    | 'original'
    | 'walls'
    | 'activeWall'
    | 'visual'
    | 'metrics'
    | 'authoring'
    | 'recorded'
    | 'facade'
    | 'elements'
    | 'selected'
    | 'locked'
    | 'hidden'
    | 'active'
    | 'photos'
    | 'photo'
    | 'unsaved'
    | 'reviewReady'
    | 'discardInput'
    | 'publishErrors'
    | 'label'
    | 'choose'
  > &
  Pick<
    ModelCommitBindings,
    'commit' | 'applyWall' | 'updateElements' | 'patch' | 'tryAction'
  > &
  Pick<
    ModelDetailCommandsBindings,
    'stamp' | 'duplicate' | 'remove' | 'add' | 'editPattern'
  > &
  Pick<
    ModelEditingControlsBindings,
    'field' | 'onRoofDraft' | 'onRoofApply' | 'switchMode'
  > &
  Pick<
    ModelSelectionActionsBindings,
    'grouped' | 'ungroupSelection' | 'detachSelectedInstance'
  >;
export function ModelPropertyInspector(props: Props) {
  const {
    edit,
    data,
    selection,
    onSelection,
    workspace,
    compact,
    panel,
    setTouchTool,
    openPanel,
    mode,
    setSelected,
    tab,
    before,
    setBefore,
    setMeshPreview,
    meshSelection,
    setMeshSelection,
    previewScene,
    roofDraft,
    webglUnavailable,
    conversion,
    setConversion,
    draft,
    feature,
    walls,
    activeWall,
    visual,
    metrics,
    recorded,
    selected,
    active,
    unsaved,
    discardInput,
    label,
    choose,
    commit,
    tryAction,
    onRoofDraft,
    onRoofApply,
    switchMode,
  } = props;
  return (
    <Panel
      id="properties"
      className="model-layout-panel"
      defaultSize="320px"
      minSize={compact ? 0 : '260px'}
      maxSize="480px"
      collapsible
    >
      <aside className="model-inspector" aria-label="Model detail properties">
        <div className="model-property-target">
          <h3 className="model-panel-title">Properties</h3>
          <p>
            {mode === 'details'
              ? selected.length
                ? `${selected.length} selected · ${active ? label(active) : 'Details'}`
                : walls.find((w) => w.wallId === activeWall)?.label ||
                  'Choose a wall'
              : mode === 'mesh'
                ? 'Mesh objects and components'
                : mode === 'outline'
                  ? 'Building footprint'
                  : mode === 'review'
                    ? 'Building review'
                    : selection?.wallId
                      ? walls.find((w) => w.wallId === selection.wallId)?.label
                      : selection?.partId
                        ? `Wing ${buildingTopology(feature).parts.findIndex((p) => p.id === selection.partId) + 1} · ${mode === 'roof' ? (selection.elementId ? 'Roof text' : 'Roof') : 'defaults'}`
                        : 'Whole building · defaults'}
          </p>
        </div>
        <div className="model-properties-body">
          <ModelCanvasControls {...props} />
          {(mode === 'appearance' || mode === 'roof') && (
            <div data-mobile-panel="mode">
              <BuildingAppearanceEditor
                embedded
                workspace={workspace}
                edit={draft}
                data={data}
                mode={mode}
                onMode={switchMode}
                selection={
                  selection || {
                    buildingId: edit.id,
                    partId: metrics?.partId,
                    wallId: activeWall,
                  }
                }
                onSelection={(next) => {
                  setSelected([]);
                  const id =
                    next.wallId ||
                    (next.partId !== metrics?.partId
                      ? walls.find((w) => w.partId === next.partId)?.wallId
                      : undefined);
                  if (id && id !== activeWall) choose(id);
                  onSelection(next);
                }}
                onEdit={(next) => commit(next)}
                onHeightEdit={(next) => commit(next, true)}
                roofDraft={roofDraft}
                onRoofDraft={onRoofDraft}
                onApplyRoof={onRoofApply}
              />
            </div>
          )}
          {mode === 'mesh' && (
            <Suspense fallback={<p>Loading mesh tools…</p>}>
              <ModelMeshPanel
                edit={draft}
                data={data}
                scene={previewScene}
                selection={meshSelection}
                onSelection={setMeshSelection}
                onCommit={(next) => commit(next, true)}
                onPreview={setMeshPreview}
                workspace={workspace}
                view={tab}
                disabled={before || webglUnavailable}
              />
            </Suspense>
          )}
          {mode === 'outline' && (
            <div data-mobile-panel="mode">
              <ModelOutlineCanvas
                edit={draft}
                workspace={workspace}
                onCommit={(next) => commit(next, true)}
              />
            </div>
          )}
          <ModelRecoveryReview {...props} />
          {compact && panel === 'more' && mode === 'details' && (
            <div className="model-more-shortcuts">
              <ModelButton
                variant="outline"
                onClick={() => {
                  setBefore((v) => !v);
                  openPanel('none');
                }}
              >
                {before ? 'Show changes' : 'Before / after'}
              </ModelButton>
              <ModelButton
                variant="outline"
                onClick={() => {
                  openPanel('walls');
                  setTouchTool('multi');
                }}
              >
                Multi-select
              </ModelButton>
              {!recorded && !conversion && (
                <ModelButton
                  variant="outline"
                  onClick={() => {
                    tryAction(() =>
                      setConversion(
                        editableFacade(feature, activeWall, visual),
                      ),
                    );
                    openPanel('more');
                  }}
                >
                  Preview editable layout
                </ModelButton>
              )}
              {unsaved && (
                <ModelButton
                  variant="outline"
                  icon={<ActionRotateCcw />}
                  onClick={discardInput}
                >
                  Discard unfinished input
                </ModelButton>
              )}
            </div>
          )}
          <ModelDetailProperties {...props} />
          {mode !== 'details' && (
            <p>
              Select Details to edit individual architectural elements. Roof and
              footprint changes may require another wall review.
            </p>
          )}
        </div>
      </aside>
    </Panel>
  );
}
