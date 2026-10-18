import { Check as ActionCheck, X as ActionX } from 'lucide-react';
import { editableFacade } from './model-authoring';
import { ModelPlanPortal } from './model-mobile';
import { ModelButton } from './ModelButton';
import { ModelWallCanvas } from './ModelWallCanvas';

import type { ModelCommitBindings } from './useModelCommit';
import type { ModelDetailCommandsBindings } from './useModelDetailCommands';
import type { ModelEditingControlsBindings } from './useModelEditingControls';
import type { ModelWorkspaceSelectionBindings } from './useModelWorkspaceSelection';
import type { ModelWorkspaceStateBindings } from './useModelWorkspaceState';

type Props = Pick<
  ModelWorkspaceStateBindings,
  | 'compact'
  | 'landscape'
  | 'panel'
  | 'initial'
  | 'wallViews'
  | 'mode'
  | 'setSelected'
  | 'setInstance'
  | 'tab'
  | 'before'
  | 'grid'
  | 'pending'
  | 'conversion'
  | 'setConversion'
> &
  Pick<
    ModelWorkspaceSelectionBindings,
    | 'feature'
    | 'original'
    | 'activeWall'
    | 'visual'
    | 'metrics'
    | 'recorded'
    | 'elements'
    | 'selected'
    | 'locked'
    | 'hidden'
    | 'label'
  > &
  Pick<ModelCommitBindings, 'applyWall' | 'updateElements' | 'tryAction'> &
  Pick<ModelDetailCommandsBindings, 'duplicate' | 'remove'> &
  Pick<ModelEditingControlsBindings, 'switchMode'>;
export function ModelCanvasControls(props: Props) {
  const {
    compact,
    landscape,
    panel,
    initial,
    wallViews,
    mode,
    setSelected,
    setInstance,
    tab,
    before,
    grid,
    pending,
    conversion,
    setConversion,
    feature,
    original,
    activeWall,
    visual,
    metrics,
    recorded,
    elements,
    selected,
    locked,
    hidden,
    label,
    applyWall,
    updateElements,
    tryAction,
    duplicate,
    remove,
    switchMode,
  } = props;
  return (
    <div className="model-canvas-controller">
      {mode === 'details' && metrics && (
        <>
          {!recorded && !conversion && (
            <div className="model-notice">
              <p>
                Adding a detail preserves this wall’s generated layout. You can
                also preview and convert it before editing.
              </p>
              <ModelButton
                variant="outline"
                onClick={() =>
                  tryAction(() =>
                    setConversion(editableFacade(feature, activeWall, visual)),
                  )
                }
              >
                Preview editable layout
              </ModelButton>
            </div>
          )}
          {conversion && (
            <div className="model-notice">
              <p>
                Preview: {conversion.elements.reduce((n, e) => n + e.count, 0)}{' '}
                generated details become editable. Existing proportions are
                retained.
              </p>
              <ModelButton
                variant="outline"
                icon={<ActionCheck />}
                onClick={() => applyWall(conversion)}
              >
                Use editable layout
              </ModelButton>
              <ModelButton
                variant="outline"
                icon={<ActionX />}
                onClick={() => setConversion(null)}
              >
                Cancel conversion
              </ModelButton>
            </div>
          )}
          {pending?.wallId === activeWall && (
            <div className="model-notice">
              <p>
                Unfinished wall retained locally. Resolve its placement or
                building errors, then save it.
              </p>
              <ModelButton variant="outline" onClick={() => applyWall(pending)}>
                Save unfinished wall
              </ModelButton>
              <ModelButton
                variant="outline"
                onClick={() => switchMode('appearance')}
              >
                Check building height
              </ModelButton>
            </div>
          )}
          <ModelPlanPortal>
            <ModelWallCanvas
              interactive={
                tab === 'surface' && (!compact || landscape || panel === 'none')
              }
              detailName={label}
              views={wallViews.current}
              key={activeWall}
              metrics={metrics}
              elements={
                before
                  ? initial.current.properties.appearance?.facades?.[activeWall]
                      ?.elements ||
                    editableFacade(original, activeWall, visual).elements
                  : elements
              }
              selected={selected}
              hidden={hidden}
              locked={locked}
              grid={grid}
              onSelect={(ids, i) => {
                setSelected(ids);
                setInstance(i || 0);
              }}
              onCommit={(next) => {
                if (!before) updateElements(next);
              }}
              onDuplicate={duplicate}
              onDelete={remove}
            />
          </ModelPlanPortal>
        </>
      )}
    </div>
  );
}
