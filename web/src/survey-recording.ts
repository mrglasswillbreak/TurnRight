import {
  insideCampusMappingArea,
  lasuCampus,
  type MappingArea,
} from './campus-context';
import { distance } from './geo';
import type { GpsFix, Position } from './types';
import {
  SURVEY_LIMITS,
  type SampleStatus,
  type SurveySample,
  type SurveySession,
  type SurveyRecording,
  surveyId,
} from './survey-types.js';
export function newSurvey(
  owner: string,
  sourceRevision: string,
): SurveyRecording {
  const now = new Date().toISOString();
  return {
    session: {
      id: surveyId(),
      owner,
      sourceRevision,
      name: 'Walking survey',
      createdAt: now,
      updatedAt: now,
      state: 'paused',
      segments: [],
      markers: [],
      review: [],
      past: [],
      future: [],
      generatedCorrectionIds: [],
      remoteRevision: null,
    },
    samples: [],
  };
}

export function insideMappingArea(p: Position, area?: MappingArea) {
  return insideCampusMappingArea(p, area || lasuCampus);
}

export function classifyFix(
  fix: GpsFix,
  previous: SurveySample | undefined,
  lastTimestamp: number,
  now: number,
  area?: MappingArea,
): SampleStatus {
  if (!insideMappingArea(fix.coordinates, area)) return 'outside';
  if (
    !Number.isFinite(fix.timestamp) ||
    fix.timestamp > now + 1000 ||
    now - fix.timestamp > SURVEY_LIMITS.age
  )
    return 'stale';
  if (fix.timestamp <= lastTimestamp) return 'out-of-order';
  if (
    !Number.isFinite(fix.accuracy) ||
    fix.accuracy <= 0 ||
    fix.accuracy > SURVEY_LIMITS.accuracy
  )
    return 'inaccurate';
  if (previous) {
    const d = distance(previous.coordinates, fix.coordinates),
      seconds = (fix.timestamp - previous.timestamp) / 1000;
    if (d / seconds > SURVEY_LIMITS.speed) return 'jump';
    if (d < SURVEY_LIMITS.jitter) return 'duplicate';
  }
  return 'accepted';
}

export function acceptSample(
  recording: SurveyRecording,
  fix: GpsFix,
  now = Date.now(),
  area?: MappingArea,
): SurveySample {
  const { session, samples } = recording;
  const last = samples.at(-1);
  const prior = samples.findLast(
    (s) => s.status === 'accepted' && s.segmentId === session.activeSegment,
  );
  if (last && fix.timestamp - last.timestamp > SURVEY_LIMITS.gap) {
    session.activeSegment = undefined;
    session.pauseReason = 'GPS gap';
  }
  const latestTimestamp = samples.reduce(
    (max, s) =>
      Math.max(
        max,
        Number.isFinite(s.timestamp) &&
          s.timestamp <= now &&
          s.status !== 'stale'
          ? s.timestamp
          : 0,
      ),
    0,
  );
  const status = classifyFix(
    fix,
    session.activeSegment ? prior : undefined,
    latestTimestamp,
    now,
    area,
  );
  if (!['accepted', 'duplicate'].includes(status)) {
    session.activeSegment = undefined;
    session.pauseReason = `Signal interruption: ${status}`;
  }
  if (status === 'accepted' && !session.activeSegment) {
    session.activeSegment = surveyId();
    session.segments.push({
      id: session.activeSegment,
      reason: session.pauseReason || 'Start',
    });
    session.pauseReason = undefined;
  }
  const sample: SurveySample = {
    ...fix,
    id: surveyId(),
    status,
    segmentId: ['accepted', 'duplicate'].includes(status)
      ? session.activeSegment
      : undefined,
  };
  samples.push(sample);
  return sample;
}

export function pauseSurvey(session: SurveySession, reason: string) {
  session.state = 'paused';
  session.activeSegment = undefined;
  session.pauseReason = reason;
}
