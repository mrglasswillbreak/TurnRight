import { LockKeyhole } from 'lucide-react';
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AdminRequestError, boundedSession } from './admin-client';
import type { Appearance } from './appearance';
import { BrandMark } from './BrandMark';
import { campusUrl } from './campus-context';
import {
  editorHandoffStorage,
  editorSignInReturn,
  restoreEditorCampusReturn,
} from './editor-link';
import {
  loadPreparedWorkspace,
  offlineOwner,
  rememberOfflineOwner,
} from './editor-loading';
import { applyEdits, type SourceRecord } from './editor-model';
import { assembleEditorSources } from './editor-validation';
import {
  EditorWorkspace,
  editKey,
  type WorkspaceRecovery,
} from './editor-workspace';
import {
  EditorState,
  GisTeamWorkspace,
  LocalSignIn,
  OfflineEditor,
} from './editor-workspace-shared';
import './editor.css';
import { Editor } from './EditorWorkspaceView';
import './layer-workspace.css';
import {
  getActivePackage,
  getPreference,
  installPackage,
  latestPackage,
  setPreference,
} from './offline';
import { PhotoSession } from './PhotoSession';
import { api, supabase } from './supabase';
import { readSurveyContext, writeSurveyContext } from './survey-storage';
import type { CampusData, MapEdit } from './types';
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
  useLayoutEffect(() => {
    const restored = restoreEditorCampusReturn(
      location.href,
      editorHandoffStorage(),
    );
    if (restored) history.replaceState(null, '', restored);
  }, []);
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
      const recovery = await getPreference<WorkspaceRecovery | null>(key, null);
      const gisKeys = (recovery?.edits || [])
        .filter((e) => e.properties.gisManaged)
        .map(editKey)
        .slice(0, 500);
      const loaded = await loadPreparedWorkspace<OfflineEditor>(
        async () => {
          const [state, source] = await Promise.all([
            api<EditorState>('state', { gisKeys, sourceReviewVersion: 2 }),
            api<{ features: SourceRecord[] }>('sources', { gisKeys }),
          ]);
          if (state.base) initialCampus.current = state.base;
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
        initialCampus.current = loaded.context.data;
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
            result.campus || initialCampus.current,
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
  useEffect(() => {
    if (state?.campus?.name)
      document.title = `TurnRight · ${state.campus.name} editor`;
  }, [state?.campus?.name]);

  const refresh = async () => {
    const gisKeys = (workspace?.edits || [])
      .filter((e) => e.properties.gisManaged)
      .map(editKey)
      .slice(0, 500);
    const [result, source] = await Promise.all([
      api<EditorState>('state', { gisKeys, sourceReviewVersion: 2 }),
      api<{ features: SourceRecord[] }>('sources', { gisKeys }),
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
        <a
          className="brandmark"
          href={campusUrl('/')}
          aria-label="TurnRight public map"
        >
          <BrandMark />
        </a>
        <LockKeyhole size={28} />
        <h1>Campus map editor</h1>
        <p>
          {!supabase
            ? 'Connect your Supabase project to enable the protected editor. The public campus map works without it.'
            : owner
              ? 'Opening your private workspace…'
              : 'Sign in with a GitHub account that belongs to your campus team.'}
        </p>
        {supabase && !owner && LocalSignIn && (
          <Suspense fallback={<p>Opening local sign-in…</p>}>
            <LocalSignIn />
          </Suspense>
        )}
        {supabase && !owner && !LocalSignIn && (
          <button
            className="editor-primary"
            onClick={() =>
              supabase!.auth.signInWithOAuth({
                provider: 'github',
                options: {
                  redirectTo: editorSignInReturn(
                    location.href,
                    editorHandoffStorage(),
                  ),
                },
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
                    options: {
                      redirectTo: editorSignInReturn(
                        location.href,
                        editorHandoffStorage(),
                      ),
                    },
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
        <a href={campusUrl('/')}>Back to campus map</a>
      </main>
    );
  if (state.capabilities && !state.capabilities.capabilities.includes('edit')) {
    const view = applyEdits(
      assembleEditorSources(sources, state.base || data).data,
      state.edits,
    );
    return (
      <Suspense fallback={<p>Opening team workspace…</p>}>
        <GisTeamWorkspace
          data={view.data}
          issues={view.issues}
          capabilities={state.capabilities}
          appearance={appearance}
          onAppearance={onAppearance}
          dark={dark}
        />
      </Suspense>
    );
  }
  return (
    <PhotoSession key={owner} owner={owner!}>
      <Editor
        data={state.base || data}
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
          const gisKeys = workspace.edits
            .filter((e) => e.properties.gisManaged)
            .map(editKey)
            .slice(0, 500);
          const [verified, source] = await Promise.all([
            api<EditorState>('state', { gisKeys, sourceReviewVersion: 2 }),
            api<{ features: SourceRecord[] }>('sources', { gisKeys }),
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
