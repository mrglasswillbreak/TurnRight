import { Group, Panel, Separator } from 'react-resizable-panels';
import { buildingTopology } from './building-surfaces';
import { modelTree } from './model-tree';
import { ModelStructureTree } from './ModelStructureTree';

import { ModelPropertyInspector } from './ModelPropertyInspector';
import { ModelWorkspaceStage } from './ModelWorkspaceStage';
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
  | 'modelLayout'
  | 'modelDefaultLayout'
  | 'modelPanels'
  | 'modelPanelsElement'
  | 'modelPanelsInitialized'
  | 'landscape'
  | 'setStructureOpen'
  | 'reviewOpen'
  | 'setReviewOpen'
  | 'setContextPoint'
  | 'panel'
  | 'setDetent'
  | 'setTouchTool'
  | 'setPlanHost'
  | 'shell'
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
  | 'referenceLayout'
  | 'setMeshPreview'
  | 'meshSelection'
  | 'setMeshSelection'
  | 'previewScene'
  | 'setPreviewScene'
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
  | 'reference'
  | 'setReference'
  | 'setPhotoId'
  | 'surfaceFrame'
  | 'surfacePreview'
  | 'webglUnavailable'
  | 'setWebglUnavailable'
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
    | 'generatedFacades'
    | 'facade'
    | 'sourceElements'
    | 'elements'
    | 'selected'
    | 'locked'
    | 'hidden'
    | 'renderedFeature'
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
    'field' | 'onRoofDraft' | 'onRoofApply' | 'switchMode' | 'selectTreeTarget'
  > &
  Pick<
    ModelSelectionActionsBindings,
    | 'selectionActions'
    | 'showContextActions'
    | 'grouped'
    | 'ungroupSelection'
    | 'detachSelectedInstance'
  >;
export function ModelWorkspaceLayout(props: Props) {
  const {
    edit,
    selection,
    compact,
    modelLayout,
    modelDefaultLayout,
    modelPanels,
    modelPanelsElement,
    modelPanelsInitialized,
    mode,
    meshSelection,
    pending,
    draft,
    feature,
    walls,
    activeWall,
    authoring,
    generatedFacades,
    sourceElements,
    selected,
    locked,
    hidden,
    selectTreeTarget,
  } = props;
  return (
    <Group
      className="model-layout"
      groupRef={modelPanels}
      elementRef={modelPanelsElement}
      orientation="horizontal"
      disabled={compact}
      defaultLayout={modelDefaultLayout.current}
      onLayoutChanged={(sizes) => {
        if (!compact && modelPanelsInitialized.current)
          modelLayout.update((old) => ({
            ...old,
            sizes: {
              ...old.sizes,
              'model:desktop': {
                ...old.sizes['model:desktop'],
                ...Object.fromEntries(
                  Object.entries(sizes).filter(
                    ([id, size]) => id !== 'model' && size > 0,
                  ),
                ),
              },
            },
          }));
      }}
    >
      <Panel
        id="structure"
        className="model-layout-panel"
        defaultSize="260px"
        minSize={compact ? 0 : '180px'}
        maxSize="400px"
        collapsible
      >
        <aside
          id="model-structure"
          className="model-hierarchy"
          aria-label="Building hierarchy"
        >
          <h3 className="model-panel-title">Structure</h3>
          <ModelStructureTree
            nodes={modelTree({
              objects: draft.properties.modelDocument?.objects,
              name: String(edit.properties.name || 'Building'),
              topology: buildingTopology(feature),
              walls,
              facades: {
                ...generatedFacades,
                ...draft.properties.appearance?.facades,
              },
              generatedWalls: Object.keys(generatedFacades).filter(
                (id) => pending?.wallId !== id,
              ),
              roofTexts: draft.properties.appearance?.roofTexts,
              authoring,
              activeWall,
              elements: sourceElements,
              locked,
              hidden,
            })}
            selected={
              mode === 'mesh'
                ? meshSelection
                  ? [`mesh:${meshSelection.objectId}`]
                  : []
                : mode === 'outline'
                  ? ['footprint']
                  : mode === 'roof' && selection?.partId
                    ? [
                        selection.elementId
                          ? `roof-text:${selection.elementId}`
                          : `roof:${selection.partId}`,
                      ]
                    : mode === 'appearance'
                      ? [
                          selection?.wallId
                            ? `wall:${selection.wallId}`
                            : selection?.partId
                              ? `part:${selection.partId}`
                              : 'building',
                        ]
                      : selected.length
                        ? selected.map((id) => `detail:${activeWall}:${id}`)
                        : [`wall:${activeWall}`]
            }
            onSelect={selectTreeTarget}
          />
        </aside>
      </Panel>
      <Separator
        className="workspace-separator model-pane-divider"
        aria-label="Resize model structure"
      />
      <ModelWorkspaceStage {...props} />
      <Separator
        className="workspace-separator model-pane-divider"
        aria-label="Resize model properties"
      />
      <ModelPropertyInspector {...props} />
    </Group>
  );
}
