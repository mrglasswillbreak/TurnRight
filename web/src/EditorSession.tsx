import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Dataset, WorkspaceCapabilities } from './gis-types';
import {
  attributeInputReference,
  clampedDimensions,
  initialEditorSession,
  type EditorSessionState,
  type EditorTask,
} from './editor-session';

interface Session {
  state: EditorSessionState;
  setState: React.Dispatch<React.SetStateAction<EditorSessionState>>;
  datasets: Dataset[];
  capabilities: WorkspaceCapabilities;
  refresh: () => Promise<void>;
  pending: number;
  navigate: (task: EditorTask) => void;
  settle: () => Promise<boolean>;
  setNavigationGuard: (guard: ((task: EditorTask) => boolean) | null) => void;
  failure: string;
  track: <T>(work: () => Promise<T>) => Promise<T>;
}
const Context = createContext<Session | null>(null);
export function EditorSessionProvider({
  children,
  capabilities,
}: {
  children: ReactNode;
  capabilities: WorkspaceCapabilities;
}) {
  const preference =
    'turnright:editor-layout:' +
    capabilities.userId +
    ':' +
    capabilities.campusId;
  const draftsKey = preference.replace('editor-layout', 'attribute-recovery');
  const [state, setState] = useState<EditorSessionState>(() => {
    const initial = initialEditorSession();
    try {
      initial.dimensions = clampedDimensions(
        JSON.parse(localStorage.getItem(preference) || '{}'),
      );
    } catch {
      /* Defaults remain usable. */
    }
    try {
      const stored = JSON.parse(localStorage.getItem(draftsKey) || '{}');
      initial.attributeDrafts = Object.fromEntries(
        Object.entries(stored)
          .filter(
            ([key, v]) =>
              attributeInputReference(key) &&
              v &&
              typeof v === 'object' &&
              typeof (v as { text?: unknown }).text === 'string' &&
              Number.isInteger((v as { revision?: unknown }).revision),
          )
          .slice(0, 500),
      ) as EditorSessionState['attributeDrafts'];
    } catch {
      /* Ignore malformed recovery. */
    }
    return initial;
  });
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [access, setAccess] = useState(capabilities);
  const [pending, setPending] = useState(0),
    [failure, setFailure] = useState('');
  const request = useRef(0);
  const pendingWork = useRef(new Set<Promise<unknown>>());
  const guard = useRef<((task: EditorTask) => boolean) | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const setNavigationGuard = useCallback(
    (value: ((task: EditorTask) => boolean) | null) => {
      guard.current = value;
    },
    [],
  );
  const settle = useCallback(async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    await Promise.resolve();
    const results = await Promise.allSettled(pendingWork.current);
    return (
      results.every((r) => r.status === 'fulfilled') &&
      !Object.keys(drafts.current).length
    );
  }, []);
  const navigate = useCallback((task: EditorTask) => {
    const focus = document.activeElement as HTMLElement | null;
    focus?.blur();
    if (guard.current && !guard.current(task)) return;
    if (task !== 'map') opener.current = focus;
    setState((s) => ({
      ...s,
      task,
      panel:
        task === 'map'
          ? s.returnPanel || (s.selection.length ? 'inspector' : 'catalogue')
          : 'inspector',
      returnPanel:
        task === 'map' ? undefined : s.task === 'map' ? s.panel : s.returnPanel,
      expanded: false,
    }));
    if (task === 'map')
      requestAnimationFrame(() => {
        if (opener.current?.isConnected) opener.current.focus();
      });
  }, []);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  useEffect(() => setAccess(capabilities), [capabilities]);
  useEffect(() => {
    try {
      localStorage.setItem(preference, JSON.stringify(state.dimensions));
    } catch {
      /* Layout still works this session. */
    }
  }, [preference, state.dimensions]);
  const drafts = useRef(state.attributeDrafts);
  drafts.current = state.attributeDrafts;
  useEffect(() => {
    try {
      localStorage.setItem(draftsKey, JSON.stringify(state.attributeDrafts));
    } catch {
      setFailure('Attribute recovery could not be saved. Keep this tab open.');
    }
  }, [draftsKey, state.attributeDrafts]);
  useEffect(() => {
    const leaving = (event: BeforeUnloadEvent) => {
      if (pendingWork.current.size || Object.keys(drafts.current).length) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', leaving);
    return () => window.removeEventListener('beforeunload', leaving);
  }, []);
  const refresh = useCallback(async () => {
    const generation = ++request.current;
    const { gisApi } = await import('./gis-api');
    try {
      const [rows, roles] = await Promise.all([
        gisApi('gis-datasets', {}),
        gisApi('workspace-capabilities', {}),
      ]);
      if (generation !== request.current) return;
      if (Array.isArray(rows)) setDatasets(rows);
      if (Array.isArray(roles?.capabilities)) setAccess(roles);
    } catch (error) {
      if (
        generation === request.current &&
        [401, 403].includes((error as { status?: number }).status || 0)
      ) {
        setAccess((previous) => ({ ...previous, roles: [], capabilities: [] }));
        setFailure(
          'Campus access changed. Reconnect or sign in again. Local work is retained.',
        );
      }
      throw error;
    }
  }, []);
  useEffect(() => {
    const sync = () => {
      if (!document.hidden && navigator.onLine) void refresh().catch(() => {});
    };
    const timer = setInterval(sync, 30000);
    window.addEventListener('focus', sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', sync);
    };
  }, [refresh]);
  const track = useCallback(async <T,>(work: () => Promise<T>): Promise<T> => {
    setPending((n) => n + 1);
    setFailure('');
    const operation = Promise.resolve().then(work);
    pendingWork.current.add(operation);
    try {
      return await operation;
    } catch (error) {
      setFailure((error as Error).message);
      throw error;
    } finally {
      pendingWork.current.delete(operation);
      setPending((n) => n - 1);
    }
  }, []);
  const value = useMemo(
    () => ({
      state,
      setState,
      datasets,
      capabilities: access,
      refresh,
      pending,
      failure,
      track,
      navigate,
      settle,
      setNavigationGuard,
    }),
    [
      state,
      datasets,
      access,
      refresh,
      pending,
      failure,
      track,
      navigate,
      settle,
      setNavigationGuard,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useEditorSession() {
  const context = useContext(Context);
  if (!context) throw Error('Editor session is required');
  return context;
}
