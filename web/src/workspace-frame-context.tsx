import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  readLayout,
  writeLayout,
  layoutKey,
  viewportClass,
  type LayoutPreference,
  type PaneId,
} from './editor-layout';
import type { WorkspaceCapabilities } from './gis-types';
export function useWorkspaceLayout(
  owner: string,
  campus: string,
  access?: WorkspaceCapabilities,
) {
  const key = layoutKey(owner, campus);
  const [resetRevision, setResetRevision] = useState(0);
  const [stored, setStored] = useState(() => ({
    key,
    value: readLayout(key, access),
  }));
  if (stored.key !== key) setStored({ key, value: readLayout(key, access) });
  const value = stored.value;
  const update = useCallback(
    (
      change:
        | Partial<LayoutPreference>
        | ((old: LayoutPreference) => LayoutPreference),
    ) => {
      setStored((previous) => {
        const old =
          previous.key === key ? previous.value : readLayout(key, access);
        const next =
          typeof change === 'function' ? change(old) : { ...old, ...change };
        if (JSON.stringify(old) === JSON.stringify(next)) return previous;
        if (next.workspace !== old.workspace)
          next.workspaces = {
            ...old.workspaces,
            [viewportClass()]: next.workspace,
          };
        writeLayout(key, next);
        return { key, value: next };
      });
    },
    [key, access],
  );
  const reset = useCallback(() => {
    update({ legend: true, sizes: {}, collapsed: {} });
    setResetRevision((v) => v + 1);
  }, [update]);
  return { value, update, reset, resetRevision };
}

export type LayoutController = ReturnType<typeof useWorkspaceLayout>;

export interface FrameContext {
  layout: LayoutController;
  hosts: Partial<Record<PaneId, HTMLElement | null>>;
  register: (id: PaneId, title: string) => () => void;
  reveal: (id: PaneId | 'map') => void;
}

export const Context = createContext<FrameContext | null>(null);

export const useFrameLayout = () => useContext(Context)?.layout;

export const useWorkspaceView = () => useContext(Context)?.reveal;

export function WorkspacePane({
  id,
  title,
  children,
  className = '',
  enabled = true,
}: {
  enabled?: boolean;
  id: PaneId;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const frame = useContext(Context);
  const register = frame?.register;
  useLayoutEffect(
    () => (enabled ? register?.(id, title) : undefined),
    [register, id, title, enabled],
  );
  const content = (
    <div className={`workspace-pane-content ${className}`}>{children}</div>
  );
  return frame && enabled
    ? frame.hosts[id]
      ? createPortal(content, frame.hosts[id]!)
      : null
    : content;
}
