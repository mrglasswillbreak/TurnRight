import type { Feature } from 'geojson';
import type { Map as MapInstance } from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceLayout } from './WorkspaceFrame';
import { AdminRequestError } from './admin-client';
import type { Appearance } from './appearance';
import type { LayerViewState } from './campus-layer-types';
import { drawingProgress } from './drawing-state';
import { exactDuplicateEdits } from './duplicates';
import { editorCamera, focusEditorSelection } from './editor-camera';
import { featureEdit } from './editor-features';
import { workspaceForSection } from './editor-layout';
import {
  editorHandoffStorage,
  editorSignInReturn,
  requestedEditorBuilding,
} from './editor-link';
import { EditorMap } from './editor-map';
import { type SourceRecord } from './editor-model';
import { DEFAULT_PRECISION, type PrecisionSettings } from './editor-precision';
import {
  publishedBuildingRestore,
  unpublishedEdits,
} from './editor-publication';
import { assembleEditorSources } from './editor-validation';
import { withPublishedVisuals } from './editor-visuals';
import { EditorWorkspace, editKey } from './editor-workspace';
import { EditorState } from './editor-workspace-shared';
import { api, supabase } from './supabase';
import type { CampusData, MapChange, MapEdit, Position, Route } from './types';
import { useEditorValidation } from './useEditorValidation';
import { useEditorWorkspace } from './useEditorWorkspace';
import { useRoutes } from './useRoutes';
import { useSimple3D } from './useSimple3D';
import type { ValidationIssue } from './validation';
import type { BuildingSelection } from './visual-types';

export function useEditorSessionState({
  data,
  dark,
  appearance,
  onAppearance,
  state,
  sources,
  workspace: store,
  offlineContext,
  syncedAt,
  refresh,
  owner,
  prepareOffline,
  updateReady,
  installUpdate,
}: {
  data: CampusData;
  dark: boolean;
  appearance: Appearance;
  onAppearance: (value: Appearance) => Promise<boolean>;
  state: EditorState;
  sources: SourceRecord[];
  workspace: EditorWorkspace;
  offlineContext: boolean;
  syncedAt?: string;
  refresh: () => Promise<MapEdit[]>;
  owner: string;
  prepareOffline: () => Promise<void>;
  updateReady?: boolean;
  installUpdate?: () => Promise<void>;
}) {
  const workspace = useEditorWorkspace(store);
  const [publishedWorkspace, setPublishedWorkspace] = useState(state.published);
  useEffect(() => setPublishedWorkspace(state.published), [state.published]);
  const drafts = useMemo(
    () => unpublishedEdits(workspace.edits, publishedWorkspace),
    [workspace.edits, publishedWorkspace],
  );
  const [networkOnline, setNetworkOnline] = useState(navigator.onLine);
  useEffect(() => {
    const changed = () => setNetworkOnline(navigator.onLine);
    window.addEventListener('online', changed);
    window.addEventListener('offline', changed);
    return () => {
      window.removeEventListener('online', changed);
      window.removeEventListener('offline', changed);
    };
  }, []);
  const [taskError, setTaskError] = useState<{
    message: string;
    label: string;
    retry: () => void;
    auth: boolean;
  } | null>(null);
  const failTask = (error: unknown, label: string, retry: () => void) =>
    setTaskError({
      message:
        error instanceof Error
          ? error.message
          : 'This action could not finish.',
      label,
      retry,
      auth: error instanceof AdminRequestError && error.reason === 'auth',
    });
  const signIn = async () => {
    if (!(await workspace.preserveRecovery())) {
      setError(
        'Browser recovery is unavailable. Download local recovery and keep this tab open until storage can save your work.',
      );
      return;
    }
    try {
      const result = await supabase?.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: editorSignInReturn(location.href, editorHandoffStorage()),
        },
      });
      if (result?.error) throw result.error;
    } catch (error) {
      failTask(error, 'Retry sign in', signIn);
    }
  };
  const [conflictServer, setConflictServer] = useState<MapEdit[] | null>(null);
  const [reviewOverlay, setReviewOverlay] = useState<Feature[]>([]);
  const reviewConflicts = async () => {
    try {
      setConflictServer(
        (
          await api<EditorState>('state', {
            sourceReviewVersion: 2,
            gisKeys: workspace.edits
              .filter((e) => e.properties.gisManaged)
              .map(editKey)
              .slice(0, 500),
          })
        ).edits,
      );
      setTaskError(null);
    } catch (e) {
      failTask(e, 'Retry conflict review', reviewConflicts);
    }
  };
  const [survey, setSurvey] = useState(false),
    [surveyRecording, setSurveyRecording] = useState(false);
  const surveying = useRef(false);
  surveying.current = survey;
  const layout = useWorkspaceLayout(
    owner,
    state.campus?.id || 'lasu',
    state.capabilities,
  );
  const [tab, setTab] = useState<string>(() =>
      workspace.unfinished ||
      workspace.roofDraft ||
      requestedEditorBuilding(location.href, editorHandoffStorage())
        ? 'map'
        : layout.value.workspace,
    ),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('needs'),
    [explorer, setExplorer] = useState(true);
  const updateLayout = layout.update;
  useEffect(() => {
    if (!['settings', 'members'].includes(tab))
      updateLayout({ workspace: workspaceForSection(tab) });
  }, [tab, updateLayout]);
  const [layersOpen, setLayersOpen] = useState(false),
    [layerView, setLayerView] = useState<LayerViewState>({});
  const [overlap, setOverlap] = useState<{
    features: { kind: MapEdit['kind']; id: string }[];
    anchor: Position;
  } | null>(null);
  const [layerOperation, setLayerOperation] = useState<
    import('./layer-geometry-engine').GeometryRequest | null
  >(null);
  const cutterRequest = useRef<
    import('./layer-geometry-engine').GeometryRequest | null
  >(null);
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => {
    try {
      return (
        localStorage.getItem('turnright:editor-welcome-dismissed') === 'true'
      );
    } catch {
      return false;
    }
  });
  const [selected, setSelected] = useState<MapEdit | null>(null),
    [tool, setTool] = useState<MapEdit['kind'] | null>(null);
  const [buildingMode, setBuildingMode] = useState<
    'appearance' | 'outline' | 'roof'
  >('appearance');
  const [buildingSelection, setBuildingSelection] =
    useState<BuildingSelection>();
  const [precisionOpen, setPrecisionOpen] = useState(false);
  const [precision, setPrecision] = useState<PrecisionSettings>({
    ...DEFAULT_PRECISION,
  });
  const [threeD, setThreeD] = useState(() => {
    try {
      return localStorage.getItem('turnright:editor-view') === '3d';
    } catch {
      return false;
    }
  });
  const [simple3D, setSimple3D] = useSimple3D();
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const [opacity, setOpacity] = useState(1),
    [preview, setPreview] = useState(false),
    [ready, setReady] = useState(0);
  const requestedBuilding = useRef(
    requestedEditorBuilding(location.href, editorHandoffStorage()),
  );
  const [handoffNotice, setHandoffNotice] = useState('');
  const [message, setMessage] = useState(
      'Select a place or building to start mapping.',
    ),
    [hint, setHint] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [testOrigin, setTestOrigin] = useState(''),
    [testDest, setTestDest] = useState(''),
    [routes, setRoutes] = useState<Route[]>([]),
    [showRoutes, setShowRoutes] = useState(false);
  const [review, setReview] = useState<MapChange | null>(null);
  const mapRef = useRef<MapInstance | null>(null),
    controller = useRef<EditorMap | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [focusRequest, setFocusRequest] = useState<{
    edit: MapEdit;
    anchor?: Position;
  } | null>(null);
  const selectionOverview = useRef<ReturnType<typeof editorCamera> | null>(
    null,
  );
  useEffect(() => {
    if (!focusRequest || !ready) return;
    const frame = requestAnimationFrame(() => {
      if (
        mapRef.current &&
        selectedRef.current &&
        editKey(selectedRef.current) === editKey(focusRequest.edit)
      )
        focusEditorSelection(
          mapRef.current,
          focusRequest.edit.geometry,
          focusRequest.anchor,
        );
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest, ready]);
  useEffect(() => {
    if (!selected) selectionOverview.current = null;
  }, [selected]);
  const routeRequest = useRef(0);
  const drawingPanels = useRef<{ explorer: boolean; routes: boolean } | null>(
    null,
  );
  const restoreDrawingPanels = () => {
    if (!drawingPanels.current) return;
    setExplorer(drawingPanels.current.explorer);
    setShowRoutes(drawingPanels.current.routes);
    drawingPanels.current = null;
  };
  const progress = drawingProgress(workspace.unfinished);
  const [repairFocus, setRepairFocus] = useState<ValidationIssue | null>(null);
  const publishedBuilding = useMemo(
    () =>
      selected
        ? publishedBuildingRestore(selected, publishedWorkspace, data.version)
        : undefined,
    [selected, publishedWorkspace, data.version],
  );
  const [repairPreview, setRepairPreview] = useState<{
    batch: MapEdit[];
    stamp: string;
    base: CampusData;
    title: string;
  } | null>(null);
  const [repairErrors, setRepairErrors] = useState<string[]>([]);
  const calculate = useRoutes();
  const [gisSources, setGisSources] = useState<SourceRecord[]>([]);
  const assembly = useMemo(
    () =>
      assembleEditorSources(
        [
          ...sources,
          ...gisSources.filter((s) => !sources.some((r) => r.id === s.id)),
        ],
        data,
      ),
    [sources, gisSources, data],
  );
  const base = useMemo(
    () => withPublishedVisuals(assembly.data, data),
    [assembly.data, data],
  );
  const selectedBuildingKey = selected?.id;
  useEffect(() => {
    const edit = selectedRef.current;
    if (edit?.kind === 'building' && edit.id === selectedBuildingKey)
      controller.current?.select(edit, buildingMode === 'outline');
  }, [buildingMode, selectedBuildingKey]);
  useEffect(() => {
    workspace.setSourceBaseline((edit) =>
      featureEdit(base, edit.kind, edit.id, []),
    );
    return () => workspace.setSourceBaseline();
  }, [workspace, base]);
  const currentBase = useRef(base);
  currentBase.current = base;
  const validation = useEditorValidation(
    base,
    workspace.edits,
    data,
    assembly.issues,
  );
  const exactBatch = useMemo(
    () =>
      validation.pending || tab !== 'duplicates'
        ? []
        : exactDuplicateEdits(
            validation.data,
            workspace.edits,
            validation.duplicates,
          ),
    [validation, workspace.edits, tab],
  );
  return {
    data,
    dark,
    appearance,
    onAppearance,
    state,
    store,
    offlineContext,
    syncedAt,
    refresh,
    owner,
    prepareOffline,
    updateReady,
    installUpdate,
    workspace,
    setPublishedWorkspace,
    drafts,
    networkOnline,
    taskError,
    setTaskError,
    failTask,
    signIn,
    conflictServer,
    setConflictServer,
    reviewOverlay,
    setReviewOverlay,
    reviewConflicts,
    survey,
    setSurvey,
    surveyRecording,
    setSurveyRecording,
    surveying,
    layout,
    tab,
    setTab,
    search,
    setSearch,
    filter,
    setFilter,
    explorer,
    setExplorer,
    layersOpen,
    setLayersOpen,
    layerView,
    setLayerView,
    overlap,
    setOverlap,
    layerOperation,
    setLayerOperation,
    cutterRequest,
    welcomeDismissed,
    setWelcomeDismissed,
    selected,
    setSelected,
    tool,
    setTool,
    buildingMode,
    setBuildingMode,
    buildingSelection,
    setBuildingSelection,
    precisionOpen,
    setPrecisionOpen,
    precision,
    setPrecision,
    threeD,
    setThreeD,
    simple3D,
    setSimple3D,
    settingsTrigger,
    opacity,
    setOpacity,
    preview,
    setPreview,
    ready,
    setReady,
    requestedBuilding,
    handoffNotice,
    setHandoffNotice,
    message,
    setMessage,
    hint,
    setHint,
    error,
    setError,
    busy,
    setBusy,
    testOrigin,
    setTestOrigin,
    testDest,
    setTestDest,
    routes,
    setRoutes,
    showRoutes,
    setShowRoutes,
    review,
    setReview,
    mapRef,
    controller,
    selectedRef,
    setFocusRequest,
    selectionOverview,
    routeRequest,
    drawingPanels,
    restoreDrawingPanels,
    progress,
    repairFocus,
    setRepairFocus,
    publishedBuilding,
    repairPreview,
    setRepairPreview,
    repairErrors,
    setRepairErrors,
    calculate,
    gisSources,
    setGisSources,
    base,
    currentBase,
    validation,
    exactBatch,
  };
}
export type EditorSessionStateBindings = ReturnType<
  typeof useEditorSessionState
>;
