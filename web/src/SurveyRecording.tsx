import { featureEdit } from './editor-features';
import {
  surveyCorrections,
  geometryFingerprint,
  surveyDistance,
} from './survey-model';
import { MotionStatus } from './MotionAssistance';
import { syncSurvey } from './survey-sync';
import type { SurveySessionState } from './useSurveySession';
import { SurveyMarkerForm } from './SurveyMarker';
import { SurveyReview } from './SurveyReview';

export function SurveyRecordingView({ state }: { state: SurveySessionState }) {
  const {
    screen,
    session,
    recording,
    quality,
    fix,
    active,
    controller,
    attempt,
    resume,
    markEntrance,
    marker,
    setFollowing,
    map,
    busy,
    persist,
    setMessage,
    changed,
    data,
    edits,
    apply,
    saved,
    message,
  } = state;
  if (!session) return null;
  return (
    <>
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
            <span>{Math.round(surveyDistance(recording!.samples))} m</span>
            <span>
              {quality}
              {fix ? ` · ±${Math.round(fix.accuracy)} m` : ''}
            </span>
          </div>
          <MotionStatus compact />
          <small>
            Accuracy is the phone’s reported estimate, not surveyed precision.
          </small>
          {active && !controller.current?.awake && (
            <p className="survey-warning">
              Keeping the screen awake is unavailable. Keep this page visible;
              locking or switching apps pauses recording.
            </p>
          )}
          {session.pauseReason && <p>{session.pauseReason}</p>}
          {session.state !== 'review' && (
            <div className="survey-actions">
              <button
                className="survey-primary"
                onClick={() =>
                  void attempt(() =>
                    active ? controller.current!.pause() : resume(),
                  )
                }
              >
                {active ? 'Pause' : 'Resume'}
              </button>
              <button
                disabled={!active}
                onClick={() => void attempt(markEntrance)}
              >
                Mark place or entrance
              </button>
              <button
                onClick={() => void attempt(() => controller.current!.finish())}
                disabled={!!marker}
              >
                Finish
              </button>
              <button
                onClick={() => {
                  setFollowing(true);
                  if (fix) map.easeTo({ center: fix.coordinates, zoom: 19 });
                }}
              >
                Follow me
              </button>
            </div>
          )}
          <SurveyMarkerForm state={state} />
          <SurveyReview state={state} />
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
                      edits,
                    );
                    const applied = await apply(
                      corrections,
                      session.generatedCorrectionIds,
                    );
                    const target = applied.find(
                      (e) =>
                        e.kind === 'path' &&
                        e.id === session.replacement?.edit.id,
                    );
                    if (target)
                      session.appliedTarget = {
                        fingerprint: geometryFingerprint(target),
                        revision: target.updated_at,
                      };
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
            {busy || !!controller.current?.pendingWrites
              ? 'Saving…'
              : controller.current?.error
                ? 'Recovery storage failed'
                : message || 'Saved locally'}
          </output>
        </>
      )}
    </>
  );
}
