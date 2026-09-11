import { openDB } from 'idb';
import {
  pauseSurvey,
  type SurveyRecording,
  type SurveySample,
  type SurveySession,
} from './survey-model';

const versions = new Map<string, number>();
const keyFor = (s: SurveySession) => `${s.owner}:${s.id}`;
const database = () =>
  openDB('turnright-surveys', 1, {
    upgrade(db) {
      db.createObjectStore('sessions', { keyPath: ['owner', 'id'] });
      const samples = db.createObjectStore('samples', {
        keyPath: ['owner', 'surveyId', 'id'],
      });
      samples.createIndex('survey', ['owner', 'surveyId']);
      db.createObjectStore('context');
    },
  });
export async function saveSurveyLocal(
  session: SurveySession,
  sample?: SurveySample,
) {
  const db = await database();
  try {
    const tx = db.transaction(['sessions', 'samples'], 'readwrite', {
      durability: 'strict',
    });
    const previous = await tx.objectStore('sessions').get([session.owner,session.id]);
    const expected = versions.get(keyFor(session)) ?? session.localVersion ?? 0;
    if ((previous?.localVersion ?? 0) !== expected) {
      tx.abort(); await tx.done.catch(()=>{});
      throw new Error('This survey changed in another tab. Your current recording is paused; save a separate recovery copy before reopening it.');
    }
    await tx.objectStore('sessions').put({...session,localVersion:expected+1});
    if (sample)
      await tx
        .objectStore('samples')
        .put({ ...sample, owner: session.owner, surveyId: session.id });
    await tx.done;
    versions.set(keyFor(session),expected+1); session.localVersion=expected+1;
  } finally {
    db.close();
  }
}
export async function storeRecording(recording: SurveyRecording) {
  const db = await database();
  try {
    const tx = db.transaction(['sessions', 'samples'], 'readwrite', {
      durability: 'strict',
    });
    const session=recording.session;
    const previous = await tx.objectStore('sessions').get([session.owner,session.id]);
    const expected = versions.get(keyFor(session)) ?? session.localVersion ?? 0;
    if ((previous?.localVersion ?? 0) !== expected) { tx.abort(); await tx.done.catch(()=>{}); throw new Error('Survey changed in another tab. Save a separate recovery copy.'); }
    await tx.objectStore('sessions').put({...session,localVersion:expected+1});
    for (const sample of recording.samples)
      await tx
        .objectStore('samples')
        .put({
          ...sample,
          owner: recording.session.owner,
          surveyId: recording.session.id,
        });
    await tx.done;
    versions.set(keyFor(session),expected+1); session.localVersion=expected+1;
  } finally {
    db.close();
  }
}
export async function listLocalSurveys(
  owner: string,
): Promise<SurveySession[]> {
  const db = await database();
  try {
    return (await db.getAll('sessions'))
      .filter((s) => s.owner === owner)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally {
    db.close();
  }
}
export async function loadSurveyLocal(
  owner: string,
  id: string,
): Promise<SurveyRecording | null> {
  const db = await database();
  try {
    const session = (await db.get('sessions', [owner, id])) as
      | SurveySession
      | undefined;
    if (!session) return null;
    versions.set(keyFor(session),session.localVersion??0);
    const rows = await db.getAllFromIndex('samples', 'survey', [owner, id]);
    const samples: SurveySample[] = rows
      .map(({ owner: _owner, surveyId: _id, ...s }) => s)
      .sort((a, b) => a.timestamp - b.timestamp);
    if (session.state === 'recording')
      pauseSurvey(session, 'Recovered recording. Tap Resume when ready.');
    return { session, samples };
  } finally {
    db.close();
  }
}
export async function writeSurveyContext(owner: string, context: unknown) {
  const db = await database();
  try {
    await db.put('context', context, owner);
  } finally {
    db.close();
  }
}
export async function readSurveyContext<T>(
  owner: string,
): Promise<T | undefined> {
  const db = await database();
  try {
    return await db.get('context', owner);
  } finally {
    db.close();
  }
}
