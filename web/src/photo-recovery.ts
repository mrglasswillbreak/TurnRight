import { campusKey } from './campus-context';
import { openDB } from 'idb';
import type { PhotoJob } from './photo-queue-store';
const connection = () =>
  openDB('turnright-photo-recovery', 1, {
    upgrade(db) {
      db.createObjectStore('jobs', { keyPath: ['owner', 'key'] }).createIndex(
        'owner',
        'owner',
      );
    },
  });
export function recoveryPhoto(job: PhotoJob) {
  const { previewUrl: _preview, previewExpiresAt: _expiry, ...record } = job;
  return record;
}
export async function readPhotoRecovery(owner: string): Promise<PhotoJob[]> {
  owner = campusKey(owner);
  const db = await connection();
  try {
    const prefix = `turnright:photo-drafts:${owner}:`;
    const legacy = Object.keys(localStorage).filter((key) =>
      key.startsWith(prefix),
    );
    const existing: PhotoJob[] = await db.getAllFromIndex(
      'jobs',
      'owner',
      owner,
    );
    let order = Math.max(0, ...existing.map((j) => j.order || 0));
    for (const key of legacy) {
      const records = JSON.parse(
        localStorage.getItem(key) || '[]',
      ) as PhotoJob[];
      if (!Array.isArray(records)) throw Error('Invalid photo recovery');
      const tx = db.transaction('jobs', 'readwrite');
      for (const job of records) {
        if (!job.key || !job.metadata) continue;
        if (!(await tx.store.get([owner, job.key])))
          await tx.store.put({
            ...recoveryPhoto(job),
            order: job.order ?? ++order,
            owner,
            target: key.slice(prefix.length),
          });
      }
      await tx.done;
      localStorage.removeItem(key);
    }
    const stored = await db.getAllFromIndex('jobs', 'owner', owner);
    return stored.map(
      (
        record: PhotoJob & {
          preparedBytes?: ArrayBuffer;
          preparedType?: string;
        },
      ) => {
        const { preparedBytes, preparedType, ...job } = record;
        return preparedBytes
          ? {
              ...job,
              preparedFile: new Blob([preparedBytes], { type: preparedType }),
            }
          : job;
      },
    );
  } finally {
    db.close();
  }
}
export async function writePhotoRecovery(
  owner: string,
  changes: Map<string, PhotoJob | null>,
) {
  owner = campusKey(owner);
  const prepared = await Promise.all(
    [...changes].map(async ([key, job]) => {
      if (!job) return { key, record: null };
      const { preparedFile, ...record } = recoveryPhoto(job);
      return {
        key,
        record: {
          ...record,
          owner,
          preparedBytes: preparedFile
            ? await preparedFile.arrayBuffer()
            : undefined,
          preparedType: preparedFile?.type,
        },
      };
    }),
  );
  const db = await connection();
  try {
    const tx = db.transaction('jobs', 'readwrite');
    await Promise.all(
      prepared.map(({ key, record }) =>
        record ? tx.store.put(record) : tx.store.delete([owner, key]),
      ),
    );
    await tx.done;
  } finally {
    db.close();
  }
}
