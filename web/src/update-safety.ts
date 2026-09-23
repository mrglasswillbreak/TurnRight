const surveys = new Map<
  object,
  { recording: () => boolean; flush: () => Promise<void> }
>();
const photos = new Map<object, () => Promise<void>>();
export function registerPhotoRecovery(key: object, flush: () => Promise<void>) {
  photos.set(key, flush);
  return () => {
    photos.delete(key);
  };
}
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
  await Promise.all([...photos.values()].map((flush) => flush()));
}
