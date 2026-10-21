import type { ConnectionTarget } from './types';
import {
  type SurveySession,
  type SurveyReview,
  type SurveyRecording,
  surveyId,
} from './survey-types.js';
import { pauseSurvey } from './survey-recording.js';
export function surveyRecoveryCopy(
  recording: SurveyRecording,
  suffix = ' (recovery copy)',
): SurveyRecording {
  const copy = structuredClone(recording),
    s = copy.session;
  const oldId = s.id;
  s.id = surveyId();
  s.name += suffix;
  s.remoteRevision = null;
  s.localVersion = undefined;
  s.pendingUpload = undefined;
  s.generatedCorrectionIds = [];
  s.appliedTarget = undefined;
  if (s.state === 'recording')
    pauseSurvey(s, 'Recovered copy. Tap Resume to continue.');
  const snapshots = [s, ...s.past, ...s.future],
    fixed = new Set(s.replacement?.anchors.map((a) => a.id) || []),
    ids = new Map<string, string>();
  for (const state of snapshots)
    for (const l of state.review)
      for (const v of l.vertices)
        if (!fixed.has(v.id) && !ids.has(v.id))
          ids.set(v.id, `survey:${s.id}:${surveyId()}`);
  const connection = (target?: ConnectionTarget) => {
    if (!target) return;
    if (target.type === 'node')
      target.nodeId = ids.get(target.nodeId) || target.nodeId;
    else {
      target.from = ids.get(target.from) || target.from;
      target.to = ids.get(target.to) || target.to;
      target.sourceId = target.sourceId.replace(
        `survey:${oldId}:`,
        `survey:${s.id}:`,
      );
    }
  };

  for (const state of snapshots) {
    for (const l of state.review)
      for (const v of l.vertices) {
        v.id = ids.get(v.id) || v.id;
        connection(v.connection);
      }
    for (const m of state.markers) connection(m.connection);
  }
  connection(s.pendingMarker?.connection);
  return copy;
}

export function reviewCommand(
  session: SurveySession,
  edit: (state: SurveyReview) => void,
) {
  const next = structuredClone({
    review: session.review,
    markers: session.markers,
  });
  edit(next);
  session.past.push(
    structuredClone({ review: session.review, markers: session.markers }),
  );
  session.past = session.past.slice(-100);
  session.future = [];
  session.review = next.review;
  session.markers = next.markers;
  session.updatedAt = new Date().toISOString();
}

export function reviewUndo(session: SurveySession, redo = false) {
  const from = redo ? session.future : session.past,
    to = redo ? session.past : session.future,
    snapshot = from.pop();
  if (!snapshot) return;
  to.push(
    structuredClone({ review: session.review, markers: session.markers }),
  );
  session.review = snapshot.review;
  session.markers = snapshot.markers;
}
export {
  SURVEY_LIMITS,
  type SampleStatus,
  type SurveySample,
  type SurveyVertex,
  type SurveyLine,
  type SurveyMarker,
  type ReplacementTarget,
  type SurveySession,
  type SurveyReview,
  type SurveyUpload,
  type SurveyRecording,
  surveyId,
} from './survey-types.js';
export {
  disconnectedSurveyPaths,
  proposeGeometry,
  surveyDistance,
  geometryFingerprint,
  replacementTarget,
} from './survey-geometry.js';
export {
  newSurvey,
  insideMappingArea,
  classifyFix,
  acceptSample,
  pauseSurvey,
} from './survey-recording.js';
export { surveyCorrections } from './survey-corrections.js';
