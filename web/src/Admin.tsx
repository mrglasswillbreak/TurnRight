import { PhotoSession } from './PhotoSession';
import type { BuildingSelection } from './visual-types';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowUpRight,
  ArrowUp,
  Building2,
  Check,
  ChevronLeft,
  DoorOpen,
  Download,
  LockKeyhole,
  MapPin,
  MousePointer2,
  Plus,
  Minus,
  Redo2,
  RefreshCw,
  Route as RouteIcon,
  Search,
  Shield,
  Undo2,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Flag,
} from 'lucide-react';
import type { Map as MapInstance } from 'maplibre-gl';
import type { Feature, Geometry } from 'geojson';
import { MapView } from './MapView';
import { MapViewControl } from './MapViewControl';
import { useSimple3D } from './MapRenderingSettings';
import { EditorSettings } from './EditorSettings';
import type { Appearance } from './appearance';
import { api, supabase } from './supabase';
import { AdminRequestError, boundedSession } from './admin-client';
import {
  loadPreparedWorkspace,
  offlineOwner,
  rememberOfflineOwner,
} from './editor-loading';
import { downloadJson } from './download-json';
import { EditorConflictReview } from './EditorConflictReview';
import type { ValidationIssue } from './validation';
import { canonical } from './editor-conflicts';
import {
  unpublishedEdits,
  publishedBuildingRestore,
} from './editor-publication';
import { sourceGeometry } from './source-comparison';
import { type SourceRecord } from './editor-model';
import { assembleEditorSources } from './editor-validation';
import { useEditorValidation } from './useEditorValidation';
import { DuplicateReview } from './DuplicateReview';
import { buildingPlace } from './map-display';
import {
  duplicateDecision,
  exactDuplicateEdits,
  type DuplicateCandidate,
} from './duplicates';
import { featureEdit, geometryEdits, type SnapTarget } from './editor-features';
import { EditorMap } from './editor-map';
import { editorCamera, focusEditorSelection } from './editor-camera';
import { drawingProgress } from './drawing-state';
import { SurveyPanel } from './SurveyPanel';
import { disconnectedSurveyPaths } from './survey-model';
import { readSurveyContext, writeSurveyContext } from './survey-storage';
import {
  EditorWorkspace,
  editKey,
  type WorkspaceRecovery,
} from './editor-workspace';
import { useEditorWorkspace } from './useEditorWorkspace';
import { withPublishedVisuals } from './editor-visuals';
import { remapBuildingSurfaces } from './building-surfaces';
import { EditorInspector } from './EditorInspector';
import { photoEdits } from './photo-workspace';
import { EditorReview, type ReviewState } from './EditorReview';
import { campusFacadeReviewIssues } from './building-facades';
import {
  getPreference,
  setPreference,
  getActivePackage,
  installPackage,
  latestPackage,
} from './offline';
import { distance, projectSegment, meters } from './geo';
import { useRoutes } from './useRoutes';
import { placeHasConnection } from './routing';
import type { CampusData, MapChange, MapEdit, Position, Route } from './types';
import './editor.css';

const BuildingAppearanceEditor = lazy(() =>
  import('./BuildingAppearanceEditor').then((module) => ({
    default: module.BuildingAppearanceEditor,
  })),
);

interface EditorState extends ReviewState {
  edits: MapEdit[];
}

interface OfflineEditor {
  state: EditorState;
  sources: SourceRecord[];
  data: CampusData;
  prepared: boolean;
  syncedAt?: string;
}

export default function Admin({
  data,
  dark = false,
  appearance,
  onAppearance,
  updateReady = false,
  installUpdate,
}: {
  data: CampusData;
  dark?: boolean;
  appearance: Appearance;
  onAppearance: (value: Appearance) => Promise<boolean>;
  updateReady?: boolean;
  installUpdate?: () => Promise<void>;
}) {
  const [owner, setOwner] = useState<string | null>(null);
  const [state, setState] = useState<EditorState | null>(null);
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [workspace, setWorkspace] = useState<EditorWorkspace | null>(null);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const initialCampus = useRef(data);
  const [loadEpoch, setLoadEpoch] = useState(0);
  const [loadAuthError, setLoadAuthError] = useState(false);
  const [offlineContext, setOfflineContext] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string>();
  useEffect(() => {
    if (!supabase) return;
    if (!navigator.onLine) setOwner(offlineOwner());
    else
      void boundedSession('state', supabase.auth.getSession())
        .then(({ data }) =>
          setOwner(
            data.session?.user.id ||
              (!navigator.onLine ? offlineOwner() : null),
          ),
        )
        .catch((error) => {
          setError((error as Error).message);
          setOwner(offlineOwner());
        });
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') rememberOfflineOwner(null);
        setOwner(
          session?.user.id ||
            (!navigator.onLine && event !== 'SIGNED_OUT'
              ? offlineOwner()
              : null),
        );
      },
    );
    return () => subscription.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    const request = ++generation.current;
    setWorkspace(null);
    setState(null);
    if (!owner) return;
    const key = `editor-workspace:${owner}`;
    const load = async () => {
      const loaded = await loadPreparedWorkspace<OfflineEditor>(
        async () => {
          const [state, source] = await Promise.all([
            api<EditorState>('state'),
            api<{ features: SourceRecord[] }>('sources'),
          ]);
          rememberOfflineOwner(owner);
          const syncedAt = new Date().toISOString();
          const cached = await readSurveyContext<OfflineEditor>(owner).catch(
            () => undefined,
          );
          const context = {
            state,
            sources: source.features,
            data: initialCampus.current,
            prepared: !!cached?.prepared,
            syncedAt,
          };
          if (cached?.prepared)
            await writeSurveyContext(owner, context).catch(() => {});
          return context;
        },
        () => readSurveyContext<OfflineEditor>(owner),
        !navigator.onLine,
      );
      if (request === generation.current) {
        setOfflineContext(loaded.offline);
        setSyncedAt(loaded.context.syncedAt);
      }
      return [
        loaded.context.state,
        { features: loaded.context.sources },
        loaded.offline,
      ] as const;
    };
    void Promise.all([
      load(),
      getPreference<WorkspaceRecovery | null>(key, null),
    ])
      .then(([[result, source, offline], recovery]) => {
        if (request !== generation.current) return;
        setSources(source.features);
        setState(result);
        setWorkspace(
          new EditorWorkspace(
            offline && recovery ? recovery.saved : result.edits,
            (batch) => api<MapEdit[]>('save-edits', batch),
            (snapshot) => setPreference(key, snapshot),
            recovery,
          ),
        );
        setError('');
      })
      .catch((e) => {
        if (request === generation.current) {
          setError(e.message);
          setLoadAuthError(
            e instanceof AdminRequestError && e.reason === 'auth',
          );
        }
      });
  }, [owner, loadEpoch]);
  const refresh = async () => {
    const [result, source] = await Promise.all([
      api<EditorState>('state'),
      api<{ features: SourceRecord[] }>('sources'),
    ]);
    setState(result);
    setSources(source.features);
    setOfflineContext(false);
    const syncedAt = new Date().toISOString();
    setSyncedAt(syncedAt);
    if (owner) {
      const cached = await readSurveyContext<OfflineEditor>(owner).catch(
        () => undefined,
      );
      if (cached?.prepared)
        await writeSurveyContext(owner, {
          state: result,
          sources: source.features,
          data,
          prepared: true,
          syncedAt,
        } satisfies OfflineEditor).catch(() => {});
    }
    return result.edits;
  };
  if (!workspace || !state)
    return (
      <main className="loading-screen">
        <a className="brandmark" href="/">
          <ArrowUpRight />
        </a>
        <LockKeyhole size={28} />
        <h1>Campus map editor</h1>
        <p>
          {!supabase
            ? 'Connect your Supabase project to enable the protected editor. The public campus map works without it.'
            : owner
              ? 'Opening your private workspace…'
              : 'Sign in with the GitHub account allowlisted for TurnRight.'}
        </p>
        {supabase && !owner && (
          <button
            className="editor-primary"
            onClick={() =>
              supabase!.auth.signInWithOAuth({
                provider: 'github',
                options: { redirectTo: location.origin + '/admin' },
              })
            }
          >
            Sign in with GitHub
          </button>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {owner && error && (
          <button
            className="editor-primary"
            onClick={async () => {
              if (loadAuthError) {
                try {
                  const result = await supabase?.auth.signInWithOAuth({
                    provider: 'github',
                    options: { redirectTo: location.origin + '/admin' },
                  });
                  if (result?.error) throw result.error;
                } catch (error) {
                  setError((error as Error).message);
                }
              } else setLoadEpoch((n) => n + 1);
            }}
          >
            {loadAuthError ? 'Sign in again' : 'Retry opening workspace'}
          </button>
        )}
        {owner && (
          <button
            className="editor-secondary"
            onClick={() => supabase?.auth.signOut()}
          >
            Sign out
          </button>
        )}
        <a href="/">Back to campus map</a>
      </main>
    );
  return (
    <PhotoSession key={owner} owner={owner!}>
      <Editor
        data={data}
        dark={dark}
        appearance={appearance}
        onAppearance={onAppearance}
        state={state}
        sources={sources}
        workspace={workspace}
        refresh={refresh}
        owner={owner!}
        offlineContext={offlineContext}
        syncedAt={syncedAt}
        updateReady={updateReady}
        installUpdate={installUpdate}
        prepareOffline={async () => {
          const [verified, source] = await Promise.all([
            api<EditorState>('state'),
            api<{ features: SourceRecord[] }>('sources'),
          ]);
          const manifest = await latestPackage();
          await installPackage(manifest, () => {});
          if (!(await getActivePackage())?.complete)
            throw new Error(
              'Offline map verification failed. Retry preparation.',
            );
          if (!navigator.serviceWorker?.controller)
            throw new Error(
              'The offline app is not ready. Reload once online, then retry preparation.',
            );
          await writeSurveyContext(owner!, {
            state: verified,
            sources: source.features,
            data,
            prepared: true,
            syncedAt: new Date().toISOString(),
          } satisfies OfflineEditor);
          rememberOfflineOwner(owner!);
        }}
      />
    </PhotoSession>
  );
}

function Editor({
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
        options: { redirectTo: location.origin + '/admin' },
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
      setConflictServer((await api<EditorState>('state')).edits);
      setTaskError(null);
    } catch (e) {
      failTask(e, 'Retry conflict review', reviewConflicts);
    }
  };
  const [survey, setSurvey] = useState(false),
    [surveyRecording, setSurveyRecording] = useState(false);
  const surveying = useRef(false);
  surveying.current = survey;
  const [tab, setTab] = useState('map'),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('needs'),
    [explorer, setExplorer] = useState(true);
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
  const assembly = useMemo(
    () => assembleEditorSources(sources, data),
    [sources, data],
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
  const mergeBatch = useCallback(
    async (batch: MapEdit[], success: string) => {
      if (!batch.length || tool || workspace.unfinished || validation.pending)
        return;
      setBusy(true);
      const original = workspace.edits;
      try {
        const next = [
          ...original.filter(
            (e) => !batch.some((b) => editKey(b) === editKey(e)),
          ),
          ...batch,
        ];
        const checked = await validation.check(next);
        if (workspace.edits !== original)
          throw new Error('The draft changed. Review this pair again.');
        const newErrors = checked.errors.filter(
          (e) => !validation.errors.includes(e),
        );
        if (newErrors.length) throw new Error(newErrors.join(' '));
        workspace.commit(batch, null);
        setSelected(null);
        selectedRef.current = null;
        controller.current?.select(null);
        setRoutes([]);
        setMessage(success);
      } catch (error) {
        setError((error as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [tool, workspace, validation],
  );
  const decideDuplicate = async (
    candidate: DuplicateCandidate,
    survivor?: string,
  ) => {
    try {
      await mergeBatch(
        duplicateDecision(
          validation.data,
          workspace.edits,
          candidate,
          survivor,
        ),
        survivor
          ? 'Records merged. Saved place references and entrances now use the survivor. Undo restores both.'
          : 'Records kept separate. This decision is retained through source refreshes.',
      );
    } catch (error) {
      setError((error as Error).message);
    }
  };
  const visible = preview && validation.usable ? base : validation.data;
  const selectionForMap =
    selected &&
    (() => {
      const {
        photos: _photos,
        arrival: _arrival,
        ...properties
      } = selected.properties;
      return {
        id: selected.id,
        kind: selected.kind,
        deleted: selected.deleted,
        geometry: selected.geometry,
        properties,
      };
    })();
  const selectionSignature = JSON.stringify(selectionForMap);
  // Photographs and guides do not affect map geometry or building models.
  const mapSelection = useMemo(
    () => JSON.parse(selectionSignature) as MapEdit | null,
    [selectionSignature],
  );
  const renderedMap = useMemo(() => {
    if (preview || mapSelection?.kind !== 'building' || mapSelection.deleted)
      return visible.map;
    const properties = {
      ...mapSelection.properties,
      id: mapSelection.id,
      kind: 'building',
    };
    const roof = workspace.roofDraft;
    if (roof?.buildingId === mapSelection.id)
      properties.appearance = {
        ...properties.appearance,
        roofs: { ...properties.appearance?.roofs, [roof.partId]: roof.roof },
      };
    const feature = {
      type: 'Feature' as const,
      geometry: mapSelection.geometry,
      properties,
    };
    return {
      ...visible.map,
      features: [
        ...visible.map.features.filter(
          (f) =>
            !(
              f.properties?.kind === 'building' &&
              f.properties.id === mapSelection.id
            ),
        ),
        feature,
      ],
    };
  }, [visible.map, mapSelection, preview, workspace.roofDraft]);
  const rendered = useMemo(
    () => ({ ...visible, map: renderedMap }),
    [visible, renderedMap],
  );
  const invalid = useMemo(
    () =>
      new Set(
        validation.issues
          .filter((i) => i.severity !== 'warning' && i.featureId)
          .map((i) => i.featureId!),
      ),
    [validation.issues],
  );
  const select = (edit: MapEdit, refocus = false, anchor?: Position) => {
    workspace.endHistoryGroup();
    if (workspace.roofDraft && workspace.roofDraft.buildingId !== edit.id) {
      setMessage(
        'Apply or cancel the roof plan before selecting another feature.',
      );
      return;
    }
    if (workspace.unfinished) {
      setMessage(
        'Finish or cancel the current drawing before selecting another feature.',
      );
      return;
    }
    if (
      mapRef.current &&
      (refocus ||
        !selectedRef.current ||
        editKey(selectedRef.current) !== editKey(edit))
    ) {
      selectionOverview.current ??= editorCamera(mapRef.current);
      setFocusRequest({ edit, anchor });
    }
    setRepairFocus(null);
    setSelected(edit);
    selectedRef.current = edit;
    setTool(null);
    setPreview(false);
    setTab('map');
    setBuildingMode(workspace.roofDraft ? 'roof' : 'appearance');
    setBuildingSelection(
      edit.kind === 'building' ? { buildingId: edit.id } : undefined,
    );
    controller.current?.select(edit, edit.kind !== 'building');
  };
  const selectId = (
    kind: MapEdit['kind'],
    id: string,
    refocus = false,
    anchor?: Position,
  ) => {
    const edit = featureEdit(validation.data, kind, id, workspace.edits);
    if (edit) select(edit, refocus, anchor);
  };
  const commit = (batch: MapEdit[], current = batch[0]) => {
    workspace.commit(batch, null);
    setSelected(current);
    selectedRef.current = current;
    setTool(null);
    restoreDrawingPanels();
    setRoutes([]);
    controller.current?.select(current);
  };
  const stageRepair = (
    batch: MapEdit[],
    title = 'Review proposed geometry',
  ) => {
    workspace.endHistoryGroup();
    if (tool || workspace.unfinished || workspace.roofDraft) {
      setMessage('Finish or cancel the drawing before reviewing a repair.');
      return;
    }
    setRepairErrors([]);
    setRepairPreview({
      batch: structuredClone(batch),
      stamp: canonical(workspace.edits),
      base,
      title,
    });
    const before = batch
      .map((e) => featureEdit(validation.data, e.kind, e.id, workspace.edits))
      .filter((e): e is MapEdit => !!e);
    setReviewOverlay([
      ...before.map((e) => ({
        type: 'Feature' as const,
        geometry: e.geometry,
        properties: { color: '#d45555' },
      })),
      ...batch.map((e) => ({
        type: 'Feature' as const,
        geometry: e.geometry,
        properties: { color: '#26a07c' },
      })),
    ]);
    const coordinates: Position[] = [];
    const collect = (value: unknown) => {
      if (!Array.isArray(value)) return;
      if (typeof value[0] === 'number' && typeof value[1] === 'number')
        coordinates.push([value[0], value[1]]);
      else value.forEach(collect);
    };
    [...before, ...batch].forEach((e) => {
      if ('coordinates' in e.geometry) collect(e.geometry.coordinates);
    });
    if (coordinates.length)
      mapRef.current?.fitBounds(
        [
          [
            Math.min(...coordinates.map((p) => p[0])),
            Math.min(...coordinates.map((p) => p[1])),
          ],
          [
            Math.max(...coordinates.map((p) => p[0])),
            Math.max(...coordinates.map((p) => p[1])),
          ],
        ],
        {
          maxZoom: 20,
          duration: 300,
          padding: {
            top: 80,
            left: 75,
            right: innerWidth < 700 ? 25 : 340,
            bottom:
              innerWidth < 700
                ? Math.round(
                    (mapRef.current?.getContainer().clientHeight ||
                      innerHeight) * 0.64,
                  )
                : 220,
          },
        },
      );
    controller.current?.select(selectedRef.current);
  };
  const dismissRepair = () => {
    setRepairPreview(null);
    setReviewOverlay([]);
    setRepairErrors([]);
    controller.current?.select(selectedRef.current);
  };
  const applyRepair = async () => {
    if (!repairPreview) return;
    if (workspace.unfinished || tool) {
      setRepairErrors([
        'Finish or cancel the drawing before applying a repair.',
      ]);
      return;
    }
    if (
      repairPreview.stamp !== canonical(workspace.edits) ||
      repairPreview.base !== currentBase.current
    ) {
      setRepairErrors([
        'The map changed. Cancel and review this repair again.',
      ]);
      return;
    }
    const original = workspace.edits;
    const batch = repairPreview.batch;
    setBusy(true);
    try {
      const check = await validation.check([
        ...original.filter(
          (e) => !batch.some((b) => editKey(e) === editKey(b)),
        ),
        ...batch,
      ]);
      if (
        workspace.edits !== original ||
        workspace.unfinished ||
        repairPreview.base !== currentBase.current
      )
        throw new Error('The map changed. Review this repair again.');
      const added = check.errors.filter(
        (error) => !validation.errors.includes(error),
      );
      if (!check.usable || added.length) {
        setRepairErrors(added.length ? added : check.errors);
        return;
      }
      commit(batch);
      dismissRepair();
      setRepairFocus(null);
      setMessage('Reviewed repair applied. Undo restores the previous draft.');
    } catch (e) {
      setRepairErrors([(e as Error).message]);
    } finally {
      setBusy(false);
    }
  };
  const openIssue = (issue: ValidationIssue) => {
    if (tool || workspace.unfinished || workspace.roofDraft) {
      setMessage('Finish or cancel the drawing before opening a repair.');
      return;
    }
    const edit =
      issue.featureId && issue.featureKind
        ? featureEdit(
            validation.data,
            issue.featureKind,
            issue.featureId,
            workspace.edits,
          )
        : undefined;
    if (edit) {
      select(edit, true);
      setRepairFocus(issue);
      if (issue.repair === 'review-model')
        setBuildingSelection({
          buildingId: edit.id,
          partId:
            edit.properties.appearance?.facades?.[issue.field || '']?.partId,
          wallId: issue.field,
        });
      setExplorer(false);
    } else if (issue.coordinates)
      mapRef.current?.flyTo({ center: issue.coordinates, zoom: 18 });
    setMessage(
      issue.repair === 'review-model'
        ? 'Review the selected wall’s placement and evidence, then mark only that wall reviewed.'
        : issue.repair === 'choose-place'
          ? 'Choose the place served by this entrance, then review the change.'
          : issue.repair === 'connect-path'
            ? 'Use the connection controls to choose a highlighted path or draw an approach.'
            : 'Inspect the highlighted segment and adjust its geometry. Review the proposed repair before applying it.',
    );
  };
  const begin = (
    kind: MapEdit['kind'],
    props: MapEdit['properties'] = {},
    seed?: Position[],
  ) => {
    workspace.endHistoryGroup();
    if (repairPreview) {
      setMessage(
        'Apply or cancel the repair review before starting a drawing.',
      );
      return;
    }
    if (tool || workspace.unfinished || workspace.roofDraft) {
      setMessage('Finish or cancel the current drawing first.');
      return;
    }
    if (!controller.current) return;
    drawingPanels.current = { explorer, routes: showRoutes };
    setExplorer(false);
    setShowRoutes(false);
    setHint('');
    setSelected(null);
    selectedRef.current = null;
    setTool(kind);
    setPreview(false);
    setTab('map');
    const name =
      kind === 'path'
        ? 'Campus path'
        : kind === 'entrance'
          ? 'Entrance'
          : kind === 'building'
            ? 'Building'
            : kind === 'closure'
              ? 'Temporary closure'
              : kind === 'barrier'
                ? 'Barrier'
                : 'Campus place';
    controller.current?.begin(
      kind,
      { name, access: 'yes', category: 'other', ...props },
      seed,
    );
    setMessage(
      kind === 'entrance'
        ? 'Click the ground edge of the building to place its entrance.'
        : kind === 'path'
          ? 'Click to add path points. Click a highlighted path to connect. Enter to finish.'
          : kind === 'building'
            ? 'Click around the ground footprint. Enter to finish the outline.'
            : `Click the map to add a ${kind}.`,
    );
  };
  const addEntrance = () => {
    const edit = selectedRef.current;
    if (!edit) return;
    const building = validation.data.map.features.find(
      (f) =>
        f.properties?.kind === 'building' &&
        (edit.kind === 'building'
          ? f.properties.id === edit.id
          : buildingPlace(validation.data, f)?.id === edit.id),
    );
    const place =
      edit.kind === 'place'
        ? validation.data.places.find((p) => p.id === edit.id)
        : building
          ? buildingPlace(validation.data, building)
          : undefined;
    const buildingId = building?.properties?.id;
    begin('entrance', {
      name: `${place?.name || edit.properties.name || 'Building'} entrance`,
      placeId: place?.id || '',
      buildingId,
    });
  };
  const approach = () => {
    const edit = selectedRef.current;
    if (!edit || edit.kind !== 'entrance' || edit.geometry.type !== 'Point')
      return;
    begin(
      'path',
      { name: `${edit.properties.name} approach`, entranceId: edit.id },
      [edit.geometry.coordinates as Position],
    );
  };
  const create = (edit: MapEdit) => {
    const batch = [edit];
    if (
      edit.kind === 'path' &&
      edit.geometry.type === 'LineString' &&
      typeof edit.properties.entranceId === 'string'
    ) {
      const entrance = featureEdit(
        validation.data,
        'entrance',
        edit.properties.entranceId,
        workspace.edits,
      );
      if (
        entrance?.geometry.type === 'Point' &&
        distance(
          entrance.geometry.coordinates as Position,
          edit.geometry.coordinates[0] as Position,
        ) < 0.2
      )
        batch.push({
          ...entrance,
          properties: {
            ...entrance.properties,
            connectTo: undefined,
            connection: {
              type: 'node',
              nodeId: edit.properties.vertexIds![0],
              coordinates: edit.geometry.coordinates[0] as Position,
            },
          },
        });
    }
    commit(batch, edit);
    setMessage('Added to your draft. Select it to adjust the details.');
  };
  const updateGeometry = (geometry: Geometry) => {
    const current = selectedRef.current;
    if (!current) return;
    const batch = geometryEdits(
      current,
      geometry,
      validation.data,
      workspace.edits,
    );
    if (repairFocus) stageRepair(batch);
    else
      commit(
        batch,
        batch.find((e) => e.id === current.id && e.kind === current.kind)!,
      );
  };
  const remove = () => {
    const current = selectedRef.current;
    if (current) {
      workspace.commit([{ ...current, deleted: true }]);
      setSelected(null);
      selectedRef.current = null;
      controller.current?.select(null);
      setMessage(`${current.properties.name} removed. Undo to restore it.`);
    }
  };
  const pick = (mode: 'start' | 'end' | 'join' | 'entrance-link' | 'block') => {
    controller.current?.pick(mode);
    setMessage(
      mode === 'join'
        ? 'Click the crossing where this path should join another path.'
        : mode === 'block'
          ? 'Click a path segment away from a junction to block it.'
          : 'Click a highlighted path or junction to make the connection.',
    );
  };
  const connect = (snap: SnapTarget, mode: string) => {
    const current = selectedRef.current;
    if (!current || !snap.target) return;
    const edit = structuredClone(current);
    if (mode === 'block') {
      if (snap.target.type !== 'segment') {
        setMessage(
          'Click the middle of a segment to choose which path to block.',
        );
        return;
      }
      const target = snap.target;
      const ids = validation.data.graph.edges
        .filter(
          (e) =>
            e.sourceId === target.sourceId &&
            ((e.from === target.from && e.to === target.to) ||
              (e.to === target.from && e.from === target.to)),
        )
        .map((e) => e.id);
      edit.properties.edgeIds = [
        ...new Set([
          ...(Array.isArray(edit.properties.edgeIds)
            ? (edit.properties.edgeIds as string[])
            : []),
          ...ids,
        ]),
      ];
    } else if (edit.kind === 'entrance' && edit.geometry.type === 'Point') {
      if (
        distance(edit.geometry.coordinates as Position, snap.coordinates) > 5
      ) {
        setMessage(
          'Draw a connecting path to cover the gap from this entrance.',
        );
        return;
      }
      edit.geometry.coordinates = snap.coordinates;
      edit.properties.connection = snap.target;
      delete edit.properties.connectTo;
    } else if (edit.kind === 'path' && edit.geometry.type === 'LineString') {
      const points = edit.geometry.coordinates as Position[];
      let index = mode === 'start' ? 0 : points.length - 1;
      if (mode === 'join') {
        const candidates = points
          .slice(1)
          .map((p, i) => ({
            i: i + 1,
            projection: projectSegment(snap.coordinates, points[i], p),
          }))
          .sort((a, b) => a.projection.distance - b.projection.distance);
        if (!candidates[0] || candidates[0].projection.distance > 0.2) {
          setMessage(
            'Choose a crossing on the selected path. Move an endpoint to connect across a gap.',
          );
          return;
        }
        const existing = points.findIndex(
          (p) => distance(p, snap.coordinates) < 0.2,
        );
        index = existing >= 0 ? existing : candidates[0].i;
        if (existing < 0) {
          points.splice(index, 0, snap.coordinates);
          edit.properties.vertexIds!.splice(
            index,
            0,
            `${edit.id}:vertex:${crypto.randomUUID()}`,
          );
        }
      }
      if (distance(points[index], snap.coordinates) > 5) {
        setMessage(
          'Move the endpoint within 5 m of the intended connection first.',
        );
        return;
      }
      points[index] = snap.coordinates;
      const vertexId = edit.properties.vertexIds![index];
      edit.properties.connections = [
        ...(edit.properties.connections || []).filter(
          (c) => c.vertexId !== vertexId,
        ),
        { vertexId, target: snap.target },
      ];
      delete edit.properties.connectStart;
      delete edit.properties.connectEnd;
    }
    stageRepair([edit], 'Review proposed connection');
  };
  const disconnect = (vertexId?: string) => {
    const current = selectedRef.current;
    if (!current) return;
    const edit = structuredClone(current);
    if (edit.kind === 'entrance') {
      delete edit.properties.connection;
      delete edit.properties.connectTo;
    } else {
      // Otherwise the topology pass would immediately recreate the removed join.
      edit.properties.autoConnectCrossings = false;
      edit.properties.connections = edit.properties.connections?.filter(
        (c) => c.vertexId !== vertexId,
      );
      edit.properties.vertexIds = edit.properties.vertexIds?.map((id) =>
        id === vertexId ? `${edit.id}:vertex:${crypto.randomUUID()}` : id,
      );
      delete edit.properties.connectStart;
      delete edit.properties.connectEnd;
    }
    commit([edit]);
  };
  const live = useRef({
    selectId,
    create,
    updateGeometry,
    remove,
    connect,
    validation,
  });
  live.current = {
    selectId,
    create,
    updateGeometry,
    remove,
    connect,
    validation,
  };
  const mapReady = (map: MapInstance) => {
    mapRef.current = map;
    map.setMaxPitch(60);
    const instance = new EditorMap(map, live.current.validation.data, {
      select: (kind, id, anchor) =>
        live.current.selectId(kind, id, false, anchor),
      create: (edit) => live.current.create(edit),
      geometry: (geometry) => live.current.updateGeometry(geometry),
      remove: () => live.current.remove(),
      draft: (drawing) => workspace.draft(drawing),
      connect: (target, mode) => live.current.connect(target, mode),
      hint: setHint,
    });
    controller.current = instance;
    setReady((r) => r + 1);
    return () => {
      instance.dispose();
      if (controller.current === instance) controller.current = null;
      mapRef.current = null;
    };
  };
  useEffect(() => {
    controller.current?.update(
      validation.data,
      drafts,
      data,
      invalid,
      preview || survey,
    );
  }, [validation, drafts, data, invalid, preview, ready, survey]);
  useEffect(() => {
    const features: Feature[] = [];
    for (const [side, color] of [
      [review?.before, '#d45555'],
      [review?.after, '#26a07c'],
    ] as const) {
      const geometry = sourceGeometry(side);
      if (geometry)
        features.push({ type: 'Feature', properties: { color }, geometry });
    }
    controller.current?.review(
      reviewOverlay.length ? reviewOverlay : tab === 'changes' ? features : [],
    );
  }, [review, ready, tab, reviewOverlay]);
  const undo = (redo = false) => {
    if (tool) {
      controller.current?.cancel();
      setTool(null);
      restoreDrawingPanels();
    }
    if (workspace.roofDraft) {
      setMessage('Apply or cancel the roof plan before undoing other edits.');
      return;
    }
    if (redo) workspace.redo();
    else workspace.undo();
    const previous = selectedRef.current;
    const stored =
      previous && workspace.edits.find((e) => editKey(e) === editKey(previous));
    const next =
      previous &&
      (!stored || (stored.deleted && stored.properties.revertToSource))
        ? featureEdit(base, previous.kind, previous.id, [])
        : stored;
    setSelected(next && !next.deleted ? next : null);
    selectedRef.current = next && !next.deleted ? next : null;
    controller.current?.select(selectedRef.current);
    setRoutes([]);
  };
  const cancel = () => {
    controller.current?.cancel();
    setTool(null);
    restoreDrawingPanels();
    setSelected(null);
    setHint('');
    setMessage('Drawing cancelled. Select a feature or choose a tool.');
  };
  const keyboard = useRef({ begin, undo, cancel, remove });
  keyboard.current = { begin, undo, cancel, remove };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (surveying.current) return;
      // Modal workspaces own Escape, history and tool shortcuts while open.
      // The window capture listener must not cancel the selected map feature.
      if (document.querySelector('[role="dialog"], [role="alertdialog"]'))
        return;
      if (
        (event.target as HTMLElement)?.closest(
          'input, textarea, select, [contenteditable=true]',
        )
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.stopImmediatePropagation();
        keyboard.current.undo(event.shiftKey);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        keyboard.current.cancel();
      } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const kind = (
          { p: 'path', e: 'entrance', b: 'building', m: 'place' } as const
        )[event.key.toLowerCase() as 'p'];
        if (kind) {
          event.preventDefault();
          keyboard.current.begin(kind);
        }
      }
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, []);
  const uncertainAction = useRef(false);
  const action = async (name: string, payload: unknown, success: string) => {
    setBusy(true);
    setTaskError(null);
    workspace.endHistoryGroup();
    let submitted = false;
    try {
      if (
        workspace.roofDraft &&
        ['prepare-release', 'publish-release'].includes(name)
      )
        throw new Error(
          'Apply or cancel the unfinished roof before preparing or publishing a release.',
        );
      if (uncertainAction.current) {
        workspace.reconcile(await refresh(), true);
        uncertainAction.current = false;
        setMessage(
          'Status checked. Review the result before requesting the action again.',
        );
        return false;
      }
      if (!(await workspace.flush()))
        throw new Error(workspace.error || 'Save or repair the draft first.');
      if (name === 'prepare-release') {
        const check = await validation.check(workspace.saved);
        if (workspace.unfinished || workspace.roofDraft || check.errors.length)
          throw new Error(
            check.errors[0] ||
              'Apply or cancel unfinished drawing and roof work before preparing a release.',
          );
        const modelReviews = campusFacadeReviewIssues(check.data);
        if (modelReviews.length)
          throw new Error(modelReviews.map((i) => i.message).join('\n'));
      }
      submitted = true;
      await api(name, payload);
      workspace.reconcile(await refresh(), true);
      setMessage(success);
      return true;
    } catch (e) {
      if (submitted) uncertainAction.current = true;
      failTask(e, 'Check action status', async () => {
        try {
          workspace.reconcile(await refresh(), true);
          uncertainAction.current = false;
          setTaskError(null);
          setMessage(
            'Status refreshed. Review the result before requesting the action again.',
          );
        } catch (next) {
          failTask(next, 'Check action status', () => {
            void refreshWorkspace();
          });
        }
      });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const exportBackup = async () => {
    try {
      const server = await api('export');
      downloadJson(
        `turnright-backup-${new Date().toISOString().slice(0, 10)}.json`,
        {
          ...workspace.localBackup(base.version),
          server,
          local: workspace.edits,
          unfinished: workspace.unfinished,
        },
      );
      setTaskError(null);
    } catch (e) {
      failTask(e, 'Retry export', exportBackup);
    }
  };
  const localRecovery = () => {
    try {
      downloadJson(
        'turnright-local-recovery.json',
        workspace.localBackup(base.version),
      );
    } catch (e) {
      failTask(e, 'Retry local recovery download', localRecovery);
    }
  };
  const refreshWorkspace = async () => {
    try {
      if (!(await workspace.flush())) return;
      workspace.reconcile(await refresh(), true);
      setTaskError(null);
    } catch (e) {
      failTask(e, 'Retry refresh', refreshWorkspace);
    }
  };
  const previewTestRoute = async () => {
    const request = ++routeRequest.current;
    setBusy(true);
    try {
      const found = await calculate(
        validation.data,
        { placeId: testOrigin },
        { placeId: testDest },
      );
      if (request === routeRequest.current) {
        setRoutes(found);
        setTaskError(null);
        const points = found[0].coordinates;
        mapRef.current?.fitBounds(
          [
            [
              Math.min(...points.map((p) => p[0])),
              Math.min(...points.map((p) => p[1])),
            ],
            [
              Math.max(...points.map((p) => p[0])),
              Math.max(...points.map((p) => p[1])),
            ],
          ],
          {
            maxZoom: 19,
            padding: {
              left: innerWidth > 1000 ? 365 : 70,
              right: innerWidth > 1000 ? 330 : 40,
              top: 100,
              bottom: 165,
            },
          },
        );
      }
    } catch (e) {
      if (request === routeRequest.current)
        failTask(e, 'Retry route', previewTestRoute);
    } finally {
      setBusy(false);
    }
  };
  const tasks = useMemo(() => {
    const result: {
      id: string;
      kind: MapEdit['kind'];
      name: string;
      reason: string;
    }[] = [];
    for (const place of validation.data.places)
      result.push({
        id: place.id,
        kind: 'place',
        name: place.name,
        reason: !placeHasConnection(validation.data, place)
          ? 'Missing walking connection'
          : !(validation.data.entrances || []).some(
                (e) => e.placeId === place.id,
              )
            ? 'Needs an entrance'
            : 'Mapped place',
      });
    for (const f of validation.data.map.features)
      if (['building', 'path'].includes(f.properties?.kind))
        result.push({
          id: String(f.properties!.id),
          kind: f.properties!.kind,
          name: String(
            f.properties!.name ||
              (f.properties!.kind === 'building'
                ? 'Unnamed building'
                : 'Campus path'),
          ),
          reason:
            f.properties!.kind === 'building' && !Number(f.properties!.height)
              ? 'Height unknown'
              : 'Mapped geometry',
        });
    for (const edit of workspace.edits.filter((e) => !e.deleted))
      if (
        validation.issues.some(
          (i) =>
            i.featureId === edit.id &&
            (!i.featureKind || i.featureKind === edit.kind),
        )
      )
        result.unshift({
          id: edit.id,
          kind: edit.kind,
          name: String(edit.properties.name),
          reason: invalid.has(edit.id) ? 'Needs repair' : 'Review connection',
        });
    for (const edit of drafts)
      if (
        !result.some((task) => task.id === edit.id && task.kind === edit.kind)
      )
        result.push({
          id: edit.id,
          kind: edit.kind,
          name: String(edit.properties.name || edit.id),
          reason: edit.deleted
            ? 'Removed in this draft'
            : 'Unpublished correction',
        });
    const grouped = new Map<string, (typeof result)[number]>();
    for (const task of result) {
      const key = `${task.kind}:${task.id}`,
        previous = grouped.get(key);
      const reasons = validation.issues
        .filter(
          (issue) =>
            issue.featureId === task.id &&
            (!issue.featureKind || issue.featureKind === task.kind),
        )
        .map((issue) => issue.message);
      const combined = [
        ...new Set([
          ...(previous ? previous.reason.split(' · ') : []),
          task.reason,
          ...reasons,
        ]),
      ];
      grouped.set(key, { ...task, reason: combined.join(' · ') });
    }
    return [...grouped.values()];
  }, [validation, workspace.edits, drafts, invalid]);
  const visibleTasks = tasks.filter(
    (t) =>
      `${t.name} ${t.reason}`.toLowerCase().includes(search.toLowerCase()) &&
      (filter === 'all' ||
        (filter === 'needs' &&
          (!t.reason.startsWith('Mapped') || t.reason.includes(' · '))) ||
        (filter === 'drafts' &&
          drafts.some((e) => e.id === t.id && e.kind === t.kind))),
  );
  const toolButtons = [
    { kind: null, name: 'Select', icon: MousePointer2, shortcut: '' },
    { kind: 'entrance', name: 'Add entrance', icon: DoorOpen, shortcut: 'E' },
    { kind: 'path', name: 'Draw path', icon: RouteIcon, shortcut: 'P' },
    { kind: 'place', name: 'Add place', icon: MapPin, shortcut: 'M' },
    { kind: 'building', name: 'Draw building', icon: Building2, shortcut: 'B' },
    { kind: 'closure', name: 'Add closure', icon: Flag, shortcut: '' },
    { kind: 'barrier', name: 'Draw barrier', icon: Shield, shortcut: '' },
  ] as const;
  const toggleView = (value: boolean) => {
    setThreeD(value);
    try {
      localStorage.setItem('turnright:editor-view', value ? '3d' : '2d');
    } catch {
      /* View still works this session. */
    }
  };
  const resume = () => {
    const drawing = workspace.unfinished;
    if (!drawing) return;
    drawingPanels.current = { explorer, routes: showRoutes };
    setExplorer(false);
    setShowRoutes(false);
    const points =
      drawing.geometry.type === 'LineString'
        ? drawing.geometry.coordinates
        : drawing.geometry.type === 'Polygon'
          ? drawing.geometry.coordinates[0]
          : [];
    setTool(drawing.kind);
    controller.current?.begin(
      drawing.kind,
      drawing.properties,
      points as Position[],
      drawing.id,
    );
  };
  return (
    <main className={`editor-shell ${survey ? 'survey-active' : ''}`}>
      {(offlineContext || !networkOnline) && (
        <output className="editor-offline">
          Working offline · Last synchronized:{' '}
          {syncedAt ? new Date(syncedAt).toLocaleString() : 'Unknown'}
          <button onClick={refreshWorkspace}>Reconnect and synchronize</button>
          <button onClick={localRecovery}>Download local recovery</button>
        </output>
      )}
      {updateReady && (
        <output className="editor-update">
          App update ready.{' '}
          {surveyRecording
            ? 'Pause recording before updating.'
            : 'Recovery data will be kept.'}
          <button
            disabled={surveyRecording}
            onClick={async () => {
              if (await workspace.prepareUpdate()) await installUpdate?.();
            }}
          >
            Install update
          </button>
        </output>
      )}
      <header className="editor-header">
        <a className="editor-brand" href="/">
          <span className="brandmark">
            <ArrowUpRight size={23} />
          </span>
          <strong>
            TurnRight<span>Map editor</span>
          </strong>
        </a>
        <nav className="editor-navigation" aria-label="Editor sections">
          {[
            ['map', 'Workspace'],
            ['changes', 'Sources'],
            ['duplicates', 'Duplicates'],
            ['reports', 'Reports'],
            ['releases', 'Releases'],
            ['settings', 'Settings'],
          ].map(([id, label]) => (
            <button
              key={id}
              ref={id === 'settings' ? settingsTrigger : undefined}
              className={tab === id ? 'active' : ''}
              disabled={
                id !== 'settings' &&
                !(id === 'map' && tab === 'settings') &&
                (!!tool || !!workspace.unfinished)
              }
              onClick={() => {
                workspace.endHistoryGroup();
                if (id === 'settings') {
                  setTab(id);
                  return;
                }
                setReviewOverlay([]);
                setTab(id);
                if (id !== 'map') setExplorer(false);
              }}
            >
              {label}
              {id === 'reports' && state.reports.length > 0 && (
                <small>{state.reports.length}</small>
              )}
            </button>
          ))}
        </nav>
        {!survey && (
          <button
            className="editor-survey-entry"
            onClick={() => {
              if (workspace.unfinished) {
                setError('Finish or cancel the drawing before surveying.');
                return;
              }
              setSurvey(true);
              setTab('map');
              setPreview(false);
            }}
          >
            Survey
          </button>
        )}
        <div className="editor-header-right">
          <output
            className={`editor-save-state ${workspace.status === 'Saved' ? 'saved' : ''}`}
          >
            <span />
            {workspace.status}
          </output>
          <details className="editor-backup-menu">
            <summary aria-label="Backup options">
              <Download size={17} /> Backup
            </summary>
            <div className="editor-card">
              <button className="editor-secondary" onClick={localRecovery}>
                Download local recovery
              </button>
              <button className="editor-secondary" onClick={exportBackup}>
                Export backup
              </button>
            </div>
          </details>
          <button
            className="editor-icon"
            aria-label="Refresh workspace"
            title="Refresh workspace"
            onClick={refreshWorkspace}
          >
            <RefreshCw size={17} />
          </button>
          <button
            className="editor-publish"
            disabled={!!tool || !!workspace.unfinished}
            onClick={() => setTab('releases')}
          >
            Review changes <ArrowUpRight size={15} />
          </button>
          <button
            className="editor-text editor-signout"
            onClick={async () => {
              if (await workspace.flush()) await supabase?.auth.signOut();
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <section
        className={`editor-map-workspace ${tab === 'settings' ? 'settings-open' : ''}`}
        aria-label="Mapping workspace"
      >
        <MapView
          data={rendered}
          dark={dark}
          threeD={threeD}
          simple={simple3D}
          editor
          editing={
            !!tool ||
            !!workspace.unfinished ||
            survey ||
            (selected?.kind === 'building' && buildingMode === 'outline')
          }
          buildingOpacity={
            survey ||
            tool === 'entrance' ||
            tool === 'path' ||
            tool === 'barrier' ||
            tool === 'building' ||
            (selected?.kind === 'building' && buildingMode === 'outline')
              ? 0.2
              : opacity
          }
          routes={routes}
          panelBesideMap
          onSelect={() => {}}
          buildingSelection={buildingSelection}
          onBuildingSelect={(feature, hit) => {
            if (workspace.roofDraft) {
              if (
                hit?.buildingId === workspace.roofDraft.buildingId &&
                hit.partId === workspace.roofDraft.partId &&
                hit.role === 'roof'
              )
                setBuildingSelection(hit);
              return;
            }
            if (selected?.id === hit?.buildingId && buildingMode === 'roof') {
              setBuildingSelection(hit);
              return;
            }
            selectId('building', String(feature.properties?.id));
            if (hit) setBuildingSelection(hit);
          }}
          onReady={mapReady}
        />
        {survey && ready > 0 && mapRef.current && (
          <SurveyPanel
            owner={owner}
            map={mapRef.current}
            data={validation.data}
            edits={workspace.edits}
            selected={selected}
            close={() => setSurvey(false)}
            prepareOffline={prepareOffline}
            recordingChanged={setSurveyRecording}
            view2D={() => setThreeD(false)}
            apply={async (edits, previousIds) => {
              const removed = workspace.edits
                .filter(
                  (e) =>
                    previousIds.includes(e.id) &&
                    !edits.some((n) => n.id === e.id),
                )
                .map((e) => ({ ...e, deleted: true }));
              edits = [...edits, ...removed];
              const next = [
                ...workspace.edits.filter(
                  (e) => !edits.some((n) => n.kind === e.kind && n.id === e.id),
                ),
                ...edits,
              ];
              const checked = await validation.check(next);
              const addedErrors = checked.errors.filter(
                (e) => !validation.errors.includes(e),
              );
              if (addedErrors.length) throw new Error(addedErrors.join(' '));
              if (
                disconnectedSurveyPaths(validation.data, checked.data, edits)
                  .length
              )
                throw new Error(
                  'This section has no usable connection to the mapped network. Keep it as a saved survey until connected.',
                );
              workspace.commit(next, null);
              if (navigator.onLine && !(await workspace.flush()))
                throw new Error(
                  'Map changes are saved locally. Resolve the draft save issue before retrying.',
                );
              return edits.map(
                (e) =>
                  featureEdit(checked.data, e.kind, e.id, store.edits) || e,
              );
            }}
          />
        )}
        <div
          className="editor-tools editor-card"
          role="toolbar"
          aria-label="Map drawing tools"
        >
          {toolButtons.map(({ kind, name, icon: Icon, shortcut }) => (
            <button
              key={name}
              className={tool === kind ? 'active' : ''}
              aria-label={name}
              aria-pressed={tool === kind}
              title={`${name}${shortcut ? ` (${shortcut})` : ''}`}
              disabled={
                preview ||
                !ready ||
                (!!kind &&
                  (!!tool || !!workspace.unfinished || !!repairPreview))
              }
              onClick={() => (kind ? begin(kind) : cancel())}
            >
              <Icon size={20} />
              <span>{name}</span>
            </button>
          ))}

          <hr />
          <button
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            disabled={!workspace.past.length}
            onClick={() => undo()}
          >
            <Undo2 size={19} />
            <span>Undo</span>
          </button>
          <button
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
            disabled={!workspace.future.length}
            onClick={() => undo(true)}
          >
            <Redo2 size={19} />
            <span>Redo</span>
          </button>
        </div>
        <div className={`editor-explorer ${explorer ? '' : 'collapsed'}`}>
          {explorer ? (
            <section className="editor-card">
              <div className="editor-explorer-top">
                <span className="editor-eyebrow">LASU · OJO CAMPUS</span>
                <button
                  className="editor-icon"
                  aria-label="Collapse explorer"
                  onClick={() => setExplorer(false)}
                >
                  <PanelLeftClose size={16} />
                </button>
              </div>
              <label className="editor-search">
                <Search size={17} />
                <input
                  type="search"
                  aria-label="Search map features"
                  placeholder="Find a place or building"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <button
                className="editor-create-model"
                disabled={
                  preview ||
                  !ready ||
                  !!tool ||
                  !!workspace.unfinished ||
                  !!repairPreview
                }
                title="Draw a building footprint, then open Edit model"
                onClick={() => begin('building')}
              >
                <Building2 size={20} />
                <span>Create model</span>
              </button>
              <div className="editor-filters">
                {[
                  ['needs', 'Needs mapping'],
                  ['all', 'All'],
                  ['drafts', 'Drafts'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={filter === id ? 'active' : ''}
                    onClick={() => setFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="editor-result-count">
                {visibleTasks.length} features <span>Click to locate</span>
              </div>
              <div className="editor-feature-list">
                {visibleTasks.slice(0, 100).map((t, i) => (
                  <button
                    key={`${t.kind}:${t.id}:${i}`}
                    onClick={() => selectId(t.kind, t.id, true)}
                    className={
                      selected?.kind === t.kind && selected.id === t.id
                        ? 'selected'
                        : ''
                    }
                  >
                    <span className={`editor-feature-icon ${t.kind}`}>
                      {t.kind === 'building' ? (
                        <Building2 size={17} />
                      ) : t.kind === 'path' ? (
                        <RouteIcon size={17} />
                      ) : t.kind === 'entrance' ? (
                        <DoorOpen size={17} />
                      ) : (
                        <MapPin size={17} />
                      )}
                    </span>
                    <span>
                      <strong>{t.name}</strong>
                      <small>{t.reason}</small>
                    </span>
                    <ArrowUpRight size={13} />
                  </button>
                ))}
                {!visibleTasks.length && (
                  <p className="editor-empty">
                    {filter === 'drafts' && !search
                      ? 'No unpublished changes. Published work stays on the map.'
                      : 'No matching features.'}
                  </p>
                )}
                {visibleTasks.length > 100 && (
                  <p className="small-note">Search to narrow these results.</p>
                )}
              </div>
              <div className="editor-explorer-bottom">
                <span>
                  <DoorOpen size={15} />
                  {validation.data.entrances?.length || 0} entrances
                </span>
                <button
                  className="editor-text"
                  onClick={() => setShowRoutes(!showRoutes)}
                >
                  <RouteIcon size={15} /> Test route
                </button>
              </div>
            </section>
          ) : (
            <button
              className="editor-card editor-icon"
              aria-label="Open explorer"
              disabled={!!tool}
              onClick={() => setExplorer(true)}
            >
              <PanelLeftOpen size={20} />
            </button>
          )}
        </div>
        <div className="editor-view-controls editor-card">
          <MapViewControl threeD={threeD} onView={toggleView} />
          <button
            className="editor-icon"
            aria-label="Zoom in"
            onClick={() => mapRef.current?.zoomIn()}
          >
            <Plus size={18} />
          </button>
          <button
            className="editor-icon"
            aria-label="Zoom out"
            onClick={() => mapRef.current?.zoomOut()}
          >
            <Minus size={18} />
          </button>
          <button
            className="editor-icon"
            aria-label="Reset north"
            title="Reset north"
            onClick={() => mapRef.current?.easeTo({ bearing: 0 })}
          >
            <ArrowUp size={18} />
          </button>
          {threeD && (
            <>
              <button
                className="editor-icon"
                aria-label="Rotate left"
                onClick={() =>
                  mapRef.current?.easeTo({
                    bearing: mapRef.current.getBearing() - 30,
                  })
                }
              >
                <ChevronLeft size={18} />
              </button>
            </>
          )}
          <button
            className={`editor-compare ${preview ? 'active' : ''}`}
            disabled={!!tool || !!workspace.unfinished}
            onClick={() => setPreview(!preview)}
          >
            {preview ? 'Back to draft' : 'Compare base'}
          </button>
        </div>
        {tab === 'settings' && (
          <EditorSettings
            appearance={appearance}
            dark={dark}
            onAppearance={onAppearance}
            map={mapRef.current}
            threeD={threeD}
            simple={simple3D}
            onSimple={setSimple3D}
            opacity={opacity}
            onOpacity={setOpacity}
            onClose={() => {
              setTab('map');
              settingsTrigger.current?.focus();
            }}
          />
        )}
        {tab !== 'map' && tab !== 'settings' ? (
          <aside className="editor-review-panel editor-card">
            <div className="editor-panel-heading">
              <span className="editor-eyebrow">PRIVATE WORKSPACE</span>
              <button
                className="editor-icon"
                aria-label="Close review panel"
                onClick={() => setTab('map')}
              >
                <X size={18} />
              </button>
            </div>
            {tab === 'duplicates' ? (
              <DuplicateReview
                data={validation.data}
                candidates={validation.duplicates}
                pending={validation.pending || busy}
                decide={decideDuplicate}
                inspect={(kind, id) => selectId(kind, id, true)}
                undo={() => undo()}
                canUndo={!!workspace.past.length}
                exactBatch={exactBatch}
                applyExact={(batch) =>
                  mergeBatch(
                    batch,
                    'Reviewed duplicate cleanup applied. Undo restores the batch.',
                  )
                }
              />
            ) : (
              <EditorReview
                tab={tab}
                state={state}
                onPublishedWorkspace={setPublishedWorkspace}
                draftCount={drafts.length}
                workspace={workspace}
                validation={validation}
                baselineVersion={base.version}
                publishedVersion={data.version}
                published={data}
                onIssue={openIssue}
                onSignIn={signIn}
                busy={busy}
                action={action}
                mapRef={mapRef}
                preview={preview}
                setPreview={setPreview}
                review={review}
                setReview={setReview}
                onLocateBuilding={(id) => selectId('building', id, true)}
                onApplyAppearances={async (batch) => {
                  if (
                    tool ||
                    workspace.unfinished ||
                    workspace.roofDraft ||
                    workspace.status === 'Conflict'
                  )
                    return;
                  const original = workspace.edits;
                  const originalBase = currentBase.current;
                  setBusy(true);
                  try {
                    const checked = await validation.check([
                      ...original.filter(
                        (e) => !batch.some((b) => editKey(b) === editKey(e)),
                      ),
                      ...batch,
                    ]);
                    if (
                      workspace.edits !== original ||
                      currentBase.current !== originalBase ||
                      workspace.unfinished ||
                      workspace.roofDraft
                    )
                      throw new Error(
                        'The draft changed. Review the appearance batch again.',
                      );
                    const errors = checked.errors.filter(
                      (e) => !validation.errors.includes(e),
                    );
                    if (!checked.usable || errors.length)
                      throw new Error(
                        errors.join(' ') ||
                          'The proposed appearances could not be validated.',
                      );
                    workspace.commit(batch);
                    const current = batch.find(
                      (e) =>
                        e.kind === selectedRef.current?.kind &&
                        e.id === selectedRef.current?.id,
                    );
                    if (current) {
                      setSelected(current);
                      selectedRef.current = current;
                    }
                    setMessage(
                      `${batch.length} building appearances applied. Undo restores the batch. Review a release preview before publishing.`,
                    );
                  } catch (error) {
                    setError((error as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}
          </aside>
        ) : selected && !preview ? (
          <EditorInspector
            photoOwner={owner}
            photoSaveStatus={workspace.status}
            publishedPhotos={data.photos}
            onPhotoUndo={() => undo()}
            onPhotos={(change) => {
              if (
                workspace.roofDraft ||
                workspace.unfinished ||
                validation.pending
              )
                throw Error(
                  'Finish the current edit and wait for map validation before changing photos.',
                );
              const batch = photoEdits(
                validation.data,
                workspace.edits,
                change,
              );
              workspace.commit(batch, null);
              const next = batch.find(
                (e) => e.id === selected.id && e.kind === selected.kind,
              );
              if (next) {
                setSelected(next);
                selectedRef.current = next;
              }
            }}
            onGeometry={(geometry) => {
              if (selected)
                stageRepair(
                  [remapBuildingSurfaces(selected, geometry)],
                  'Review corrected building geometry',
                );
            }}
            key={editKey(selected)}
            edit={selected}
            data={validation.data}
            issues={validation.issues
              .filter(
                (i) =>
                  i.featureId === selected.id &&
                  (!i.featureKind || i.featureKind === selected.kind),
              )
              .map((i) => i.message)}
            focusField={repairFocus?.field}
            onEndField={workspace.endHistoryGroup}
            buildingEditor={
              selected.kind === 'building' && (
                <Suspense fallback={<output>Loading building tools…</output>}>
                  <BuildingAppearanceEditor
                    reviewRequest={
                      repairFocus?.repair === 'review-model' ||
                      /^(height|floors|appearance|roof|wall)/i.test(
                        repairFocus?.field || '',
                      )
                        ? repairFocus || undefined
                        : undefined
                    }
                    onReviewOpened={() => setRepairFocus(null)}
                    workspace={workspace}
                    onHistory={undo}
                    edit={selected}
                    data={validation.data}
                    mode={buildingMode}
                    selection={buildingSelection}
                    onMode={(mode) => {
                      workspace.endHistoryGroup();
                      setBuildingMode(mode);
                      if (mode === 'roof')
                        setBuildingSelection((s) => ({
                          buildingId: selected.id,
                          partId: s?.partId,
                        }));
                    }}
                    onSelection={(value) => {
                      workspace.endHistoryGroup();
                      setBuildingSelection(value);
                    }}
                    onEdit={(edit, field) => {
                      workspace.commit(
                        [edit],
                        workspace.unfinished,
                        field ? `${editKey(edit)}:${field}` : undefined,
                      );
                      setSelected(edit);
                      selectedRef.current = edit;
                    }}
                    roofDraft={workspace.roofDraft}
                    onRoofDraft={(value) => workspace.draftRoof(value)}
                    onApplyRoof={(edit) => {
                      workspace.applyRoof(edit);
                      setSelected(edit);
                      selectedRef.current = edit;
                      setMessage(
                        'Roof applied. Undo restores the previous roof.',
                      );
                    }}
                  />
                </Suspense>
              )
            }
            onProperty={(key, value, continuous) => {
              if (workspace.roofDraft) {
                setMessage(
                  'Apply or cancel the roof plan before changing other building properties.',
                );
                return;
              }
              const edit = {
                ...selected,
                properties: { ...selected.properties, [key]: value },
              };
              if (repairFocus) {
                stageRepair([edit], 'Review feature repair');
                return;
              }
              workspace.commit(
                [edit],
                workspace.unfinished,
                continuous ? `${editKey(edit)}:${key}` : undefined,
              );
              setSelected(edit);
              selectedRef.current = edit;
            }}
            onEntrance={addEntrance}
            onApproach={approach}
            onPick={pick}
            onDisconnect={disconnect}
            onDelete={remove}
            onRestorePublished={
              publishedBuilding
                ? () =>
                    stageRepair(
                      [publishedBuilding],
                      'Restore published building · review before applying',
                    )
                : undefined
            }
            onClose={() => {
              workspace.endHistoryGroup();
              setFocusRequest(null);
              if (selectionOverview.current)
                mapRef.current?.easeTo({
                  ...selectionOverview.current,
                  pitch: mapRef.current.getPitch(),
                  duration: 450,
                });
              selectionOverview.current = null;
              setSelected(null);
              setBuildingSelection(undefined);
              selectedRef.current = null;
              controller.current?.select(null);
            }}
          />
        ) : (
          !tool &&
          !preview &&
          !welcomeDismissed && (
            <aside className="editor-welcome editor-card">
              <button
                type="button"
                className="editor-icon editor-welcome-dismiss"
                aria-label="Dismiss welcome card"
                title="Dismiss welcome card"
                onClick={() => {
                  setWelcomeDismissed(true);
                  try {
                    localStorage.setItem(
                      'turnright:editor-welcome-dismissed',
                      'true',
                    );
                  } catch {
                    // Dismiss for this visit when browser storage is unavailable.
                  }
                  mapRef.current?.getCanvas().focus();
                }}
              >
                <X size={18} aria-hidden="true" />
              </button>
              <span className="editor-welcome-icon">
                <DoorOpen size={23} />
              </span>
              <span className="editor-eyebrow">FILL IN THE MISSING PIECES</span>
              <h2>
                A better way
                <br />
                into every place.
              </h2>
              <p>
                Select a building, mark its entrance, and connect it to the
                paths people walk.
              </p>
              <div>
                <span>1</span> Choose a place on the map
              </div>
              <div>
                <span>2</span> Add entrances and paths
              </div>
              <div>
                <span>3</span> Test, review, and publish
              </div>
              <button
                className="editor-primary"
                onClick={() => {
                  setFilter('needs');
                  setExplorer(true);
                }}
              >
                Find places to map <ArrowUpRight size={16} />
              </button>
            </aside>
          )
        )}
        {showRoutes && (
          <section className="editor-route-test editor-card">
            <div className="editor-panel-heading">
              <h2>Test a walking route</h2>
              <button
                className="editor-icon"
                aria-label="Close route test"
                onClick={() => {
                  setShowRoutes(false);
                  setRoutes([]);
                }}
              >
                <X size={16} />
              </button>
            </div>
            {[
              [testOrigin, setTestOrigin, 'From'],
              [testDest, setTestDest, 'To'],
            ].map(([value, set, label]) => (
              <label className="field-label" key={String(label)}>
                {String(label)}
                <select
                  aria-label={`Test route ${label}`}
                  value={value as string}
                  onChange={(e) => (set as (s: string) => void)(e.target.value)}
                >
                  <option value="">Choose a place</option>
                  {validation.data.places
                    .filter((p) => placeHasConnection(validation.data, p))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
            ))}
            <button
              className="editor-primary"
              disabled={!testOrigin || !testDest || busy || validation.pending}
              onClick={previewTestRoute}
            >
              <RouteIcon size={16} /> Preview route
            </button>
            {routes.map((route, i) => (
              <p key={route.id}>
                {i ? 'Alternative' : 'Shortest walk'} · {meters(route.distance)}
                {route.destinationEntranceId && (
                  <small>
                    {' '}
                    Arrive at{' '}
                    {
                      validation.data.entrances?.find(
                        (e) => e.id === route.destinationEntranceId,
                      )?.name
                    }
                  </small>
                )}
              </p>
            ))}
          </section>
        )}
        <div className="editor-bottom">
          <div className="editor-legend editor-card">
            <span>
              <i className="new" />
              New
            </span>
            <span>
              <i className="modified" />
              Modified
            </span>
            <span>
              <i className="incomplete" />
              Needs attention
            </span>
            {threeD && <small>Muted 3D blocks = height unknown</small>}
          </div>
          <output className="editor-guidance editor-card">
            {preview
              ? 'Approved source geometry · read-only comparison'
              : hint || message}
            {tool && (
              <span className="editor-finish-controls">
                <span aria-live="polite" className="drawing-progress">
                  {progress.message}
                </span>
                <button
                  className="editor-primary"
                  disabled={!progress.canFinish}
                  title={
                    progress.canFinish ? 'Finish drawing' : progress.message
                  }
                  onClick={() => controller.current?.finish()}
                >
                  <Check size={15} /> Finish
                </button>
                <button className="editor-secondary" onClick={cancel}>
                  Cancel
                </button>
              </span>
            )}
          </output>
        </div>
        {workspace.roofDraft &&
          (selected?.id !== workspace.roofDraft.buildingId ||
            buildingMode !== 'roof') && (
            <div className="editor-recovery editor-card">
              <strong>Unfinished roof recovered</strong>
              <button
                className="editor-primary"
                onClick={() => {
                  const draft = workspace.roofDraft!;
                  selectId('building', draft.buildingId, true);
                  setBuildingMode('roof');
                  setBuildingSelection({
                    buildingId: draft.buildingId,
                    partId: draft.partId,
                  });
                }}
              >
                Resume roof
              </button>
              <button onClick={() => workspace.draftRoof(null)}>
                Discard roof
              </button>
            </div>
          )}
        {workspace.unfinished && !tool && (
          <div className="editor-recovery editor-card">
            <strong>Unfinished drawing recovered</strong>
            <button className="editor-primary" onClick={resume}>
              Resume drawing
            </button>
            <button
              className="editor-text"
              onClick={() => workspace.draft(null)}
            >
              Discard drawing
            </button>
          </div>
        )}
        {repairPreview && (
          <aside
            className="editor-repair-preview editor-card"
            aria-label="Review proposed repair"
          >
            <h2>{repairPreview.title}</h2>
            <p>Red: current geometry · Green: proposed geometry</p>
            {repairPreview.batch.map((e) => (
              <p key={editKey(e)}>
                {e.kind} · {String(e.properties.name || e.id)}
                {e.kind === 'entrance' && e.properties.placeId
                  ? ` · Serves ${validation.data.places.find((p) => p.id === e.properties.placeId)?.name || e.properties.placeId}`
                  : ''}
              </p>
            ))}
            {repairErrors.map((message) => (
              <p className="form-error" role="alert" key={message}>
                {message}
              </p>
            ))}
            <div className="button-row">
              <button
                className="editor-primary"
                disabled={
                  busy || validation.pending || !!tool || !!workspace.unfinished
                }
                onClick={applyRepair}
              >
                Apply reviewed repair
              </button>
              <button className="editor-secondary" onClick={dismissRepair}>
                Cancel repair
              </button>
            </div>
          </aside>
        )}
        {conflictServer && (
          <EditorConflictReview
            workspace={workspace}
            server={conflictServer}
            onSignIn={signIn}
            close={() => {
              setConflictServer(null);
              setReviewOverlay([]);
            }}
            resolved={() => {
              setConflictServer(null);
              setReviewOverlay([]);
              setSelected(null);
              selectedRef.current = null;
              controller.current?.select(null);
            }}
            compare={(local, remote) => {
              setReviewOverlay([
                ...[local].filter(Boolean).map((e) => ({
                  type: 'Feature' as const,
                  geometry: e!.geometry,
                  properties: { color: '#c26ce3' },
                })),
                ...[remote].filter(Boolean).map((e) => ({
                  type: 'Feature' as const,
                  geometry: e!.geometry,
                  properties: { color: '#26a07c' },
                })),
              ]);
              if (local || remote) select(local || remote!, true);
            }}
          />
        )}
        {(error || taskError || workspace.error) && (
          <div className="editor-error-stack">
            {error && (
              <div className="editor-card editor-error-row" role="alert">
                <span>{error}</span>
                <button className="editor-text" onClick={() => setError('')}>
                  Dismiss message
                </button>
              </div>
            )}
            {taskError && (
              <div className="editor-card editor-error-row" role="alert">
                <span>{taskError.message}</span>
                <button
                  className="editor-secondary"
                  onClick={() => {
                    if (taskError.auth) signIn();
                    else taskError.retry();
                  }}
                >
                  {taskError.auth ? 'Sign in again' : taskError.label}
                </button>
                <button
                  className="editor-text"
                  onClick={() => setTaskError(null)}
                >
                  Dismiss action error
                </button>
              </div>
            )}
            {workspace.error && (
              <div className="editor-card editor-error-row" role="alert">
                <span>{workspace.error}</span>
                {workspace.status === 'Conflict' ? (
                  <button
                    className="editor-secondary"
                    onClick={reviewConflicts}
                  >
                    Review conflicts
                  </button>
                ) : (
                  <button
                    className="editor-secondary"
                    onClick={async () => {
                      if ([401, 403].includes(workspace.errorStatus))
                        await signIn();
                      else {
                        if (
                          workspace.status === 'Recovery unavailable' &&
                          !(await workspace.preserveRecovery())
                        )
                          return;
                        await workspace.flush();
                      }
                    }}
                  >
                    {[401, 403].includes(workspace.errorStatus)
                      ? 'Sign in again'
                      : workspace.status === 'Recovery unavailable'
                        ? 'Retry local recovery'
                        : 'Retry save'}
                  </button>
                )}
                <button className="editor-text" onClick={localRecovery}>
                  Download local recovery
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
