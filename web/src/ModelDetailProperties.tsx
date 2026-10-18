import { Menu } from '@base-ui/react/menu';
import { Plus as ActionPlus } from 'lucide-react';
import { layoutElements } from './model-authoring';
import { kinds } from './model-workspace-shared';
import { ModelButton } from './ModelButton';

import { ModelDetailFields } from './ModelDetailFields';
import { ModelPatternProperties } from './ModelPatternProperties';
import { ModelWallReview } from './ModelWallReview';
import type { ModelCommitBindings } from './useModelCommit';
import type { ModelDetailCommandsBindings } from './useModelDetailCommands';
import type { ModelEditingControlsBindings } from './useModelEditingControls';
import type { ModelSelectionActionsBindings } from './useModelSelectionActions';
import type { ModelWorkspaceSelectionBindings } from './useModelWorkspaceSelection';
import type { ModelWorkspaceStateBindings } from './useModelWorkspaceState';
type Props = Pick<
  ModelWorkspaceStateBindings,
  | 'edit'
  | 'workspace'
  | 'compact'
  | 'reviewOpen'
  | 'setReviewOpen'
  | 'setContextPoint'
  | 'panel'
  | 'openPanel'
  | 'mode'
  | 'setSelected'
  | 'instance'
  | 'setInstance'
  | 'setTab'
  | 'before'
  | 'grid'
  | 'setGrid'
  | 'setWholeRows'
  | 'setPaste'
  | 'name'
  | 'setName'
  | 'pattern'
  | 'setPattern'
  | 'patternId'
  | 'setPatternId'
  | 'setTargetWall'
> &
  Pick<
    ModelWorkspaceSelectionBindings,
    | 'draft'
    | 'feature'
    | 'activeWall'
    | 'metrics'
    | 'authoring'
    | 'facade'
    | 'elements'
    | 'selected'
    | 'locked'
    | 'active'
    | 'photos'
    | 'photo'
    | 'label'
  > &
  Pick<
    ModelCommitBindings,
    'commit' | 'applyWall' | 'updateElements' | 'patch'
  > &
  Pick<ModelDetailCommandsBindings, 'stamp' | 'add' | 'editPattern'> &
  Pick<ModelEditingControlsBindings, 'field'> &
  Pick<
    ModelSelectionActionsBindings,
    'grouped' | 'ungroupSelection' | 'detachSelectedInstance'
  >;
export function ModelDetailProperties(props: Props) {
  const {
    compact,
    setContextPoint,
    panel,
    openPanel,
    mode,
    setTab,
    before,
    grid,
    setGrid,
    metrics,
    elements,
    selected,
    locked,
    updateElements,
    add,
  } = props;
  return (
    mode === 'details' &&
    metrics && (
      <>
        <label>
          Snap grid
          <select
            value={grid}
            onChange={(e) => setGrid(Number(e.target.value))}
          >
            <option value={0.01}>0.01 m</option>
            <option value={0.1}>0.1 m</option>
            <option value={1}>1 m</option>
          </select>
        </label>
        <div className="model-add-tools">
          {kinds.map((k) => (
            <ModelButton
              variant="outline"
              icon={<ActionPlus />}
              key={k}
              disabled={before}
              onClick={() => {
                add(k);
                if (compact) {
                  setTab((view) => (view === 'surface' ? view : 'surface'));
                  openPanel('none');
                }
              }}
            >
              Add {k}
            </ModelButton>
          ))}
        </div>
        {compact && panel === 'more' && (
          <Menu.Trigger
            className="model-detail-actions"
            onClick={() => setContextPoint(null)}
          >
            Selection actions
          </Menu.Trigger>
        )}
        {selected.length > 1 && (
          <div className="model-toolbar">
            {(
              [
                'left',
                'centre',
                'right',
                'bottom',
                'top',
                'distribute',
                'mirror',
              ] as const
            ).map((action) => (
              <ModelButton
                variant="outline"
                key={action}
                onClick={() =>
                  updateElements(
                    layoutElements(
                      elements,
                      selected.filter((id) => !locked.includes(id)),
                      metrics.length,
                      action,
                    ),
                  )
                }
              >
                {action === 'distribute'
                  ? 'Equal gaps'
                  : action === 'mirror'
                    ? 'Mirror layout'
                    : `Align ${action}`}
              </ModelButton>
            ))}
          </div>
        )}
        <ModelDetailFields {...props} metrics={metrics} />
        <ModelPatternProperties {...props} />
        <ModelWallReview {...props} metrics={metrics} />
      </>
    )
  );
}
