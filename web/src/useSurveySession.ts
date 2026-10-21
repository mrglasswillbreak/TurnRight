import { surveyReviewActions, type Selection } from './survey-review-actions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MapInstance } from 'maplibre-gl';
import { distance } from './geo';
import type { CampusData, MapEdit, Position } from './types';
import {
  newSurvey,
  surveyId,
  reviewCommand,
  replacementTarget,
  SURVEY_LIMITS,
  type SurveyRecording,
  type SurveySession,
  type SurveyMarker,
} from './survey-model';
import { SurveyRecorder } from './survey-recorder';
import { useMotionSession } from './MotionAssistance';
import { motionService } from './motion-service';
import { listLocalSurveys, saveSurveyLocal } from './survey-storage';
import {
  listRemoteSurveys,
  syncSurvey,
  type RemoteSurvey,
} from './survey-sync';
import { api } from './supabase';
import { supabase } from './supabase';
import { useSurveyMap } from './useSurveyMap';

export interface SurveyPanelProps {
  owner: string;
  map: MapInstance;
  data: CampusData;
  edits: MapEdit[];
  selected: MapEdit | null;
  apply: (edits: MapEdit[], previousIds: string[]) => Promise<MapEdit[]>;
  close: () => void;
  prepareOffline: () => Promise<void>;
  recordingChanged: (recording: boolean) => void;
  view2D: () => void;
}
export type { Selection } from './survey-review-actions';
export function useSurveySession({
  owner,
  map,
  data,
  edits,
  selected,
  apply,
  close,
  prepareOffline,
  recordingChanged,
  view2D,
}: SurveyPanelProps) {
  const [recording, setRecording] = useState<SurveyRecording | null>(null),
    [version, redraw] = useState(0);

  const [local, setLocal] = useState<SurveySession[]>([]),
    [remote, setRemote] = useState<RemoteSurvey[]>([]);

  const [screen, setScreen] = useState<'home' | 'saved' | 'survey' | 'replace'>(
    'home',
  );

  const [selection, setSelection] = useState<Selection | null>(null),
    [marker, setMarker] = useState<SurveyMarker | null>(null);

  const [reselecting, setReselecting] = useState(false);

  const [syncEpoch, setSyncEpoch] = useState(0);

  const attemptedSync = useRef('');

  const [query, setQuery] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);

  const [following, setFollowing] = useState(true),
    [center, setCenter] = useState<Position>(
      map.getCenter().toArray() as Position,
    );

  const [path, setPath] = useState<MapEdit | null>(
      selected?.kind === 'path' ? selected : null,
    ),
    [boundaries, setBoundaries] = useState<number[]>([]);

  const [cutStart, setCutStart] = useState<number | null>(null),
    [connect, setConnect] = useState(false),
    [collapsed, setCollapsed] = useState(false);

  const controller = useRef<SurveyRecorder | null>(null),
    live = useRef({ recording, screen, selection, following, path });

  live.current = { recording, screen, selection, following, path };

  const session = recording?.session;

  const active = session?.state === 'recording';

  useMotionSession(active);

  const connectionData = useMemo(
    () => ({
      ...data,
      graph: {
        ...data.graph,
        edges: data.graph.edges.filter(
          (e) => !session?.generatedCorrectionIds.includes(e.sourceId),
        ),
      },
    }),
    [data, session?.generatedCorrectionIds],
  );

  const nodes = useMemo(
    () => new Map(data.graph.nodes.map((n) => [n.id, n])),
    [data.graph.nodes],
  );

  const connectCenter = connect ? center : null;

  const changed = () => redraw((n) => n + 1);

  const crosshair = useCallback((): Position => {
    const canvas = map.getCanvas();
    return map
      .unproject([
        canvas.clientWidth / 2,
        canvas.clientHeight * (innerWidth < 700 ? 0.32 : 0.5),
      ])
      .toArray() as Position;
  }, [map]);

  const attempt = async (work: () => Promise<void>) => {
    if (busy) return;
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const persist = async () => {
    await controller.current?.persistChanges();
    changed();
  };

  const run = useRef(attempt);

  run.current = attempt;

  const command = (work: Parameters<typeof reviewCommand>[1]) => {
    if (!session) return;
    try {
      reviewCommand(session, work);
      void attempt(persist);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const open = (r: SurveyRecording) => {
    controller.current?.dispose();
    controller.current = new SurveyRecorder(r, changed);
    controller.current.mappingArea = data;
    setRecording(r);
    setScreen('survey');
    setSelection(null);
    setMarker(r.session.pendingMarker || null);
    setFollowing(true);
    setError('');
  };

  const saved = async () => {
    setScreen('saved');
    setLocal(await listLocalSurveys(owner));
    if (navigator.onLine)
      try {
        setRemote(await listRemoteSurveys());
      } catch (e) {
        setMessage(`Local surveys available. ${(e as Error).message}`);
      }
  };

  useEffect(() => {
    return () => {
      void controller.current?.pause('Survey closed. Tap Resume to continue.');
      controller.current?.dispose();
      recordingChanged(false);
    };
  }, [recordingChanged]);

  useEffect(() => {
    recordingChanged(!!active);
  }, [active, recordingChanged]);

  useEffect(() => {
    const recorder = controller.current;
    if (!recorder) return;
    if (
      JSON.stringify(recorder.recording.session.pendingMarker) ===
      JSON.stringify(marker || undefined)
    )
      return;
    recorder.recording.session.pendingMarker = marker || undefined;
    void recorder.persistChanges().catch((e: Error) => setError(e.message));
  }, [marker, recording?.session.id]);

  useEffect(() => {
    const online = () => setSyncEpoch((n) => n + 1);
    window.addEventListener('online', online);
    const auth = supabase?.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN')
        queueMicrotask(online);
    });
    return () => {
      window.removeEventListener('online', online);
      auth?.data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const pending = recording?.session.pendingUpload;
    if (!recording || !pending || busy || active || !navigator.onLine) return;
    const key = `${pending.revisionId}:${syncEpoch}`;
    if (attemptedSync.current === key) return;
    attemptedSync.current = key;
    void run.current(async () => {
      await syncSurvey(recording, setMessage);
      changed();
    });
  }, [recording, session?.pendingUpload?.revisionId, busy, active, syncEpoch]);
  const fix = controller.current?.latest;
  useSurveyMap({
    map,
    data,
    setCenter,
    crosshair,
    setFollowing,
    live,
    screen,
    setPath,
    edits,
    setBoundaries,
    recording,
    marker,
    setSelection,
    setCutStart,
    selection,
    path,
    boundaries,
    fix,
    connectCenter,
    nodes,
    version,
  });

  useEffect(() => {
    if (active && following && fix?.status === 'accepted')
      map.easeTo({
        center: fix.coordinates,
        zoom: Math.max(18, map.getZoom()),
        duration: 400,
      });
  }, [fix, following, active, map]);

  const start = async (replace = false) => {
    void motionService().requestFromGesture();
    const r = newSurvey(owner, data.version);
    if (replace) {
      if (!path || boundaries.length !== 2)
        throw new Error('Select a path and both replacement boundaries.');
      r.session.replacement = replacementTarget(
        path,
        data,
        ...([...boundaries].sort((a, b) => a - b) as [number, number]),
      );
      r.session.name = String(path.properties.name || 'Corrected path');
    }
    await saveSurveyLocal(r.session);
    open(r);
    view2D();
    map.easeTo({ pitch: 0, bearing: 0, duration: 250 });
    await controller.current!.resume();
  };

  const resume = () => {
    void motionService().requestFromGesture();
    return controller.current!.resume();
  };

  const markEntrance = async () => {
    const sample = recording?.samples.findLast(
      (s) => s.status === 'accepted' || s.status === 'duplicate',
    );
    if (!sample || Date.now() - sample.timestamp > SURVEY_LIMITS.age)
      throw new Error(
        'Wait for a recent usable GPS fix before marking an entrance.',
      );
    await controller.current!.pause(
      'Review entrance position, then Resume when ready.',
    );
    const nearby = data.places.filter(
      (p) => distance(p.coordinates, sample.coordinates) < 30,
    );
    const place =
      selected?.kind === 'place'
        ? data.places.find((p) => p.id === selected.id)
        : selected?.kind === 'building'
          ? data.places.find((p) => p.id === selected.id)
          : nearby.length === 1
            ? nearby[0]
            : undefined;
    setMarker({
      id: surveyId(),
      sampleId:
        (sample.status === 'duplicate'
          ? recording?.samples.findLast(
              (s) =>
                s.status === 'accepted' && s.segmentId === sample.segmentId,
            )?.id
          : sample.id) || sample.id,
      segmentId: sample.segmentId,
      coordinates: sample.coordinates,
      accuracy: sample.accuracy,
      name: 'Entrance',
      observedAt: new Date(sample.timestamp).toISOString(),
      placeId: place?.id || '',
      buildingId: selected?.kind === 'building' ? selected.id : undefined,
      access: 'yes',
    });
    map.easeTo({ center: sample.coordinates, zoom: 20, pitch: 0 });
    setFollowing(false);
  };

  const {
    selectedLine,
    vertexIndex,
    selectedMarker,
    snap,
    reviewSnap,
    placeHere,
    editLine,
  } = surveyReviewActions({
    session,
    selection,
    connect,
    connectionData,
    center,
    map,
    command,
  });
  const archive = async (s: SurveySession) => {
    const archived = !s.archived;
    if (s.remoteRevision)
      await api('survey-save', {
        command: 'archive',
        surveyId: s.id,
        expectedRevision: s.remoteRevision,
        archived,
      });
    s.archived = archived;
    await saveSurveyLocal(s);
    await saved();
  };

  const quality = fix
    ? fix.accuracy <= 8
      ? 'Good'
      : fix.accuracy <= 15
        ? 'Usable'
        : 'Insufficient'
    : 'Waiting for GPS';
  return {
    map,
    fix,
    active,
    busy,
    attempt,
    controller,
    close,
    collapsed,
    setCollapsed,
    screen,
    message,
    error,
    recording,
    open,
    setMessage,
    start,
    setReselecting,
    setScreen,
    saved,
    prepareOffline,
    query,
    setQuery,
    data,
    edits,
    setPath,
    setBoundaries,
    center,
    path,
    boundaries,
    reselecting,
    session,
    persist,
    local,
    owner,
    archive,
    remote,
    command,
    marker,
    setMarker,
    changed,
    resume,
    setSelection,
    selectedLine,
    selectedMarker,
    vertexIndex,
    connect,
    setConnect,
    snap,
    reviewSnap,
    placeHere,
    editLine,
    cutStart,
    setCutStart,
    quality,
    markEntrance,
    setFollowing,
    apply,
    setCenter,
    crosshair,
    live,
    selected,
    selection,
    connectCenter,
    nodes,
    version,
  };
}
export type SurveySessionState = ReturnType<typeof useSurveySession>;
