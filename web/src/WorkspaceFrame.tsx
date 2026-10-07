import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Group, Panel, Separator, useGroupRef } from 'react-resizable-panels';
import {
  Maximize2,
  Minimize2,
  PanelLeft,
  PanelRight,
  PanelBottom,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  readLayout,
  writeLayout,
  layoutKey,
  viewportClass,
  type LayoutPreference,
  type PaneId,
  type WorkspaceId,
} from './editor-layout';
import type { WorkspaceCapabilities } from './gis-types';
import './workspace-frame.css';

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
type LayoutController = ReturnType<typeof useWorkspaceLayout>;
interface FrameContext {
  layout: LayoutController;
  hosts: Partial<Record<PaneId, HTMLElement | null>>;
  register: (id: PaneId, title: string) => () => void;
}
const Context = createContext<FrameContext | null>(null);
export const useFrameLayout = () => useContext(Context)?.layout;
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
const paneLabels = {
  left: 'Explorer',
  right: 'Properties',
  bottom: 'Table and activity',
};
export function WorkspaceFrame({
  children,
  layout,
  workspace,
  tools,
  activity,
  suspendPanes = false,
}: {
  suspendPanes?: boolean;
  activity?: ReactNode;
  children: ReactNode;
  layout: LayoutController;
  workspace: WorkspaceId | 'photo';
  tools?: ReactNode;
}) {
  const [hosts, setHosts] = useState<FrameContext['hosts']>({});
  const [present, setPresent] = useState<Partial<Record<PaneId, string>>>({});
  const [focus, setFocus] = useState(false);
  const [maximized, setMaximized] = useState<PaneId | null>(null);
  const [compact, setCompact] = useState(() => innerWidth < 1200);
  const [active, setActive] = useState<PaneId>(
    workspace === 'gis-data' ? 'bottom' : 'left',
  );
  const columns = useGroupRef();
  const rows = useGroupRef();
  const columnsElement = useRef<HTMLDivElement>(null);
  const scope = `${workspace}:${compact ? 'compact' : 'desktop'}`;
  const sizes = layout.value.sizes[scope];
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const register = useCallback((id: PaneId, title: string) => {
    setPresent((old) => ({ ...old, [id]: title }));
    setActive((old) =>
      workspaceRef.current === 'gis-data' && id !== 'bottom' ? old : id,
    );
    return () =>
      setPresent((old) => {
        const next = { ...old };
        delete next[id];
        return next;
      });
  }, []);
  useEffect(() => {
    const media = matchMedia('(max-width: 1199px)');
    const change = () => setCompact(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const show = (id: PaneId) =>
    !!present[id] &&
    !suspendPanes &&
    !focus &&
    !(layout.value.collapsed[`${scope}:${id}`] ?? layout.value.collapsed[id]) &&
    (!compact || id === active);
  useEffect(() => {
    if (compact && !present[active])
      setActive(present.bottom ? 'bottom' : present.right ? 'right' : 'left');
  }, [compact, present, active]);
  const left = show('left'),
    right = show('right'),
    bottom = show('bottom');
  const maximizedVisible = !!maximized && show(maximized);
  useEffect(() => setMaximized(null), [workspace]);
  useEffect(() => {
    setFocus(false);
    setMaximized(null);
  }, [layout.resetRevision]);
  const initialized = useRef(false);
  const sizesRef = useRef(sizes);
  sizesRef.current = sizes;
  useLayoutEffect(() => {
    initialized.current = false;
    const frame = requestAnimationFrame(() => {
      const width = Math.max(
        1,
        (columnsElement.current?.clientWidth || innerWidth) -
          (left ? 5 : 0) -
          (right ? 5 : 0),
      );
      const leftSize =
        left && !compact ? sizesRef.current?.left || (260 / width) * 100 : 0;
      const rightSize =
        right && !compact ? sizesRef.current?.right || (320 / width) * 100 : 0;
      columns.current?.setLayout({
        left: leftSize,
        centre: Math.max(1, 100 - leftSize - rightSize),
        right: rightSize,
      });
      const bottomSize = bottom ? sizesRef.current?.bottom || 45 : 0;
      rows.current?.setLayout({ canvas: 100 - bottomSize, bottom: bottomSize });
      initialized.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [
    left,
    right,
    bottom,
    scope,
    compact,
    layout.resetRevision,
    columns,
    rows,
  ]);
  const save = (values: Record<string, number>) => {
    if (!initialized.current || compact || focus || maximized) return;
    const visible = { left, right, bottom, centre: true, canvas: true };
    const saved = Object.fromEntries(
      Object.entries(values).filter(
        ([id, value]) => visible[id as keyof typeof visible] && value > 0,
      ),
    );
    layout.update((old) => ({
      ...old,
      sizes: { ...old.sizes, [scope]: { ...old.sizes[scope], ...saved } },
    }));
  };
  const hostRefs = useMemo(
    () =>
      Object.fromEntries(
        (['left', 'right', 'bottom'] as const).map((id) => [
          id,
          (node: HTMLDivElement | null) =>
            setHosts((old) =>
              old[id] === node ? old : { ...old, [id]: node },
            ),
        ]),
      ) as Record<PaneId, (node: HTMLDivElement | null) => void>,
    [],
  );
  const toggle = (id: PaneId) => {
    setFocus(false);
    setMaximized(null);
    setActive(id);
    layout.update((old) => ({
      ...old,
      collapsed: {
        ...old.collapsed,
        [`${scope}:${id}`]:
          compact && active !== id
            ? false
            : !(old.collapsed[`${scope}:${id}`] ?? old.collapsed[id]),
      },
    }));
  };
  const pane = (id: PaneId) => (
    <section
      className="workspace-pane"
      aria-label={present[id] || paneLabels[id]}
      inert={maximizedVisible && maximized !== id}
      data-pane={id}
      data-open={show(id)}
      data-maximized={maximized === id && show(id)}
    >
      <header className="workspace-pane-heading">
        <strong>{present[id] || paneLabels[id]}</strong>
        <div>
          <button
            aria-label={`${maximized === id ? 'Restore' : 'Maximize'} ${id === 'bottom' ? 'table' : paneLabels[id].toLowerCase()}`}
            onClick={() => setMaximized(maximized === id ? null : id)}
          >
            {maximized === id ? (
              <Minimize2 size={15} />
            ) : (
              <Maximize2 size={15} />
            )}
          </button>
          <button
            aria-label={`Collapse ${paneLabels[id].toLowerCase()}`}
            onClick={() => toggle(id)}
          >
            <X size={15} />
          </button>
        </div>
      </header>
      <div className="workspace-pane-host" ref={hostRefs[id]} />
    </section>
  );
  return (
    <Context value={{ hosts, register, layout }}>
      <div
        className="workspace-frame"
        data-compact={compact}
        data-focus={focus}
        data-maximized={maximizedVisible}
      >
        <div className="workspace-commandbar">
          <div className="workspace-context-tools">{tools}</div>
          <div className="workspace-layout-tools">
            {activity}
            {(
              [
                ['left', PanelLeft],
                ['right', PanelRight],
                ['bottom', PanelBottom],
              ] as const
            ).map(([id, Icon]) => (
              <button
                key={id}
                disabled={suspendPanes || !present[id]}
                aria-label={`Toggle ${paneLabels[id].toLowerCase()}`}
                title={paneLabels[id]}
                aria-pressed={show(id)}
                onClick={() => toggle(id)}
              >
                <Icon size={17} />
              </button>
            ))}
            <button
              title="Focus canvas"
              aria-label="Focus canvas"
              aria-pressed={focus}
              onClick={() => {
                setMaximized(null);
                setFocus(!focus);
              }}
            >
              <Maximize2 size={17} />
            </button>
            <button
              title="Reset layout"
              aria-label="Reset layout"
              onClick={() => {
                layout.reset();
                setFocus(false);
                setMaximized(null);
              }}
            >
              <RotateCcw size={17} />
            </button>
          </div>
        </div>
        <Group
          groupRef={columns}
          elementRef={columnsElement}
          className="workspace-columns"
          orientation="horizontal"
          onLayoutChanged={save}
        >
          <Panel
            id="left"
            defaultSize="260px"
            minSize={compact ? 0 : '200px'}
            maxSize="400px"
            collapsible
          >
            {pane('left')}
          </Panel>
          <Separator
            className="workspace-separator"
            data-visible={left && !compact}
            aria-label="Resize explorer"
          />
          <Panel id="centre" minSize={compact ? '0%' : '350px'}>
            <Group
              groupRef={rows}
              orientation="vertical"
              className="workspace-rows"
              onLayoutChanged={save}
            >
              <Panel id="canvas" minSize="25%">
                <div className="workspace-canvas" inert={maximizedVisible}>
                  {children}
                </div>
              </Panel>
              <Separator
                className="workspace-separator horizontal"
                data-visible={bottom}
                aria-label="Resize table and activity"
              />
              <Panel
                id="bottom"
                defaultSize="0%"
                minSize="140px"
                maxSize="75%"
                collapsible
              >
                {pane('bottom')}
              </Panel>
            </Group>
          </Panel>
          <Separator
            className="workspace-separator"
            data-visible={right && !compact}
            aria-label="Resize properties"
          />
          <Panel
            id="right"
            defaultSize="320px"
            minSize={compact ? 0 : '260px'}
            maxSize="480px"
            collapsible
          >
            {pane('right')}
          </Panel>
        </Group>
      </div>
    </Context>
  );
}
