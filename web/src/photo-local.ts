import { openDB, type IDBPDatabase } from 'idb';
import { campusKey } from './campus-context';
import type { PhotoRecipe } from './photo-edit';
import type { CampusPhoto } from './types';
export interface LocalPhoto {
  id: string;
  owner: string;
  target: string;
  filename: string;
  source: Blob;
  recipe: PhotoRecipe;
  output?: Blob;
  width?: number;
  height?: number;
  outputQuality?: number;
  original?: CampusPhoto;
  metadata: Partial<CampusPhoto>;
  photoId?: string;
  sourceModifications?: string;
  updated: number;
}
const connection = () =>
  openDB('turnright-local-images', 2, {
    upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1)
        db.createObjectStore('images', {
          keyPath: ['owner', 'id'],
        }).createIndex('owner', 'owner');
      const images = tx.objectStore('images');
      images.createIndex('ownerTarget', ['owner', 'target']);
      const content = db.createObjectStore('content', {
        keyPath: ['owner', 'id', 'kind'],
      });
      // Keep migration atomic. Legacy binary values move inside this transaction;
      // no decoding or external promises can interrupt its lifetime.
      void (async () => {
        let cursor = await images.openCursor();
        while (cursor) {
          const {
            source,
            output,
            sourceBytes,
            sourceType,
            outputBytes,
            outputType,
            ...metadata
          } = cursor.value as StoredPhoto;
          await content.put({
            owner: metadata.owner,
            id: metadata.id,
            kind: 'source',
            bytes: sourceBytes,
            type: sourceType,
            blob: source,
          });
          if (outputBytes || output)
            await content.put({
              owner: metadata.owner,
              id: metadata.id,
              kind: 'output',
              bytes: outputBytes,
              type: outputType,
              blob: output,
            });
          await cursor.update(metadata);
          cursor = await cursor.continue();
        }
      })().catch(() => {
        // Opening the database rejects when migration aborts; version 1 stays intact.
        try {
          tx.abort();
        } catch {
          /* The failing request already aborted it. */
        }
      });
    },
  });
type StoredPhoto = LocalPhoto & {
  sourceBytes?: ArrayBuffer;
  sourceType?: string;
  outputBytes?: ArrayBuffer;
  outputType?: string;
};
async function restore(
  db: IDBPDatabase,
  photo: Omit<LocalPhoto, 'source' | 'output'>,
): Promise<LocalPhoto> {
  const tx = db.transaction('content');
  const [source, output] = await Promise.all(
    ['source', 'output'].map((kind) =>
      tx.store.get([photo.owner, photo.id, kind]),
    ),
  );
  await tx.done;
  if (!source)
    throw Error(
      'The local original is unavailable. Reselect the original image.',
    );
  const blob = (value: { bytes?: ArrayBuffer; type?: string; blob?: Blob }) =>
    value.bytes ? new Blob([value.bytes], { type: value.type }) : value.blob!;
  return {
    ...photo,
    source: blob(source),
    output: output ? blob(output) : undefined,
  };
}
export async function localPhotos(
  owner: string,
  target?: string,
): Promise<LocalPhoto[]> {
  const scopedOwner = campusKey(owner);
  const db = await connection();
  try {
    const metadata = await db.getAllFromIndex(
      'images',
      target === undefined ? 'owner' : 'ownerTarget',
      target === undefined ? scopedOwner : [scopedOwner, target],
    );
    const photos: LocalPhoto[] = [];
    for (const photo of metadata) photos.push(await restore(db, photo));
    return photos;
  } finally {
    db.close();
  }
}
export async function localPhoto(
  owner: string,
  id: string,
): Promise<LocalPhoto | undefined> {
  const scopedOwner = campusKey(owner);
  const db = await connection();
  try {
    const value = await db.get('images', [scopedOwner, id]);
    return value ? await restore(db, value) : undefined;
  } finally {
    db.close();
  }
}
export async function saveLocalPhoto(owner: string, value: LocalPhoto) {
  const scopedOwner = campusKey(owner);
  const { source, output, ...metadata } = value;
  const sourceBytes = await source.arrayBuffer();
  const outputBytes = output ? await output.arrayBuffer() : undefined;
  const db = await connection();
  try {
    const tx = db.transaction(['images', 'content'], 'readwrite');
    await tx.objectStore('images').put({
      ...metadata,
      owner: scopedOwner,
      updated: Date.now(),
    });
    const content = tx.objectStore('content');
    await content.put({
      owner: scopedOwner,
      id: value.id,
      kind: 'source',
      bytes: sourceBytes,
      type: source.type,
    });
    if (outputBytes)
      await content.put({
        owner: scopedOwner,
        id: value.id,
        kind: 'output',
        bytes: outputBytes,
        type: output!.type,
      });
    else await content.delete([scopedOwner, value.id, 'output']);
    await tx.done;
  } finally {
    db.close();
  }
}
/** Recipe and association writes never read or clone the original image bytes. */
export async function updateLocalPhoto(
  owner: string,
  id: string,
  patch: Partial<Omit<LocalPhoto, 'id' | 'owner' | 'source' | 'output'>>,
  clearOutput = false,
  output?: Blob,
) {
  const outputBytes = output ? await output.arrayBuffer() : undefined;
  const scopedOwner = campusKey(owner);
  const db = await connection();
  try {
    const tx = db.transaction(['images', 'content'], 'readwrite');
    const images = tx.objectStore('images');
    const previous = await images.get([scopedOwner, id]);
    if (!previous) {
      await tx.done;
      throw Error(
        'The local original is unavailable. Reselect the original image.',
      );
    }
    await images.put({
      ...previous,
      ...patch,
      owner: scopedOwner,
      id,
      updated: Date.now(),
    });
    if (outputBytes)
      await tx
        .objectStore('content')
        .put({
          owner: scopedOwner,
          id,
          kind: 'output',
          bytes: outputBytes,
          type: output!.type,
        });
    else if (clearOutput)
      await tx.objectStore('content').delete([scopedOwner, id, 'output']);
    await tx.done;
  } finally {
    db.close();
  }
}
export async function removeLocalPhoto(owner: string, id: string) {
  const scopedOwner = campusKey(owner);
  const db = await connection();
  try {
    const tx = db.transaction(['images', 'content'], 'readwrite');
    await Promise.all([
      tx.objectStore('images').delete([scopedOwner, id]),
      tx.objectStore('content').delete([scopedOwner, id, 'source']),
      tx.objectStore('content').delete([scopedOwner, id, 'output']),
    ]);
    await tx.done;
  } finally {
    db.close();
  }
}
export async function associateLocalPhoto(
  owner: string,
  id: string,
  photoId: string,
) {
  await updateLocalPhoto(owner, id, { photoId });
}
