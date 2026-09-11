const surveys = new Map<
  object,
  { recording: () => boolean; flush: () => Promise<void> }
>();
export function registerSurveyRecovery(
  key: object,
  recording: () => boolean,
  flush: () => Promise<void>,
) {
  surveys.set(key, { recording, flush });
  return () => surveys.delete(key);
}
export const surveyRecordingActive = () =>
  [...surveys.values()].some((s) => s.recording());
export async function flushSurveyRecovery() {
  if (surveyRecordingActive())
    throw new Error('Pause recording before installing an app update.');
  await Promise.all([...surveys.values()].map((s) => s.flush()));
}
