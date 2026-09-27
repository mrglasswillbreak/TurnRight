import { openDB } from 'idb';
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
  original?: CampusPhoto;
  metadata: Partial<CampusPhoto>;
  photoId?: string;
  sourceModifications?: string;
  updated: number;
}
const connection = () =>
  openDB('turnright-local-images', 1, {
    upgrade(db) {
      db.createObjectStore('images', { keyPath: ['owner', 'id'] }).createIndex(
        'owner',
        'owner',
      );
    },
  });
type StoredPhoto = LocalPhoto & {
  sourceBytes?: ArrayBuffer;
  sourceType?: string;
  outputBytes?: ArrayBuffer;
  outputType?: string;
};
function restore(value: StoredPhoto): LocalPhoto {
  const { sourceBytes, sourceType, outputBytes, outputType, ...photo } = value;
  return {
    ...photo,
    source: sourceBytes
      ? new Blob([sourceBytes], { type: sourceType })
      : photo.source,
    output: outputBytes
      ? new Blob([outputBytes], { type: outputType })
      : photo.output,
  };
}
export async function localPhotos(owner: string): Promise<LocalPhoto[]> {
  const scopedOwner = campusKey(owner);
  const db = await connection();
  try {
    return (await db.getAllFromIndex('images', 'owner', scopedOwner)).map(
      restore,
    );
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
    return value ? restore(value) : undefined;
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
    await db.put('images', {
      ...metadata,
      sourceBytes,
      sourceType: source.type,
      outputBytes,
      outputType: output?.type,
      owner: scopedOwner,
      updated: Date.now(),
    });
  } finally {
    db.close();
  }
}
export async function removeLocalPhoto(owner: string, id: string) {
  const scopedOwner = campusKey(owner);
  const db = await connection();
  try {
    await db.delete('images', [scopedOwner, id]);
  } finally {
    db.close();
  }
}
export async function associateLocalPhoto(
  owner: string,
  id: string,
  photoId: string,
) {
  const value = await localPhoto(owner, id);
  if (value) await saveLocalPhoto(owner, { ...value, photoId });
}
