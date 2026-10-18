import { Menu } from '@base-ui/react/menu';
import { type KeyboardEvent } from 'react';
import { detachInstance } from './model-authoring';
import {
  detailInstanceSelection,
  toggleDetailInstanceFlags,
} from './model-instances';

import type { ModelCommitBindings } from './useModelCommit';
import type { ModelDetailCommandsBindings } from './useModelDetailCommands';
import type { ModelWorkspaceSelectionBindings } from './useModelWorkspaceSelection';
import type { ModelWorkspaceStateBindings } from './useModelWorkspaceState';
type Inputs = Pick<
  ModelWorkspaceStateBindings,
  | 'compact'
  | 'actionMenuOpen'
  | 'setActionMenuOpen'
  | 'actionFocus'
  | 'contextReturn'
  | 'setContextPoint'
  | 'shell'
  | 'openPanel'
  | 'setSelected'
  | 'instance'
  | 'setInstance'
  | 'before'
  | 'hiddenItems'
  | 'setHidden'
  | 'lockedItems'
  | 'setLocked'
  | 'clipboard'
  | 'setClipboard'
  | 'setPaste'
  | 'setTargetWall'
> &
  Pick<
    ModelWorkspaceSelectionBindings,
    | 'draft'
    | 'activeWall'
    | 'authoring'
    | 'sourceElements'
    | 'elements'
    | 'selected'
    | 'locked'
    | 'hidden'
    | 'active'
  > &
  Pick<ModelCommitBindings, 'commit' | 'updateElements' | 'tryAction'> &
  Pick<ModelDetailCommandsBindings, 'stamp' | 'duplicate' | 'remove'>;
export function useModelSelectionActions({
  compact,
  actionMenuOpen,
  setActionMenuOpen,
  actionFocus,
  contextReturn,
  setContextPoint,
  shell,
  openPanel,
  setSelected,
  instance,
  setInstance,
  before,
  hiddenItems,
  setHidden,
  lockedItems,
  setLocked,
  clipboard,
  setClipboard,
  setPaste,
  setTargetWall,
  draft,
  activeWall,
  authoring,
  sourceElements,
  elements,
  selected,
  locked,
  hidden,
  active,
  commit,
  updateElements,
  tryAction,
  stamp,
  duplicate,
  remove,
}: Inputs) {
  const selectionActions = (
    <Menu.Trigger
      className="model-selection-menu-trigger"
      aria-label="Selected detail actions"
      onClick={() => setContextPoint(null)}
    >
      ⋯
    </Menu.Trigger>
  );
  const showContextActions = (x: number, y: number) => {
    actionFocus.current = null;
    contextReturn.current = document.activeElement as HTMLElement | null;
    setContextPoint({ x, y });
    setActionMenuOpen(true);
  };
  const dismissActions = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !actionMenuOpen) return;
    // Context menus may open while the SVG canvas still owns keyboard focus.
    event.preventDefault();
    event.stopPropagation();
    setActionMenuOpen(false);
  };
  const grouped = authoring.groups.some(
    (g) =>
      g.wallId === activeWall &&
      g.members.some((id) =>
        selected.some(
          (s) =>
            s === id ||
            detailInstanceSelection(sourceElements, s).elementId === id,
        ),
      ),
  );
  const ungroupSelection = () =>
    commit({
      ...draft,
      properties: {
        ...draft.properties,
        modelAuthoring: {
          ...authoring,
          groups: authoring.groups.filter(
            (g) =>
              g.wallId !== activeWall ||
              !g.members.some((id) =>
                selected.some(
                  (s) =>
                    s === id ||
                    detailInstanceSelection(sourceElements, s).elementId === id,
                ),
              ),
          ),
        },
      },
    });
  const detachSelectedInstance = () =>
    tryAction(() => {
      if (!active || active.count <= 1 || locked.includes(active.id)) return;
      const next = detachInstance(elements, active.id, instance);
      if (updateElements(next.elements)) {
        setSelected([next.detachedId]);
        setInstance(0);
      }
    });
  const actions = [
    {
      name: 'Edit details',
      shortcut: 'Enter',
      disabled: !selected.length,
      run: () => {
        actionFocus.current = compact
          ? '.model-sheet-handle'
          : '[aria-label="Detail name"]';
        if (compact) openPanel('edit');
        else
          shell.current
            ?.querySelector<HTMLInputElement>('[aria-label="Detail name"]')
            ?.focus();
      },
    },
    {
      name: 'Duplicate',
      shortcut: 'Ctrl+D',
      disabled: before || !selected.length,
      run: duplicate,
    },
    {
      name: 'Ungroup',
      disabled:
        before || !grouped || selected.some((id) => locked.includes(id)),
      run: ungroupSelection,
    },
    {
      name: 'Detach selected instance',
      disabled:
        before ||
        selected.length !== 1 ||
        !active ||
        active.count <= 1 ||
        locked.includes(active.id),
      run: detachSelectedInstance,
    },
    {
      name: 'Copy',
      shortcut: 'Ctrl+C',
      disabled: !selected.length,
      run: () => setClipboard(stamp()),
    },
    {
      name: 'Paste / copy to…',
      shortcut: 'Ctrl+V',
      disabled: before || !clipboard,
      run: () => {
        actionFocus.current = '[aria-label="Target building"]';
        setPaste(clipboard);
        setTargetWall(activeWall);
      },
    },
    {
      name: selected.every((id) => locked.includes(id)) ? 'Unlock' : 'Lock',
      disabled: !selected.length,
      run: () =>
        setLocked(
          toggleDetailInstanceFlags(sourceElements, lockedItems, selected),
        ),
    },
    {
      name: selected.every((id) => hidden.includes(id))
        ? 'Show in editor'
        : 'Hide in editor',
      disabled: !selected.length,
      run: () =>
        setHidden(
          toggleDetailInstanceFlags(sourceElements, hiddenItems, selected),
        ),
    },
    {
      name: 'Select all details',
      shortcut: 'Ctrl+A',
      disabled: !elements.length,
      run: () => setSelected(elements.map((e) => e.id)),
    },
    {
      name: 'Clear selection',
      disabled: !selected.length,
      run: () => setSelected([]),
    },
    {
      name: 'Add another detail',
      disabled: before,
      run: () => {
        actionFocus.current = compact
          ? '.model-sheet-handle'
          : '.model-add-tools button';
        if (compact) openPanel('add');
        else
          shell.current
            ?.querySelector<HTMLButtonElement>('.model-add-tools button')
            ?.focus();
      },
    },
    {
      name: 'Delete',
      shortcut: 'Del',
      disabled: before || !selected.some((id) => !locked.includes(id)),
      run: remove,
    },
  ];
  return {
    selectionActions,
    showContextActions,
    dismissActions,
    grouped,
    ungroupSelection,
    detachSelectedInstance,
    actions,
  };
}
export type ModelSelectionActionsBindings = ReturnType<
  typeof useModelSelectionActions
>;
