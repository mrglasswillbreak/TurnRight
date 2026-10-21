import { surveyRecoveryCopy } from './survey-model';
import { MotionMap } from './MotionAssistance';
import { storeRecording } from './survey-storage';
import { useSurveySession, type SurveyPanelProps } from './useSurveySession';
import { SurveyStart } from './SurveyStart';
import { SurveySaved } from './SurveySaved';
import { SurveyRecordingView } from './SurveyRecording';
import './survey.css';

export function SurveyPanel(props: SurveyPanelProps) {
  const state = useSurveySession(props);
  const {
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
  } = state;
  return (
    <div className="survey-workspace">
      <MotionMap
        map={map}
        fix={fix && ['accepted', 'duplicate'].includes(fix.status) ? fix : null}
        active={active}
        survey
      />
      <div className="survey-crosshair" aria-hidden="true">
        +
      </div>
      <div className="survey-top">
        <strong>Survey</strong>
        <span>Awaiting field verification</span>
        <button
          disabled={busy}
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
            <SurveyStart state={state} />

            <SurveySaved state={state} />
            <SurveyRecordingView state={state} />
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
                    const copy = surveyRecoveryCopy(recording);
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
