import { Dialog } from '@/components/ui/dialog';
import { Menu } from '@base-ui/react/menu';
import { ModelMobileContext } from './model-mobile';
import { ModelSurfaceContext } from './model-surface';

import { WorkspaceProps } from './model-workspace-shared';

import { ModelWorkspaceDialog } from './ModelWorkspaceDialog';
import { useModelCommit } from './useModelCommit';
import { useModelDetailCommands } from './useModelDetailCommands';
import { useModelEditingControls } from './useModelEditingControls';
import { useModelSelectionActions } from './useModelSelectionActions';
import { useModelWorkspaceSelection } from './useModelWorkspaceSelection';
import { useModelWorkspaceState } from './useModelWorkspaceState';

export function ModelWorkspace(props: WorkspaceProps) {
  const modelWorkspaceStateBindings = useModelWorkspaceState(props);
  const {
    selection,
    onClose,
    compact,
    actionMenuOpen,
    setActionMenuOpen,
    actionFocus,
    contextReturn,
    contextPoint,
    touchTool,
    setTouchTool,
    planHost,
    shell,
    openPanel,
    mode,
    tab,
    setSurfacePreview,
    webglUnavailable,
    receiveSurfaceFrame,
  } = modelWorkspaceStateBindings;
  const modelWorkspaceSelectionBindings = useModelWorkspaceSelection({
    ...modelWorkspaceStateBindings,
  });
  const { activeWall, selected, active, label } =
    modelWorkspaceSelectionBindings;
  const modelCommitBindings = useModelCommit({
    ...modelWorkspaceStateBindings,
    ...modelWorkspaceSelectionBindings,
  });
  const modelDetailCommandsBindings = useModelDetailCommands({
    ...modelWorkspaceStateBindings,
    ...modelWorkspaceSelectionBindings,
    ...modelCommitBindings,
  });
  const modelEditingControlsBindings = useModelEditingControls({
    ...modelWorkspaceStateBindings,
    ...modelWorkspaceSelectionBindings,
    ...modelCommitBindings,
  });
  const modelSelectionActionsBindings = useModelSelectionActions({
    ...modelWorkspaceStateBindings,
    ...modelWorkspaceSelectionBindings,
    ...modelCommitBindings,
    ...modelDetailCommandsBindings,
  });
  const { dismissActions, actions } = modelSelectionActionsBindings;
  return (
    <ModelSurfaceContext
      value={{
        active: tab === 'surface' && mode !== 'mesh' && !webglUnavailable,
        revision: `${mode}:${activeWall}:${selection?.partId || ''}`,
        onFrame: receiveSurfaceFrame,
        onPreview: setSurfacePreview,
      }}
    >
      <ModelMobileContext
        value={{
          compact,
          tool: touchTool,
          setTool: setTouchTool,
          openPanel,
          planHost,
        }}
      >
        <Menu.Root
          open={actionMenuOpen}
          onOpenChange={setActionMenuOpen}
          modal={false}
        >
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open) onClose();
            }}
          >
            <ModelWorkspaceDialog
              {...modelWorkspaceStateBindings}
              {...modelWorkspaceSelectionBindings}
              {...modelCommitBindings}
              {...modelDetailCommandsBindings}
              {...modelEditingControlsBindings}
              {...modelSelectionActionsBindings}
            />
            <Menu.Portal>
              <Menu.Positioner
                anchor={
                  contextPoint
                    ? {
                        getBoundingClientRect: () =>
                          new DOMRect(contextPoint.x, contextPoint.y, 0, 0),
                      }
                    : undefined
                }
                side="bottom"
                align="start"
                sideOffset={4}
                collisionPadding={8}
                style={{ zIndex: 100 }}
              >
                <Menu.Popup
                  className="model-action-menu"
                  aria-label="Detail actions"
                  onKeyDownCapture={dismissActions}
                  finalFocus={() => {
                    const target = actionFocus.current;
                    actionFocus.current = null;
                    if (
                      !target &&
                      contextPoint &&
                      contextReturn.current?.isConnected
                    ) {
                      // The menu library restores HTML focus only; our keyboard canvas is SVG.
                      contextReturn.current.focus();
                      return false;
                    }
                    return target
                      ? shell.current?.querySelector<HTMLElement>(target) ||
                          true
                      : true;
                  }}
                >
                  <p>
                    {selected.length === 1 && active
                      ? label(active)
                      : `${selected.length} details selected`}
                  </p>
                  {actions.map((action) => (
                    <Menu.Item
                      aria-label={action.name}
                      key={action.name}
                      disabled={action.disabled}
                      onClick={action.run}
                      className={
                        action.name === 'Delete'
                          ? 'model-menu-danger'
                          : undefined
                      }
                    >
                      <span>{action.name}</span>
                      {action.shortcut && <kbd>{action.shortcut}</kbd>}
                    </Menu.Item>
                  ))}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Dialog>
        </Menu.Root>
      </ModelMobileContext>
    </ModelSurfaceContext>
  );
}
