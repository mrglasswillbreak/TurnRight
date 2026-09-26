import { campusKey } from './campus-context';
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
  openDB('turnright-surveys', 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('sessions', { keyPath: ['owner', 'id'] });
        const samples = db.createObjectStore('samples', {
          keyPath: ['owner', 'surveyId', 'id'],
        });
        samples.createIndex('survey', ['owner', 'surveyId']);
        db.createObjectStore('context');
      }
      if (oldVersion < 2) db.createObjectStore('uploads');
    },
  });
export async function saveSurveyLocal(
  session: SurveySession,
  sample?: SurveySample,
) {
  const db = await database();
  try {
    const tx = db.transaction(['sessions', 'samples', 'uploads'], 'readwrite', {
      durability: 'strict',
    });
    const previous = await tx
      .objectStore('sessions')
      .get([session.owner, session.id]);
    const expected = versions.get(keyFor(session)) ?? session.localVersion ?? 0;
    if ((previous?.localVersion ?? 0) !== expected) {
      tx.abort();
      await tx.done.catch(() => {});
      throw new Error(
        'This survey changed in another tab. Your current recording is paused; save a separate recovery copy before reopening it.',
      );
    }
    const { pendingUpload, ...header } = session;
    if (pendingUpload && previous?.pendingUploadId !== pendingUpload.revisionId)
      await tx
        .objectStore('uploads')
        .put(pendingUpload, [session.owner, session.id]);
    if (!pendingUpload && previous?.pendingUploadId)
      await tx.objectStore('uploads').delete([session.owner, session.id]);
    await tx.objectStore('sessions').put({
      ...header,
      pendingUploadId: pendingUpload?.revisionId,
      localVersion: expected + 1,
    });
    if (sample)
      await tx
        .objectStore('samples')
        .put({ ...sample, owner: session.owner, surveyId: session.id });
    await tx.done;
    versions.set(keyFor(session), expected + 1);
    session.localVersion = expected + 1;
  } finally {
    db.close();
  }
}
export async function storeRecording(recording: SurveyRecording) {
  const db = await database();
  try {
    const tx = db.transaction(['sessions', 'samples', 'uploads'], 'readwrite', {
      durability: 'strict',
    });
    const session = recording.session;
    const previous = await tx
      .objectStore('sessions')
      .get([session.owner, session.id]);
    const expected = versions.get(keyFor(session)) ?? session.localVersion ?? 0;
    if ((previous?.localVersion ?? 0) !== expected) {
      tx.abort();
      await tx.done.catch(() => {});
      throw new Error(
        'Survey changed in another tab. Save a separate recovery copy.',
      );
    }
    const { pendingUpload, ...header } = session;
    if (pendingUpload)
      await tx
        .objectStore('uploads')
        .put(pendingUpload, [session.owner, session.id]);
    else await tx.objectStore('uploads').delete([session.owner, session.id]);
    await tx.objectStore('sessions').put({
      ...header,
      pendingUploadId: pendingUpload?.revisionId,
      localVersion: expected + 1,
    });
    const oldKeys = await tx
      .objectStore('samples')
      .index('survey')
      .getAllKeys([session.owner, session.id]);
    await Promise.all(
      oldKeys.map((key) => tx.objectStore('samples').delete(key)),
    );
    for (const sample of recording.samples)
      await tx.objectStore('samples').put({
        ...sample,
        owner: recording.session.owner,
        surveyId: recording.session.id,
      });
    await tx.done;
    versions.set(keyFor(session), expected + 1);
    session.localVersion = expected + 1;
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
      .map((s: SurveySession) => {
        if (s.state === 'recording')
          pauseSurvey(s, 'Recovered recording. Tap Resume when ready.');
        return s;
      })
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
      | (SurveySession & { pendingUploadId?: string })
      | undefined;
    if (!session) return null;
    if (session.pendingUploadId)
      session.pendingUpload = await db.get('uploads', [owner, id]);
    delete session.pendingUploadId;
    versions.set(keyFor(session), session.localVersion ?? 0);
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
    await db.put('context', context, campusKey(owner));
  } finally {
    db.close();
  }
}
export async function readSurveyContext<T>(
  owner: string,
): Promise<T | undefined> {
  const db = await database();
  try {
    return await db.get('context', campusKey(owner));
  } finally {
    db.close();
  }
}
