import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from 'react';
import type { Map as MapInstance } from 'maplibre-gl';
import { useWorkspaceView } from './WorkspaceFrame';
import { sourceComparison } from './source-comparison';
import { api } from './supabase';
import {
  operationActive,
  type SourceCursor,
  type SourceDetail,
  type SourceFilters,
  type SourceHistory,
  type SourceOperation,
  type SourceOverview,
  type SourcePage,
} from './source-updates';
import type { CampusData, MapChange } from './types';
import type { WorkspaceCapabilities } from './gis-types';
import { emptyPage } from './source-update-format';
import { useSourceOverview } from './useSourceOverview';
import { useSourceDetail } from './useSourceDetail';

export type SourceUpdatesProps = {
  extras?: ReactNode;
  data: CampusData;
  capabilities?: WorkspaceCapabilities;
  busy: boolean;
  beforeDecision: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onImports: () => void;
  onSignIn: () => Promise<void>;
  action: (name: string, payload: unknown, success: string) => Promise<boolean>;
  onFocus: (change: MapChange | null) => void;
  mapRef: RefObject<MapInstance | null>;
};
export function useSourceUpdates({
  data,
  capabilities,
  busy,
  beforeDecision,
  onRefresh,
  onImports,
  onSignIn,
  action,
  onFocus,
  mapRef,
  extras,
}: SourceUpdatesProps) {
  const [overview, setOverview] = useState<SourceOverview>();

  const [mapPreview, setMapPreview] = useState(false);

  const reveal = useWorkspaceView();

  const [page, setPage] = useState<SourcePage>(emptyPage);

  const [filters, setFilters] = useState<SourceFilters>({});

  const [cursors, setCursors] = useState<Array<SourceCursor | null>>([null]);

  const [selected, setSelected] = useState<Record<string, number>>({});

  const [allMatching, setAllMatching] = useState(false);

  const [loading, setLoading] = useState(true);

  const [working, setWorking] = useState(false);

  const [error, setError] = useState<Error | null>(null);

  const [notice, setNotice] = useState('');

  const [attempt, setAttempt] = useState(0);

  const [focusId, setFocusId] = useState('');

  const [detail, setDetail] = useState<SourceDetail>();

  const [detailLoading, setDetailLoading] = useState(false);

  const [operations, setOperations] = useState<SourceOperation[]>([]);

  const [prepared, setPrepared] = useState<{
    op: SourceOperation;
    accept: boolean;
  }>();

  const [acknowledged, setAcknowledged] = useState(false);

  const [results, setResults] = useState<{
    id: string;
    items: SourceHistory['items'];
    next?: string;
  }>();

  const confirmationDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (prepared && !confirmationDialog.current?.open)
      confirmationDialog.current?.showModal();
  }, [prepared]);

  useEffect(() => () => onFocus(null), [onFocus]);

  const preparedRequest = useRef<{ key: string; id: string } | null>(null);

  const observed = useRef(new Set<string>());

  const reconciled = useRef(new Set<string>());

  const refreshRef = useRef(onRefresh);

  refreshRef.current = onRefresh;

  const canEdit = capabilities?.capabilities.includes('edit') ?? false;

  const canManage = capabilities?.capabilities.includes('manage') ?? false;

  const active = operations.find(operationActive);

  const disabled = busy || working || !canEdit;

  const count = allMatching ? page.total : Object.keys(selected).length;

  const cursor = cursors[cursors.length - 1];

  const queryKey = JSON.stringify([filters, cursor]);
  useSourceOverview({
    setLoading,
    filters,
    cursor,
    setPage,
    setOverview,
    setOperations,
    setError,
    reconciled,
    observed,
    refreshRef,
    setAttempt,
    setNotice,
    queryKey,
    attempt,
  });
  useSourceDetail({
    focusId,
    setDetail,
    setDetailLoading,
    onFocus,
    mapRef,
    setError,
    attempt,
  });

  const changeFilter = (key: keyof SourceFilters, value: string) => {
    if (count || prepared)
      setNotice('Selection cleared because the filters changed.');
    setSelected({});
    setAllMatching(false);
    setPrepared(undefined);
    preparedRequest.current = null;
    setFilters((old) => ({ ...old, [key]: value }));
    setCursors([null]);
  };

  const work = async (run: () => Promise<void>) => {
    setWorking(true);
    setError(null);
    try {
      await run();
    } catch (e) {
      setError(e as Error);
    } finally {
      setWorking(false);
    }
  };

  const prepare = (accept: boolean) =>
    work(async () => {
      const selection = allMatching
        ? { mode: 'filter', filters, accept }
        : {
            mode: 'ids',
            accept,
            items: Object.entries(selected).map(([id, revision]) => ({
              id,
              revision,
            })),
          };
      const key = JSON.stringify(selection);
      if (preparedRequest.current?.key !== key)
        preparedRequest.current = { key, id: crypto.randomUUID() };
      const op = await api<SourceOperation>('source-updates-prepare', {
        operationId: preparedRequest.current.id,
        selection,
      });
      setPrepared({ op, accept });
      setAcknowledged(false);
    });

  const control = (
    op: SourceOperation,
    command: 'cancel' | 'retry' | 'resume',
  ) =>
    work(async () => {
      if (command !== 'cancel') await beforeDecision();
      await api('source-updates-control', {
        operationId: op.id,
        command,
        accept: op.accept,
      });
      if (command !== 'cancel') observed.current.add(op.id);
      setAttempt((n) => n + 1);
    });

  const start = () =>
    work(async () => {
      if (!prepared) return;
      await beforeDecision();
      observed.current.add(prepared.op.id);
      try {
        await api('source-updates-control', {
          operationId: prepared.op.id,
          command: 'start',
          accept: prepared.accept,
          acknowledgeRemovals: acknowledged,
        });
        setNotice(
          'Review queued. You can close the editor and return to Activity or Recent decisions for progress.',
        );
        setPrepared(undefined);
        setSelected({});
        setAllMatching(false);
        preparedRequest.current = null;
      } finally {
        setAttempt((n) => n + 1);
      }
    });

  const loadResults = (id: string, next?: string) =>
    work(async () => {
      const result = await api<SourceHistory>('source-updates-history', {
        operationId: id,
        cursor: next || '',
      });
      setResults({
        id,
        items: result.items.slice(0, 50),
        next: result.items.length > 50 ? result.items[49].change_id : undefined,
      });
    });

  const refresh = () => setAttempt((n) => n + 1);

  const sourceNames = new Map(
    overview?.sources.map((s) => ['import:' + s.id, s.name]),
  );

  const comparison =
    detail && sourceComparison(detail.change.before, detail.change.after);

  const focusedSummary = page.rows.find((row) => row.id === detail?.change.id);

  const selectedPage =
    page.rows.length > 0 &&
    page.rows.every((row) => selected[row.id] === row.revision);
  return {
    mapPreview,
    mapRef,
    filters,
    attempt,
    setFocusId,
    reveal,
    setMapPreview,
    refresh,
    working,
    error,
    onSignIn,
    notice,
    overview,
    changeFilter,
    disabled,
    work,
    setNotice,
    onImports,
    canManage,
    action,
    page,
    onFocus,
    sourceNames,
    allMatching,
    selectedPage,
    loading,
    setSelected,
    setAllMatching,
    count,
    setPrepared,
    cursors,
    focusId,
    selected,
    setCursors,
    active,
    prepare,
    canEdit,
    onRefresh,
    prepared,
    confirmationDialog,
    acknowledged,
    setAcknowledged,
    start,
    extras,
    operations,
    loadResults,
    capabilities,
    control,
    results,
    detailLoading,
    detail,
    focusedSummary,
    comparison,
    data,
    setLoading,
    cursor,
    setPage,
    setOverview,
    setOperations,
    setError,
    reconciled,
    observed,
    refreshRef,
    setAttempt,
    queryKey,
    setDetail,
    setDetailLoading,
  };
}
export type SourceUpdatesState = ReturnType<typeof useSourceUpdates>;
