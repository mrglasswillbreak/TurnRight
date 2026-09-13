import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ArrowUp,
  Box,
  Building2,
  Check,
  ChevronLeft,
  DoorOpen,
  Download,
  Layers,
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
import { api, supabase } from './supabase';
import { assembleSources, type SourceRecord } from './editor-model';
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
import { drawingProgress } from './drawing-state';
import { SurveyPanel } from './SurveyPanel';
import { readSurveyContext, writeSurveyContext } from './survey-storage';
import {
  EditorWorkspace,
  editKey,
  type WorkspaceRecovery,
} from './editor-workspace';
import { useEditorWorkspace } from './useEditorWorkspace';
import { EditorInspector } from './EditorInspector';
import { EditorReview, type ReviewState } from './EditorReview';
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

interface EditorState extends ReviewState {
  edits: MapEdit[];
}
interface OfflineEditor {
  state: EditorState;
  sources: SourceRecord[];
  data: CampusData;
  prepared: boolean;
}
export default function Admin({
  data,
  dark = false,
  updateReady = false,
  installUpdate,
}: {
  data: CampusData;
  dark?: boolean;
  updateReady?: boolean;
  installUpdate?: () => Promise<void>;
}) {
  const [owner, setOwner] = useState<string | null>(null);
  const [state, setState] = useState<EditorState | null>(null);
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [workspace, setWorkspace] = useState<EditorWorkspace | null>(null);
  const [error, setError] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    if (!supabase) return;
    if (!navigator.onLine)
      setOwner(localStorage.getItem('turnright:offline-owner'));
    else
      void supabase.auth
        .getSession()
        .then(({ data }) =>
          setOwner(
            data.session?.user.id ||
              (!navigator.onLine
                ? localStorage.getItem('turnright:offline-owner')
                : null),
          ),
        );
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT')
          localStorage.removeItem('turnright:offline-owner');
        setOwner(
          session?.user.id ||
            (!navigator.onLine && event !== 'SIGNED_OUT'
              ? localStorage.getItem('turnright:offline-owner')
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
      if (!navigator.onLine) {
        const cached = await readSurveyContext<OfflineEditor>(owner);
        if (!cached?.prepared)
          throw new Error(
            'Prepare for offline survey while online before opening the editor offline.',
          );
        return [cached.state, { features: cached.sources }] as const;
      }
      const result = await Promise.all([
        api<EditorState>('state'),
        api<{ features: SourceRecord[] }>('sources'),
      ]);
      localStorage.setItem('turnright:offline-owner', owner);
      return result;
    };
    void Promise.all([
      load(),
      getPreference<WorkspaceRecovery | null>(key, null),
    ])
      .then(([[result, source], recovery]) => {
        if (request !== generation.current) return;
        setSources(source.features);
        setState(result);
        setWorkspace(
          new EditorWorkspace(
            result.edits,
            (batch) => api<MapEdit[]>('save-edits', batch),
            (snapshot) => setPreference(key, snapshot),
            recovery,
          ),
        );
        setError('');
      })
      .catch((e) => {
        if (request === generation.current) setError(e.message);
      });
  }, [owner]);
  const refresh = async () => {
    const [result, source] = await Promise.all([
      api<EditorState>('state'),
      api<{ features: SourceRecord[] }>('sources'),
    ]);
    setState(result);
    setSources(source.features);
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
    <Editor
      data={data}
      dark={dark}
      state={state}
      sources={sources}
      workspace={workspace}
      refresh={refresh}
      owner={owner!}
      updateReady={updateReady}
      installUpdate={installUpdate}
      prepareOffline={async () => {
        if (!navigator.onLine)
          throw new Error(
            'Connect to verify this owner and prepare the offline map.',
          );
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
        } satisfies OfflineEditor);
        localStorage.setItem('turnright:offline-owner', owner!);
      }}
    />
  );
}

function Editor({
  data,
  dark,
  state,
  sources,
  workspace: store,
  refresh,
  owner,
  prepareOffline,
  updateReady,
  installUpdate,
}: {
  data: CampusData;
  dark: boolean;
  state: EditorState;
  sources: SourceRecord[];
  workspace: EditorWorkspace;
  refresh: () => Promise<MapEdit[]>;
  owner: string;
  prepareOffline: () => Promise<void>;
  updateReady?: boolean;
  installUpdate?: () => Promise<void>;
}) {
  const workspace = useEditorWorkspace(store);
  const [survey, setSurvey] = useState(false),
    [surveyRecording, setSurveyRecording] = useState(false);
  const surveying = useRef(false);
  surveying.current = survey;
  const [tab, setTab] = useState('map'),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('needs'),
    [explorer, setExplorer] = useState(true);
  const [selected, setSelected] = useState<MapEdit | null>(null),
    [tool, setTool] = useState<MapEdit['kind'] | null>(null);
  const [threeD, setThreeD] = useState(() => {
    try {
      return localStorage.getItem('turnright:editor-view') === '3d';
    } catch {
      return false;
    }
  });
  const [opacity, setOpacity] = useState(0.8),
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
  const calculate = useRoutes();
  const base = useMemo(() => assembleSources(sources, data), [sources, data]);
  const validation = useEditorValidation(base, workspace.edits);
  const autoReviewed = useRef(new WeakSet<CampusData>());
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
  useEffect(() => {
    if (
      tab !== 'duplicates' ||
      validation.pending ||
      busy ||
      tool ||
      workspace.unfinished ||
      autoReviewed.current.has(base)
    )
      return;
    autoReviewed.current.add(base);
    const batch = exactDuplicateEdits(
      validation.data,
      workspace.edits,
      validation.duplicates,
    );
    if (batch.length)
      void mergeBatch(
        batch,
        `${batch.filter((e) => e.deleted).length} exact duplicate records consolidated. Undo is available.`,
      );
  }, [
    tab,
    validation,
    base,
    busy,
    tool,
    workspace.edits,
    workspace.unfinished,
    mergeBatch,
  ]);
  const visible = preview ? base : validation.data;
  const invalid = useMemo(
    () =>
      new Set(
        workspace.edits
          .filter((e) =>
            validation.errors.some(
              (issue) =>
                issue.startsWith(`${e.id}:`) ||
                issue.startsWith(`${e.properties.name}:`),
            ),
          )
          .map((e) => e.id),
      ),
    [validation, workspace.edits],
  );
  const select = (edit: MapEdit, focus = false) => {
    if (workspace.unfinished) {
      setMessage(
        'Finish or cancel the current drawing before selecting another feature.',
      );
      return;
    }
    setSelected(edit);
    selectedRef.current = edit;
    setTool(null);
    setPreview(false);
    setTab('map');
    controller.current?.select(edit);
    if (focus) {
      let point: Position | undefined;
      if (edit.geometry.type === 'Point')
        point = edit.geometry.coordinates as Position;
      else if (edit.geometry.type === 'LineString')
        point = edit.geometry.coordinates[0] as Position;
      else if (edit.geometry.type === 'Polygon')
        point = edit.geometry.coordinates[0][0] as Position;
      if (point)
        mapRef.current?.easeTo({
          center: point,
          zoom: Math.max(mapRef.current.getZoom(), 18),
          duration: 450,
        });
    }
  };
  const selectId = (kind: MapEdit['kind'], id: string, focus = false) => {
    const edit = featureEdit(validation.data, kind, id, workspace.edits);
    if (edit) select(edit, focus);
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
  const begin = (
    kind: MapEdit['kind'],
    props: MapEdit['properties'] = {},
    seed?: Position[],
  ) => {
    if (tool || workspace.unfinished) {
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
      edit.properties.entranceId
    ) {
      const entrance = workspace.edits.find(
        (e) => e.kind === 'entrance' && e.id === edit.properties.entranceId,
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
    commit([edit]);
    setMessage('Connection updated. Test a route to check the result.');
  };
  const disconnect = (vertexId?: string) => {
    const current = selectedRef.current;
    if (!current) return;
    const edit = structuredClone(current);
    if (edit.kind === 'entrance') {
      delete edit.properties.connection;
      delete edit.properties.connectTo;
    } else {
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
      select: (kind, id) => live.current.selectId(kind, id),
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
      workspace.edits,
      base,
      invalid,
      preview || survey,
    );
  }, [validation, workspace.edits, base, invalid, preview, ready, survey]);
  useEffect(() => {
    const features: Feature[] = [];
    for (const [side, color] of [
      [review?.before, '#d45555'],
      [review?.after, '#26a07c'],
    ] as const) {
      const record = side as {
        payload?: { geometry?: Geometry; coordinates?: Position };
      } | null;
      const p = record?.payload;
      const geometry =
        p?.geometry ||
        (p?.coordinates
          ? { type: 'Point' as const, coordinates: p.coordinates }
          : undefined);
      if (geometry)
        features.push({ type: 'Feature', properties: { color }, geometry });
    }
    controller.current?.review(tab === 'changes' ? features : []);
  }, [review, ready, tab]);
  const undo = (redo = false) => {
    if (tool) {
      controller.current?.cancel();
      setTool(null);
      restoreDrawingPanels();
    }
    if (redo) workspace.redo();
    else workspace.undo();
    const previous = selectedRef.current;
    const next =
      previous && workspace.edits.find((e) => editKey(e) === editKey(previous));
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
  const action = async (name: string, payload: unknown, success: string) => {
    setBusy(true);
    setError('');
    try {
      if (!(await workspace.flush()))
        throw new Error(workspace.error || 'Save or repair the draft first.');
      if (name === 'prepare-release') {
        const check = await validation.check(workspace.saved);
        if (workspace.unfinished || check.errors.length)
          throw new Error(
            check.errors[0] ||
              'Finish the current drawing before preparing a release.',
          );
      }
      await api(name, payload);
      workspace.reconcile(await refresh(), true);
      setMessage(success);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const exportBackup = async () => {
    try {
      const server = await api('export');
      const url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              {
                server,
                local: workspace.edits,
                unfinished: workspace.unfinished,
              },
              null,
              2,
            ),
          ],
          { type: 'application/json' },
        ),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `turnright-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const issues = useMemo(
    () => [...validation.errors, ...validation.warnings],
    [validation],
  );
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
        issues.some(
          (i) =>
            i.startsWith(`${edit.id}:`) ||
            i.startsWith(`${edit.properties.name}:`),
        )
      )
        result.unshift({
          id: edit.id,
          kind: edit.kind,
          name: String(edit.properties.name),
          reason: invalid.has(edit.id) ? 'Needs repair' : 'Review connection',
        });
    const grouped = new Map<string, (typeof result)[number]>();
    for (const task of result) {
      const key = `${task.kind}:${task.id}`,
        previous = grouped.get(key);
      const reasons = issues
        .filter(
          (issue) =>
            issue.startsWith(`${task.id}:`) ||
            issue.startsWith(`${task.name}:`),
        )
        .map((issue) => issue.slice(issue.indexOf(':') + 1).trim());
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
  }, [validation, workspace.edits, invalid, issues]);
  const visibleTasks = tasks.filter(
    (t) =>
      `${t.name} ${t.reason}`.toLowerCase().includes(search.toLowerCase()) &&
      (filter === 'all' ||
        (filter === 'needs' &&
          (!t.reason.startsWith('Mapped') || t.reason.includes(' · '))) ||
        (filter === 'drafts' &&
          workspace.edits.some(
            (e) =>
              e.id === t.id &&
              e.kind === t.kind &&
              !(e.deleted && e.properties.revertToSource),
          ))),
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
      {updateReady && (
        <output className="editor-update">
          App update ready.{' '}
          {surveyRecording
            ? 'Pause recording before updating.'
            : 'Recovery data will be kept.'}
          <button
            disabled={surveyRecording}
            onClick={async () => {
              if (await workspace.flush()) await installUpdate?.();
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
          ].map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? 'active' : ''}
              disabled={!!tool || !!workspace.unfinished}
              onClick={() => {
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
          <button
            className="editor-icon"
            aria-label="Export backup"
            title="Export backup"
            onClick={exportBackup}
          >
            <Download size={17} />
          </button>
          <button
            className="editor-icon"
            aria-label="Refresh workspace"
            title="Refresh workspace"
            onClick={async () => {
              if (await workspace.flush()) {
                try {
                  workspace.reconcile(await refresh(), true);
                } catch (e) {
                  setError((e as Error).message);
                }
              }
            }}
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
      <section className="editor-map-workspace" aria-label="Mapping workspace">
        <MapView
          data={visible}
          dark={dark}
          threeD={threeD}
          editor
          buildingOpacity={
            survey ||
            tool === 'entrance' ||
            tool === 'path' ||
            tool === 'barrier' ||
            tool === 'building' ||
            selected?.kind === 'building'
              ? 0.2
              : opacity
          }
          routes={routes}
          panelBesideMap
          onSelect={() => {}}
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
              const reachable = new Set(
                validation.data.graph.nodes.map((n) => n.id),
              );
              let expanded = true;
              while (expanded) {
                expanded = false;
                for (const e of checked.data.graph.edges) {
                  if (!e.accessible || e.geometryBlocked) continue;
                  if (reachable.has(e.from) && !reachable.has(e.to)) {
                    reachable.add(e.to);
                    expanded = true;
                  }
                  if (reachable.has(e.to) && !reachable.has(e.from)) {
                    reachable.add(e.from);
                    expanded = true;
                  }
                }
              }
              for (const edit of edits.filter(
                (e) => e.kind === 'path' && !e.deleted,
              )) {
                if (
                  !checked.data.graph.edges.some(
                    (e) =>
                      e.sourceId === edit.id &&
                      (reachable.has(e.from) || reachable.has(e.to)),
                  )
                )
                  throw new Error(
                    'This section has no usable connection to the mapped network. Keep it as a saved survey until connected.',
                  );
              }
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
                (!!kind && (!!tool || !!workspace.unfinished))
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
                  <p className="editor-empty">No matching features.</p>
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
          <div className="editor-view-toggle">
            <button
              aria-pressed={!threeD}
              className={!threeD ? 'active' : ''}
              onClick={() => toggleView(false)}
            >
              <Layers size={16} />
              2D
            </button>
            <button
              aria-pressed={threeD}
              className={threeD ? 'active' : ''}
              onClick={() => toggleView(true)}
            >
              <Box size={16} />
              3D
            </button>
          </div>
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
              <label title="Map tilt">
                Tilt
                <input
                  aria-label="Map tilt"
                  type="range"
                  min={15}
                  max={60}
                  defaultValue={50}
                  onChange={(e) =>
                    mapRef.current?.setPitch(Number(e.target.value))
                  }
                />
              </label>
              <label title="Building opacity">
                Buildings
                <input
                  aria-label="Building opacity"
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))}
                />
              </label>
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
        {tab !== 'map' ? (
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
              />
            ) : (
              <EditorReview
                tab={tab}
                state={state}
                workspace={workspace}
                validation={validation}
                busy={busy}
                action={action}
                mapRef={mapRef}
                preview={preview}
                setPreview={setPreview}
                review={review}
                setReview={setReview}
              />
            )}
          </aside>
        ) : selected && !preview ? (
          <EditorInspector
            key={editKey(selected)}
            edit={selected}
            data={validation.data}
            issues={issues.filter(
              (i) =>
                i.startsWith(`${selected.id}:`) ||
                i.startsWith(`${selected.properties.name}:`),
            )}
            onProperty={(key, value) => {
              const edit = {
                ...selected,
                properties: { ...selected.properties, [key]: value },
              };
              workspace.commit([edit]);
              setSelected(edit);
              selectedRef.current = edit;
            }}
            onEntrance={addEntrance}
            onApproach={approach}
            onPick={pick}
            onDisconnect={disconnect}
            onDelete={remove}
            onClose={() => {
              setSelected(null);
              selectedRef.current = null;
              controller.current?.select(null);
            }}
          />
        ) : (
          !tool &&
          !preview && (
            <aside className="editor-welcome editor-card">
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
              onClick={async () => {
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
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
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
        {(error || workspace.error) && (
          <div className="editor-error editor-card" role="alert">
            <span>{error || workspace.error}</span>
            {workspace.status === 'Conflict' ? (
              <>
                <button
                  className="editor-secondary"
                  onClick={async () => {
                    workspace.reconcile(await refresh(), true);
                    void workspace.flush();
                  }}
                >
                  Keep my changes
                </button>
                <button
                  className="editor-secondary"
                  onClick={async () => {
                    workspace.reconcile(await refresh(), false);
                    setSelected(null);
                    controller.current?.select(null);
                  }}
                >
                  Use server draft
                </button>
              </>
            ) : (
              <button
                className="editor-secondary"
                onClick={() => {
                  setError('');
                  void workspace.flush();
                }}
              >
                Retry
              </button>
            )}
            <button
              className="editor-icon"
              aria-label="Dismiss message"
              onClick={() => setError('')}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
