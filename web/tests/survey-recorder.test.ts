import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { SurveyRecorder } from '../src/survey-recorder';
import {
  newSurvey,
  type SurveySample,
  type SurveySession,
} from '../src/survey-model';
import {
  flushSurveyRecovery,
  surveyRecordingActive,
} from '../src/update-safety';
let callback: PositionCallback, failure: PositionErrorCallback;
const clear = vi.fn();
let doc: EventTarget & { hidden: boolean };
const controllers: SurveyRecorder[] = [];
beforeEach(() => {
  doc = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', {
    geolocation: {
      watchPosition: vi.fn(
        (cb: PositionCallback, err: PositionErrorCallback) => {
          callback = cb;
          failure = err;
          return 1;
        },
      ),
      clearWatch: clear,
    },
  });
});
afterEach(async () => {
  controllers.splice(0).forEach((c) => c.dispose());
  await Promise.resolve();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const create = (
  persist = vi.fn(
    async (_session: SurveySession, _sample?: SurveySample) => {},
  ),
) => {
  const c = new SurveyRecorder(newSurvey('owner', 'source'), vi.fn(), persist);
  controllers.push(c);
  return c;
};
const feed = () =>
  callback({
    coords: {
      longitude: 3.2,
      latitude: 6.46,
      accuracy: 5,
      speed: null,
      heading: null,
      altitude: null,
      altitudeAccuracy: null,
    },
    timestamp: Date.now(),
  } as GeolocationPosition);
it('requests GPS only on Resume, stops on background, and never automatically resumes', async () => {
  const c = create();
  expect(navigator.geolocation.watchPosition).not.toHaveBeenCalled();
  await c.resume();
  feed();
  await c.flush();
  doc.hidden = true;
  doc.dispatchEvent(new Event('visibilitychange'));
  await c.flush();
  expect(c.recording.session.state).toBe('paused');
  expect(clear).toHaveBeenCalled();
  doc.hidden = false;
  doc.dispatchEvent(new Event('visibilitychange'));
  expect(navigator.geolocation.watchPosition).toHaveBeenCalledTimes(1);
});
it('stops on denied permission and preserves the local recording', async () => {
  const c = create();
  await c.resume();
  feed();
  await c.flush();
  failure({ code: 1, message: 'denied' } as GeolocationPositionError);
  await c.flush();
  expect(c.recording.session.state).toBe('paused');
  expect(c.recording.samples).toHaveLength(1);
});
it('pauses on recovery storage failure', async () => {
  const persist = vi.fn(async (_s: SurveySession, sample?: SurveySample) => {
    if (sample) throw new Error('Quota exceeded');
  });
  const c = create(persist);
  await c.resume();
  feed();
  await expect(c.flush()).rejects.toThrow('Quota');
  expect(c.recording.session.state).toBe('paused');
  expect(c.error).toContain('Quota');
  expect(clear).toHaveBeenCalled();
});
it('blocks updates during recording and flushes when paused', async () => {
  const c = create();
  await c.resume();
  expect(surveyRecordingActive()).toBe(true);
  await expect(flushSurveyRecovery()).rejects.toThrow(/Pause/);
  await c.pause();
  await flushSurveyRecovery();
  expect(surveyRecordingActive()).toBe(false);
});
it('stops GPS when the owner workspace unmounts', async () => {
  const c = create();
  await c.resume();
  c.dispose();
  await c.flush();
  expect(c.recording.session.state).toBe('paused');
  expect(clear).toHaveBeenCalled();
});
