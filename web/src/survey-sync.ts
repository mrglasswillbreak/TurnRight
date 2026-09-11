import { api } from './supabase';
import {
  surveyId,
  type SurveyRecording,
  type SurveySession,
  type SurveySample,
} from './survey-model';
import { saveSurveyLocal, storeRecording } from './survey-storage';
export interface RemoteSurvey {
  id: string;
  archived: boolean;
  head_revision: string | null;
  survey_revisions: {
    id: string;
    metadata: SurveySession;
    status: string;
    created_at: string;
  }[];
}
export const listRemoteSurveys = () => api<RemoteSurvey[]>('survey-list');
export async function openRemoteSurvey(owner: string, revisionId: string) {
  const result = await api<{
    revision: { owner: string; metadata: SurveySession };
    chunks: { samples: SurveySample[] }[];
    nextOffset: number | null;
  }>('survey-get', { revisionId });
  if (result.revision.owner !== owner)
    throw new Error('Sign in with the survey owner.');
  while(result.nextOffset!==null){
    const next=await api<{chunks:{samples:SurveySample[]}[];nextOffset:number|null}>('survey-get',{revisionId,offset:result.nextOffset});
    if(!next.chunks.length)throw new Error('Private upload is incomplete. Reopen after saving finishes.');
    result.chunks.push(...next.chunks);result.nextOffset=next.nextOffset;
  }
  const recording: SurveyRecording = {
    session: {
      ...result.revision.metadata,
      owner,
      remoteRevision: revisionId,
      state: result.revision.metadata.state === 'review' ? 'review' : 'paused',
      activeSegment: undefined,
      pendingUpload: undefined,
    },
    samples: result.chunks.flatMap((c) => c.samples),
  };
  await storeRecording(recording);
  return recording;
}
const flights=new WeakMap<SurveyRecording,Promise<unknown>>();
export function syncSurvey(recording:SurveyRecording,progress:(s:string)=>void):Promise<unknown>{
  const running=flights.get(recording);if(running)return running;
  const flight=performSync(recording,progress).finally(()=>flights.delete(recording));flights.set(recording,flight);return flight;
}
const evidenceSignature=(session:SurveySession)=>JSON.stringify({...session,remoteRevision:null,localVersion:undefined,pendingUpload:undefined,past:[],future:[]});
async function performSync(
  recording: SurveyRecording,
  progress: (s: string) => void,
) {
  const session = recording.session;
  if (session.state === 'recording')
    throw new Error('Pause recording before saving privately.');
  if (!session.pendingUpload) {
    const metadata = structuredClone(session);
    delete metadata.pendingUpload;
    metadata.past = [];
    metadata.future = [];
    delete metadata.localVersion;
    session.pendingUpload = {
      revisionId: surveyId(),
      expectedRevision: session.remoteRevision,
      metadata,
      chunks: [],
    };
    for (let i = 0; i < recording.samples.length; i += 250)
      session.pendingUpload.chunks.push(recording.samples.slice(i, i + 250));
    await saveSurveyLocal(session);
  }
  const upload = session.pendingUpload;
  if (!navigator.onLine) {
    progress('Saved locally · private upload queued for reconnection');
    return;
  }
  progress('Verifying owner and preparing private upload…');
  await api('survey-save', {
    command: 'begin',
    surveyId: session.id,
    revisionId: upload.revisionId,
    expectedRevision: upload.expectedRevision,
    metadata: upload.metadata,
    chunkCount: upload.chunks.length,
  });
  for (let i = 0; i < upload.chunks.length; i++) {
    progress(`Saving private recording ${i + 1}/${upload.chunks.length}…`);
    await api('survey-save', {
      command: 'chunk',
      revisionId: upload.revisionId,
      index: i,
      samples: upload.chunks[i],
    });
  }
  const result = await api<{
    revisionId: string;
    status: string;
    headRevision: string;
  }>('survey-save', { command: 'finalize', revisionId: upload.revisionId });
  session.remoteRevision = result.revisionId;
  delete session.pendingUpload;
  await saveSurveyLocal(session);
  if (result.status === 'conflict')
    throw new Error(
      'Both versions are saved privately. Open Saved surveys to compare, then choose which version to continue.',
    );
  if(evidenceSignature(session)!==evidenceSignature(upload.metadata)||recording.samples.length!==upload.chunks.reduce((n,c)=>n+c.length,0)){
    if(session.state==='recording'){progress('Earlier revision saved privately; current recording remains local.');return result;}
    return performSync(recording,progress);
  }
  progress('Saved privately');
  return result;
}
