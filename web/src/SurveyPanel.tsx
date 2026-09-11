import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Map as MapInstance,
  GeoJSONSource,
  MapMouseEvent,
} from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { featureEdit, snapTarget } from './editor-features';
import { distance } from './geo';
import type { CampusData, MapEdit, Position, WalkingAccess } from './types';
import {
  newSurvey,
  surveyId,
  reviewCommand,
  reviewUndo,
  replacementTarget,
  surveyCorrections,
  geometryFingerprint,
  surveyDistance,
  SURVEY_LIMITS,
  type SurveyRecording,
  type SurveySession,
  type SurveyMarker,
  type SurveyLine,
} from './survey-model';
import { SurveyRecorder } from './survey-recorder';
import {
  listLocalSurveys,
  loadSurveyLocal,
  saveSurveyLocal,
} from './survey-storage';
import {
  listRemoteSurveys,
  openRemoteSurvey,
  syncSurvey,
  type RemoteSurvey,
} from './survey-sync';
import { api } from './supabase';
import { supabase } from './supabase';
import './survey.css';

interface Props {
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
type Selection = { line: string; vertex: number } | { marker: string };
export function SurveyPanel({
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
}: Props) {
  const [recording, setRecording] = useState<SurveyRecording | null>(null),
    [version, redraw] = useState(0);
  const [local, setLocal] = useState<SurveySession[]>([]),
    [remote, setRemote] = useState<RemoteSurvey[]>([]);
  const [screen, setScreen] = useState<'home' | 'saved' | 'survey' | 'replace'>(
    'home',
  );
  const [selection, setSelection] = useState<Selection | null>(null),
    [marker, setMarker] = useState<SurveyMarker | null>(null);
  const [reselecting,setReselecting]=useState(false);
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
  const connectionData=useMemo(()=>({...data,graph:{...data.graph,edges:data.graph.edges.filter(e=>!session?.generatedCorrectionIds.includes(e.sourceId))}}),[data,session?.generatedCorrectionIds]);
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
    recorder.recording.session.pendingMarker = marker || undefined;
    void recorder.persistChanges().catch((e: Error) => setError(e.message));
  }, [marker, recording?.session.id]);
  useEffect(() => {
    const online = () => {
      const r = live.current.recording;
      if (r?.session.pendingUpload && r.session.state !== 'recording')
        void run.current(async () => {
          await syncSurvey(r, setMessage);
          changed();
        });
    };
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
    const empty: FeatureCollection = {
      type: 'FeatureCollection',
      features: [],
    };
    map.addSource('survey-overlay', { type: 'geojson', data: empty });
    map.addLayer({
      id: 'survey-lines',
      source: 'survey-overlay',
      type: 'line',
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['case', ['get', 'raw'], 6, 4],
        'line-opacity': ['case', ['get', 'raw'], 0.35, 1],
      },
    });
    map.addLayer({
      id: 'survey-points',
      source: 'survey-overlay',
      type: 'circle',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['case', ['get', 'selected'], 9, 5],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
      },
    });
    const move = () => setCenter(crosshair());
    const pan = () => setFollowing(false);
    const click = (event: MapMouseEvent) => {
      const state = live.current;
      if (state.screen === 'replace') {
        const features = map.queryRenderedFeatures(event.point, {
          layers: ['roads'].filter((id) => !!map.getLayer(id)),
        });
        const f = features.find((f) => f.properties?.kind === 'path');
        if (f) {
          setPath(
            featureEdit(data, 'path', String(f.properties.id), edits) || null,
          );
          setBoundaries([]);
        }
        return;
      }
      if (state.recording?.session.state !== 'review') return;
      let best = 24,
        hit: Selection | null = null;
      for (const line of state.recording.session.review)
        line.vertices.forEach((v, i) => {
          const p = map.project(v.coordinates),
            d = Math.hypot(p.x - event.point.x, p.y - event.point.y);
          if (d < best) {
            best = d;
            hit = { line: line.id, vertex: i };
          }
        });
      for (const m of state.recording.session.markers) {
        const p = map.project(m.coordinates),
          d = Math.hypot(p.x - event.point.x, p.y - event.point.y);
        if (d < best) {
          best = d;
          hit = { marker: m.id };
        }
      }
      if (hit) {
        setSelection(hit);
        setCutStart(null);
      }
    };
    map.on('move', move);
    map.on('dragstart', pan);
    map.on('click', click);
    move();
    return () => {
      map.off('move', move);
      map.off('dragstart', pan);
      map.off('click', click);
      for (const id of ['survey-points', 'survey-lines'])
        if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource('survey-overlay')) map.removeSource('survey-overlay');
    };
  }, [map, crosshair, data, edits]);
  useEffect(() => {
    const features: Feature[] = [];
    const line = (points: Position[], color: string, raw = false) => {
      if (points.length > 1)
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: points },
          properties: { color, raw },
        });
    };
    const point = (p: Position, color: string, selected = false) =>
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: p },
        properties: { color, selected },
      });
    if (recording) {
      for (const segment of recording.session.segments)
        line(
          recording.samples
            .filter(
              (s) => s.segmentId === segment.id && s.status === 'accepted',
            )
            .map((s) => s.coordinates),
          '#727b88',
          true,
        );
      for (const l of recording.session.review) {
        line(
          l.vertices.map((v) => v.coordinates),
          l.reviewed ? '#168365' : '#ee9636',
        );
        l.vertices.forEach((v, i) =>
          point(
            v.coordinates,
            v.pinned ? '#9b55c6' : '#168365',
            !!selection &&
              'line' in selection &&
              selection.line === l.id &&
              selection.vertex === i,
          ),
        );
      }
      for (const m of recording.session.markers)
        point(
          m.coordinates,
          '#b85197',
          !!selection && 'marker' in selection && selection.marker === m.id,
        );
      if (recording.session.replacement?.edit.geometry.type === 'LineString')
        line(
          recording.session.replacement.edit.geometry.coordinates as Position[],
          '#d95865',
          true,
        );
      for (const anchor of recording.session.replacement?.anchors || [])
        point(anchor.coordinates, '#9b55c6');
    }
    if (screen === 'replace' && path?.geometry.type === 'LineString') {
      line(path.geometry.coordinates as Position[], '#d95865');
      path.geometry.coordinates.forEach((p, i) =>
        point(p as Position, '#9b55c6', boundaries.includes(i)),
      );
    }
    const fix = controller.current?.latest;
    const accuracyMarker = marker || fix;
    if (
      accuracyMarker &&
      Number.isFinite(accuracyMarker.accuracy) &&
      accuracyMarker.accuracy > 0
    ) {
      const ring: Position[] = [];
      for (let i = 0; i <= 48; i++) {
        const angle = (i * Math.PI) / 24;
        ring.push([
          accuracyMarker.coordinates[0] +
            (Math.cos(angle) * accuracyMarker.accuracy) /
              (111320 *
                Math.cos((accuracyMarker.coordinates[1] * Math.PI) / 180)),
          accuracyMarker.coordinates[1] +
            (Math.sin(angle) * accuracyMarker.accuracy) / 111320,
        ]);
      }
      line(ring, '#538cdb', true);
      point(accuracyMarker.coordinates, '#307ede');
    }
    if (connectCenter) {
      for (const edge of data.graph.edges) {
        const a = nodes.get(edge.from),
          b = nodes.get(edge.to);
        if (
          a &&
          b &&
          (distance(connectCenter, a.coordinates) < 30 ||
            distance(connectCenter, b.coordinates) < 30)
        ) {
          line([a.coordinates, b.coordinates], '#4b83dd');
          point(a.coordinates, '#4b83dd');
          point(b.coordinates, '#4b83dd');
        }
      }
    }
    (map.getSource('survey-overlay') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features,
    });
  }, [
    version,
    recording,
    selection,
    marker,
    screen,
    path,
    boundaries,
    connectCenter,
    data.graph.edges,
    map,
    nodes,
  ]);
  const fix = controller.current?.latest;
  useEffect(() => {
    if (active && following && fix?.status === 'accepted')
      map.easeTo({
        center: fix.coordinates,
        zoom: Math.max(18, map.getZoom()),
        duration: 400,
      });
  }, [fix, following, active, map]);
  const start = async (replace = false) => {
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
      placeId: place?.id || '',
      buildingId: selected?.kind === 'building' ? selected.id : undefined,
      access: 'yes',
    });
    map.easeTo({ center: sample.coordinates, zoom: 20, pitch: 0 });
    setFollowing(false);
  };
  const selectedLine =
    selection && 'line' in selection
      ? session?.review.find((l) => l.id === selection.line)
      : undefined;
  const vertexIndex = selection && 'line' in selection ? selection.vertex : 0;
  const selectedMarker =
    selection && 'marker' in selection
      ? session?.markers.find((m) => m.id === selection.marker)
      : undefined;
  const snap = connect
    ? snapTarget(
        connectionData,
        center,
        (p) => map.project(p),
        session?.replacement?.edit.id,
      )
    : undefined;
  const reviewSnap = connect
    ? session?.review
        .flatMap((l) => l.vertices)
        .find((v) => {
          if (selectedLine?.vertices[vertexIndex]?.id === v.id) return false;
          const p = map.project(v.coordinates),
            q = map.project(center);
          return (
            distance(v.coordinates, center) <= 5 &&
            Math.hypot(p.x - q.x, p.y - q.y) <= 12
          );
        })
    : undefined;
  const placeHere = () =>
    command((state) => {
      const target =
        snap?.target ||
        (reviewSnap
          ? {
              type: 'node' as const,
              nodeId: reviewSnap.id,
              coordinates: reviewSnap.coordinates,
            }
          : undefined);
      if (connect && !target)
        throw new Error(
          'Move the crosshair onto a highlighted path or vertex (within 5 metres and 12 pixels).',
        );
      const coordinates = target?.coordinates || center;
      if (selectedMarker) {
        const m = state.markers.find((m) => m.id === selectedMarker.id)!;
        m.coordinates = coordinates;
        m.connection = target;
      }
      if (selectedLine) {
        const l = state.review.find((l) => l.id === selectedLine.id)!,
          v = l.vertices[vertexIndex];
        if (
          v.pinned &&
          session?.replacement?.anchors.some((a) => a.id === v.id)
        )
          throw new Error(
            'This junction is fixed. Move shared junctions with the editor’s separate command.',
          );
        v.coordinates = coordinates;
        v.connection = target;
        l.reviewed = false;
      }
    });
  const editLine = (fn: (line: SurveyLine) => void) =>
    command((s) => {
      const l = s.review.find((l) => l.id === selectedLine?.id);
      if (l) {
        fn(l);
        l.reviewed = false;
      }
    });
  const archive = async (s: SurveySession) => {
    s.archived = !s.archived;
    if (s.remoteRevision)
      await api('survey-save', {
        command: 'archive',
        surveyId: s.id,
        expectedRevision: s.remoteRevision,
        archived: s.archived,
      });
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
  return (
    <div className="survey-workspace">
      <div className="survey-crosshair" aria-hidden="true">
        +
      </div>
      <div className="survey-top">
        <strong>Survey</strong>
        <span>Awaiting field verification</span>
        <button
          onClick={() =>
            void attempt(async () => {
              await controller.current?.pause();
              await controller.current?.flush();
              close();
            })
          }
        >
          Close survey
        </button>
      </div>
      <section
        className={`survey-sheet ${collapsed ? 'collapsed' : ''}`}
        aria-label="Walking survey"
      >
        <button
          className="survey-collapse"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? 'Show survey controls' : 'More map space'}
        </button>
        {!collapsed && (
          <fieldset className="survey-content" disabled={busy}>
            {screen === 'home' && (
              <>
                <h2>Map it by walking</h2>
                <p>
                  Keep TurnRight visible while recording. Review the path and
                  connections before applying it.
                </p>
                <button
                  className="survey-primary"
                  onClick={() => void attempt(() => start())}
                >
                  Record new path
                </button>
                <button
                  onClick={() => {
                    setReselecting(false);
                    setScreen('replace');
                    setMessage(
                      'Select a mapped path, then its two boundary vertices.',
                    );
                  }}
                >
                  Correct existing path
                </button>
                <button onClick={() => void attempt(saved)}>
                  Saved surveys
                </button>
                <button
                  onClick={() =>
                    void attempt(async () => {
                      await prepareOffline();
                      setMessage(
                        'Ready for offline surveying on this device. Keep this owner signed in.',
                      );
                    })
                  }
                >
                  Prepare for offline survey
                </button>
              </>
            )}
            {screen === 'replace' && (
              <>
                <h2>Choose the section to replace</h2>
                <p>
                  Select a path on the map or search below. Move the crosshair
                  to each existing boundary vertex. Purple junctions stay fixed.
                </p>
                <input
                  aria-label="Find existing path"
                  placeholder="Find path"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div className="survey-choices">
                  {data.map.features
                    .filter(
                      (f) =>
                        f.properties?.kind === 'path' &&
                        String(f.properties.name || 'Campus path')
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                    )
                    .slice(0, 12)
                    .map((f) => (
                      <button
                        key={String(f.properties!.id)}
                        onClick={() => {
                          const p = featureEdit(
                            data,
                            'path',
                            String(f.properties!.id),
                            edits,
                          );
                          setPath(p || null);
                          setBoundaries([]);
                          if (p?.geometry.type === 'LineString')
                            map.easeTo({
                              center: p.geometry.coordinates[0] as Position,
                              zoom: 19,
                            });
                        }}
                      >
                        {String(f.properties!.name || 'Campus path')}
                      </button>
                    ))}
                </div>
                <p>
                  {String(path?.properties.name || 'No path selected')} ·{' '}
                  {boundaries.length}/2 boundaries
                </p>
                <button
                  onClick={() =>
                    void attempt(async () => {
                      if (path?.geometry.type !== 'LineString')
                        throw new Error('Select a path first.');
                      const points = path.geometry.coordinates as Position[];
                      const index = points
                        .map((p, i) => ({ i, d: distance(center, p) }))
                        .sort((a, b) => a.d - b.d)[0];
                      if (index.d > 8)
                        throw new Error(
                          'Move the crosshair closer to a purple boundary vertex.',
                        );
                      setBoundaries((b) => [...b.slice(-1), index.i]);
                    })
                  }
                >
                  Set boundary here
                </button>
                <button
                  className="survey-primary"
                  disabled={boundaries.length !== 2}
                  onClick={() => void attempt(async()=>{
                    if(reselecting && session && path){session.replacement=replacementTarget(path,data,...[...boundaries].sort((a,b)=>a-b) as [number,number]);delete session.appliedTarget;await persist();setScreen('survey');setMessage('Replacement target updated. Review the fixed anchors before applying.');}
                    else await start(true);
                  })}
                >
                  {reselecting?'Use reviewed replacement boundaries':'Record replacement'}
                </button>
                <button onClick={() => setScreen('home')}>Back</button>
              </>
            )}
            {screen === 'saved' && (
              <>
                <h2>Saved surveys</h2>
                <p>
                  Recordings are private. Conflicting versions remain available
                  for comparison.
                </p>
                {local.map((s) => (
                  <div className="survey-saved" key={s.id}>
                    <button
                      onClick={() =>
                        void attempt(async () => {
                          const r = await loadSurveyLocal(owner, s.id);
                          if (r) open(r);
                        })
                      }
                    >
                      {s.name} · {s.archived ? 'Archived' : s.state} · On this
                      device
                    </button>
                    <button onClick={() => void attempt(() => archive(s))}>
                      {s.archived ? 'Restore' : 'Archive'}
                    </button>
                  </div>
                ))}
                {remote.flatMap((s) =>
                  s.survey_revisions
                    .filter((r) => r.status !== 'pending')
                    .map((r) => (
                      <div className="survey-saved" key={r.id}>
                        <button
                          onClick={() =>
                            void attempt(async () => {
                              const localVersion = await loadSurveyLocal(
                                owner,
                                s.id,
                              );
                              if (localVersion) {
                                const copy = structuredClone(localVersion);
                                copy.session.id = surveyId();
                                copy.session.name +=
                                  ' (local copy before opening cloud version)';
                                copy.session.remoteRevision = null;
                                copy.session.localVersion = undefined;
                                copy.session.pendingUpload = undefined;
                                const { storeRecording } =
                                  await import('./survey-storage');
                                await storeRecording(copy);
                              }
                              open(await openRemoteSurvey(owner, r.id));
                              setMessage(
                                r.status === 'conflict'
                                  ? 'Conflicting version opened. Compare with the current version before choosing which to continue.'
                                  : 'Private version opened.',
                              );
                            })
                          }
                        >
                          {r.name} · {r.status} ·{' '}
                          {new Date(r.created_at).toLocaleString()}
                        </button>
                        {r.id !== s.head_revision && (
                          <button
                            onClick={() =>
                              void attempt(async () => {
                                const current = await loadSurveyLocal(
                                  owner,
                                  s.id,
                                );
                                if (current) {
                                  current.session.id = surveyId();
                                  current.session.localVersion = undefined;
                                  current.session.remoteRevision = null;
                                  current.session.pendingUpload = undefined;
                                  current.session.name +=
                                    ' (local recovery copy)';
                                  const { storeRecording } =
                                    await import('./survey-storage');
                                  await storeRecording(current);
                                }
                                const rcd = await openRemoteSurvey(owner, r.id);
                                rcd.session.remoteRevision = s.head_revision;
                                open(rcd);
                                setMessage(
                                  'Selected version to continue. Save survey to create a new current revision; the other version is retained.',
                                );
                              })
                            }
                          >
                            Continue this version
                          </button>
                        )}
                      </div>
                    )),
                )}
                <button onClick={() => setScreen('home')}>Back</button>
              </>
            )}
            {screen === 'survey' && session && (
              <>
                <div className="survey-stats">
                  <strong>
                    {session.state === 'recording'
                      ? 'Recording'
                      : session.state === 'review'
                        ? 'Review survey'
                        : 'Paused'}
                  </strong>
                  <span>
                    {Math.round(surveyDistance(recording!.samples))} m
                  </span>
                  <span>
                    {quality}
                    {fix ? ` · ±${Math.round(fix.accuracy)} m` : ''}
                  </span>
                </div>
                <small>
                  Accuracy is the phone’s reported estimate, not surveyed
                  precision.
                </small>
                {active && !controller.current?.awake && (
                  <p className="survey-warning">
                    Keeping the screen awake is unavailable. Keep this page
                    visible; locking or switching apps pauses recording.
                  </p>
                )}
                {session.pauseReason && <p>{session.pauseReason}</p>}
                {session.state !== 'review' && (
                  <div className="survey-actions">
                    <button
                      className="survey-primary"
                      onClick={() =>
                        void attempt(() =>
                          active
                            ? controller.current!.pause()
                            : controller.current!.resume(),
                        )
                      }
                    >
                      {active ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      disabled={!active}
                      onClick={() => void attempt(markEntrance)}
                    >
                      Mark entrance here
                    </button>
                    <button
                      onClick={() =>
                        void attempt(() => controller.current!.finish())
                      }
                      disabled={!!marker}
                    >
                      Finish
                    </button>
                    <button
                      onClick={() => {
                        setFollowing(true);
                        if (fix)
                          map.easeTo({ center: fix.coordinates, zoom: 19 });
                      }}
                    >
                      Follow me
                    </button>
                  </div>
                )}
                {marker && (
                  <fieldset>
                    <legend>Confirm entrance</legend>
                    <p>
                      Move the map under the crosshair to the ground footprint
                      edge, then choose Place here.
                    </p>
                    <button
                      onClick={() =>
                        setMarker({ ...marker, coordinates: center })
                      }
                    >
                      Place entrance here
                    </button>
                    <input
                      aria-label="Entrance name"
                      value={marker.name}
                      onChange={(e) =>
                        setMarker({ ...marker, name: e.target.value })
                      }
                    />
                    <input
                      aria-label="Find entrance place"
                      placeholder="Search nearby places"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <select
                      aria-label="Entrance place"
                      value={marker.placeId}
                      onChange={(e) =>
                        setMarker({ ...marker, placeId: e.target.value })
                      }
                    >
                      <option value="">Choose place</option>
                      {data.places
                        .filter((p) =>
                          p.name.toLowerCase().includes(query.toLowerCase()),
                        )
                        .sort(
                          (a, b) =>
                            distance(a.coordinates, marker.coordinates) -
                            distance(b.coordinates, marker.coordinates),
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                    <select
                      aria-label="Entrance walking access"
                      value={marker.access}
                      onChange={(e) =>
                        setMarker({
                          ...marker,
                          access: e.target.value as WalkingAccess,
                        })
                      }
                    >
                      {['yes', 'campus', 'private', 'no'].map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                    <button
                      disabled={!marker.placeId}
                      onClick={() => {
                        command((s) => {
                          const i = s.markers.findIndex(
                            (m) => m.id === marker.id,
                          );
                          if (i < 0) s.markers.push(marker);
                          else s.markers[i] = marker;
                        });
                        setMarker(null);
                      }}
                    >
                      Confirm entrance
                    </button>
                    <button onClick={() => setMarker(null)}>
                      Cancel entrance
                    </button>
                  </fieldset>
                )}
                {session.state === 'review' && (
                  <>
                    <input
                      aria-label="Survey name"
                      value={session.name}
                      onChange={(e) => {
                        session.name = e.target.value;
                        changed();
                      }}
                      onBlur={() => void attempt(persist)}
                    />
                    <p>
                      Grey is the recording; orange needs review; green is
                      reviewed. Gaps remain disconnected. Tap a vertex or
                      entrance to adjust it.
                    </p>
                    <div className="survey-actions">
                      <button
                        disabled={!session.past.length}
                        onClick={() => {
                          reviewUndo(session);
                          void attempt(persist);
                        }}
                      >
                        Undo survey edit
                      </button>
                      <button
                        disabled={!session.future.length}
                        onClick={() => {
                          reviewUndo(session, true);
                          void attempt(persist);
                        }}
                      >
                        Redo survey edit
                      </button>
                      <button
                        onClick={() =>
                          void attempt(() => controller.current!.resume())
                        }
                      >
                        Rewalk missing section
                      </button>
                      {session.replacement&&<button onClick={()=>{setReselecting(true);setPath(featureEdit(data,'path',session.replacement!.edit.id,edits)||null);setBoundaries([]);setScreen('replace');}}>Review replacement target</button>}
                      <button
                        onClick={() => {
                          command((s) =>
                            s.review.push({
                              id: surveyId(),
                              reviewed: false,
                              vertices: [
                                { id: surveyId(), coordinates: center },
                              ],
                            }),
                          );
                          setSelection({
                            line: session.review.at(-1)!.id,
                            vertex: 0,
                          });
                        }}
                      >
                        Draw connecting section
                      </button>
                    </div>
                    <div className="survey-choices">
                      {session.review.map((l, i) => (
                        <button
                          key={l.id}
                          onClick={() => {
                            setSelection({ line: l.id, vertex: 0 });
                            map.easeTo({
                              center: l.vertices[0].coordinates,
                              zoom: 19,
                            });
                          }}
                        >
                          Section {i + 1} ·{' '}
                          {l.reviewed ? 'Reviewed' : 'Needs review'}
                        </button>
                      ))}
                    </div>
                    {(selectedLine || selectedMarker) && (
                      <fieldset>
                        <legend>
                          {selectedMarker
                            ? selectedMarker.name
                            : `Section vertex ${vertexIndex + 1}`}
                        </legend>
                        <label>
                          <input
                            type="checkbox"
                            checked={connect}
                            onChange={(e) => setConnect(e.target.checked)}
                          />{' '}
                          Connect to highlighted target
                        </label>
                        {connect && (
                          <p>
                            {snap?.label ||
                              (reviewSnap
                                ? 'Connect to survey vertex'
                                : 'Move crosshair onto a path or vertex')}
                          </p>
                        )}
                        <button
                          className="survey-primary"
                          onClick={() => void attempt(async () => placeHere())}
                        >
                          Place here
                        </button>
                        {selectedLine && (
                          <>
                            <div className="survey-actions">
                              <button
                                onClick={() =>
                                  setSelection({
                                    line: selectedLine.id,
                                    vertex: Math.max(0, vertexIndex - 1),
                                  })
                                }
                              >
                                Previous vertex
                              </button>
                              <button
                                onClick={() =>
                                  setSelection({
                                    line: selectedLine.id,
                                    vertex: Math.min(
                                      selectedLine.vertices.length - 1,
                                      vertexIndex + 1,
                                    ),
                                  })
                                }
                              >
                                Next vertex
                              </button>
                              <button
                                onClick={() => {
                                  editLine((l) =>
                                    l.vertices.splice(vertexIndex + 1, 0, {
                                      id: surveyId(),
                                      coordinates: center,
                                    }),
                                  );setSelection({line:selectedLine.id,vertex:vertexIndex+1});
                                }}
                              >
                                Insert vertex after
                              </button>
                              <button
                                onClick={() => {
                                  editLine((l) => {
                                    if (l.vertices[vertexIndex].pinned)
                                      throw new Error(
                                        'Keep this entrance or fixed junction anchor.',
                                      );
                                    if (l.vertices.length <= 2)
                                      throw new Error(
                                        'Remove the section instead.',
                                      );
                                    l.vertices.splice(vertexIndex, 1);
                                  });
                                  setSelection({
                                    line: selectedLine.id,
                                    vertex: Math.max(0, vertexIndex - 1),
                                  });
                                }}
                              >
                                Delete vertex
                              </button>
                              <button
                                onClick={() => {
                                  editLine((l) => {
                                    if (
                                      l.vertices
                                        .slice(0, vertexIndex)
                                        .some((v) => v.pinned)
                                    )
                                      throw new Error(
                                        'Trim would remove a fixed anchor.',
                                      );
                                    l.vertices = l.vertices.slice(vertexIndex);
                                  });
                                  setSelection({
                                    line: selectedLine.id,
                                    vertex: 0,
                                  });
                                }}
                              >
                                Trim before
                              </button>
                              <button
                                onClick={() =>
                                  editLine((l) => {
                                    if (
                                      l.vertices
                                        .slice(vertexIndex + 1)
                                        .some((v) => v.pinned)
                                    )
                                      throw new Error(
                                        'Trim would remove a fixed anchor.',
                                      );
                                    l.vertices = l.vertices.slice(
                                      0,
                                      vertexIndex + 1,
                                    );
                                  })
                                }
                              >
                                Trim after
                              </button>
                              <button
                                disabled={
                                  vertexIndex === 0 ||
                                  vertexIndex ===
                                    selectedLine.vertices.length - 1
                                }
                                onClick={() =>
                                  command((s) => {
                                    const l = s.review.find(
                                      (l) => l.id === selectedLine.id,
                                    )!;
                                    s.review.push({
                                      id: surveyId(),
                                      vertices: structuredClone(
                                        l.vertices.slice(vertexIndex),
                                      ),
                                      reviewed: false,
                                    });
                                    l.vertices = l.vertices.slice(
                                      0,
                                      vertexIndex + 1,
                                    );
                                    l.reviewed = false;
                                  })
                                }
                              >
                                Split here
                              </button>
                              <button
                                onClick={() => {
                                  if (cutStart === null) {
                                    setCutStart(vertexIndex);
                                    return;
                                  }
                                  command((s) => {
                                    const l = s.review.find(
                                      (l) => l.id === selectedLine.id,
                                    )!;
                                    const [a, b] = [cutStart, vertexIndex].sort(
                                      (a, b) => a - b,
                                    );
                                    if (a === b)
                                      throw new Error(
                                        'Choose the other end of the section to remove.',
                                      );
                                    if (
                                      l.vertices
                                        .slice(a + 1, b)
                                        .some((v) => v.pinned)
                                    )
                                      throw new Error(
                                        'Removal would lose a fixed anchor.',
                                      );
                                    const tail = l.vertices.slice(b);
                                    l.vertices = l.vertices.slice(0, a + 1);
                                    l.reviewed = false;
                                    if (tail.length >= 2)
                                      s.review.push({
                                        id: surveyId(),
                                        vertices: tail,
                                        reviewed: false,
                                      });
                                  });
                                  setCutStart(null);
                                }}
                              >
                                {cutStart === null
                                  ? 'Start section removal'
                                  : 'Remove to this vertex'}
                              </button>
                            </div>
                            {session.replacement?.anchors.map((anchor, i) => (
                              <button
                                key={anchor.id}
                                onClick={() =>
                                  void attempt(async () => {
                                    if (
                                      distance(center, anchor.coordinates) > 5
                                    )
                                      throw new Error(
                                        'Move the crosshair to this fixed anchor first.',
                                      );
                                    editLine((l) => {
                                      l.vertices[vertexIndex] = {
                                        ...l.vertices[vertexIndex],
                                        ...anchor,
                                      };
                                    });
                                  })
                                }
                              >
                                Use fixed anchor {i + 1}
                              </button>
                            ))}
                            <button
                              onClick={() =>
                                command((s) => {
                                  const l = s.review.find(
                                    (l) => l.id === selectedLine.id,
                                  )!;
                                  if (l.vertices.length < 2)
                                    throw new Error(
                                      'A path needs at least two vertices.',
                                    );
                                  l.reviewed = true;
                                })
                              }
                            >
                              Confirm section reviewed
                            </button>
                            <button
                              onClick={() => {
                                command((s) => {
                                  s.review = s.review.filter(
                                    (l) => l.id !== selectedLine.id,
                                  );
                                });
                                setSelection(null);
                              }}
                            >
                              Remove whole section
                            </button>
                          </>
                        )}
                        {selectedMarker && (
                          <>
                            <button
                              onClick={() => {
                                setMarker(structuredClone(selectedMarker));
                                map.easeTo({
                                  center: selectedMarker.coordinates,
                                  zoom: 20,
                                  pitch: 0,
                                });
                              }}
                            >
                              Edit entrance details
                            </button>
                            <button
                              onClick={() => {
                                command((s) => {
                                  s.markers = s.markers.filter(
                                    (m) => m.id !== selectedMarker.id,
                                  );
                                  for(const l of s.review)for(const v of l.vertices)if(v.sampleId===selectedMarker.sampleId&&!s.markers.some(m=>m.sampleId===v.sampleId))v.pinned=!!session.replacement?.anchors.some(a=>a.id===v.id);
                                });
                                setSelection(null);
                              }}
                            >
                              Delete entrance
                            </button>
                          </>
                        )}
                      </fieldset>
                    )}
                  </>
                )}
                {!active && (
                  <div className="survey-actions">
                    <button
                      disabled={busy}
                      onClick={() =>
                        void attempt(async () => {
                          await persist();
                          await syncSurvey(recording!, setMessage);
                          changed();
                        })
                      }
                    >
                      Save survey
                    </button>
                    <button
                      className="survey-primary"
                      disabled={busy || session.state !== 'review' || !!marker}
                      onClick={() =>
                        void attempt(async () => {
                          const current = session.replacement
                            ? featureEdit(
                                data,
                                'path',
                                session.replacement.edit.id,
                                edits,
                              )
                            : undefined;
                          const corrections = surveyCorrections(
                            session,
                            current,
                          );
                          const applied = await apply(
                            corrections,
                            session.generatedCorrectionIds,
                          );
                          const target=applied.find(e=>e.kind==='path'&&e.id===session.replacement?.edit.id);
                          if(target)session.appliedTarget={fingerprint:geometryFingerprint(target),revision:target.updated_at};
                          session.generatedCorrectionIds = corrections.map(
                            (e) => e.id,
                          );
                          await persist();
                          setMessage(
                            'Applied to private map draft. Close survey to test routes. Campus data has not been published.',
                          );
                        })
                      }
                    >
                      Apply to map draft
                    </button>
                    <button
                      onClick={() =>
                        void attempt(async () => {
                          await persist();
                          await saved();
                        })
                      }
                    >
                      Saved surveys
                    </button>
                  </div>
                )}
                <output>
                  {busy
                    ? 'Saving…'
                    : controller.current?.error
                      ? 'Recovery storage failed'
                      : message || 'Saved locally'}
                </output>
              </>
            )}
            {screen !== 'survey' && message && <output>{message}</output>}
            {(error || controller.current?.error) && (
              <p className="form-error" role="alert">
                {error || controller.current?.error}
              </p>
            )}
            {recording && controller.current?.error && (
              <button
                onClick={() =>
                  void attempt(async () => {
                    const copy = structuredClone(recording);
                    copy.session.id = surveyId();
                    copy.session.name += ' (recovery copy)';
                    copy.session.state = 'paused';
                    copy.session.localVersion = undefined;
                    copy.session.remoteRevision = null;
                    copy.session.pendingUpload = undefined;
                    copy.session.generatedCorrectionIds = [];
                    const { storeRecording } = await import('./survey-storage');
                    await storeRecording(copy);
                    open(copy);
                    setMessage(
                      'A separate recovery copy is saved on this device.',
                    );
                  })
                }
              >
                Save separate recovery copy
              </button>
            )}
          </fieldset>
        )}
      </section>
    </div>
  );
}
