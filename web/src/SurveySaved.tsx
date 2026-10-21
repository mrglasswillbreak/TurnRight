import { surveyRecoveryCopy } from './survey-model';
import {
  loadSurveyLocal,
  saveSurveyLocal,
  storeRecording,
} from './survey-storage';
import { openRemoteSurvey } from './survey-sync';
import { api } from './supabase';
import type { SurveySessionState } from './useSurveySession';

export function SurveySaved({ state }: { state: SurveySessionState }) {
  const {
    screen,
    local,
    attempt,
    owner,
    open,
    archive,
    remote,
    setMessage,
    saved,
    setScreen,
  } = state;
  return (
    <>
      {screen === 'saved' && (
        <>
          <h2>Saved surveys</h2>
          <p>
            Recordings are private. Conflicting versions remain available for
            comparison.
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
                {s.name} · {s.archived ? 'Archived' : s.state} · On this device
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
                        const localVersion = await loadSurveyLocal(owner, s.id);
                        if (localVersion) {
                          const copy = surveyRecoveryCopy(
                            localVersion,
                            ' (local copy before opening cloud version)',
                          );
                          await storeRecording(copy);
                        }
                        open(await openRemoteSurvey(owner, r.id, s.archived));
                        setMessage(
                          r.status === 'conflict'
                            ? 'Conflicting version opened. Compare with the current version before choosing which to continue.'
                            : 'Private version opened.',
                        );
                      })
                    }
                  >
                    {r.name} · {s.archived ? 'Archived' : r.status} ·{' '}
                    {new Date(r.created_at).toLocaleString()}
                  </button>
                  {r.id === s.head_revision && (
                    <button
                      onClick={() =>
                        void attempt(async () => {
                          const archived = !s.archived;
                          await api('survey-save', {
                            command: 'archive',
                            surveyId: s.id,
                            expectedRevision: s.head_revision,
                            archived,
                          });
                          const cached = await loadSurveyLocal(owner, s.id);
                          if (cached) {
                            cached.session.archived = archived;
                            await saveSurveyLocal(cached.session);
                          }
                          await saved();
                        })
                      }
                    >
                      {s.archived
                        ? 'Restore private survey'
                        : 'Archive private survey'}
                    </button>
                  )}
                  {r.id !== s.head_revision && (
                    <button
                      onClick={() =>
                        void attempt(async () => {
                          const current = await loadSurveyLocal(owner, s.id);
                          if (current) {
                            await storeRecording(surveyRecoveryCopy(current));
                          }
                          const rcd = await openRemoteSurvey(
                            owner,
                            r.id,
                            s.archived,
                          );
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
    </>
  );
}
