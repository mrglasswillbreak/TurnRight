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
export async function localPhotos(owner: string): Promise<LocalPhoto[]> {
  const db = await connection();
  try {
    return await db.getAllFromIndex('images', 'owner', campusKey(owner));
  } finally {
    db.close();
  }
}
export async function localPhoto(
  owner: string,
  id: string,
): Promise<LocalPhoto | undefined> {
  const db = await connection();
  try {
    return await db.get('images', [campusKey(owner), id]);
  } finally {
    db.close();
  }
}
export async function saveLocalPhoto(owner: string, value: LocalPhoto) {
  const db = await connection();
  try {
    await db.put('images', {
      ...value,
      owner: campusKey(owner),
      updated: Date.now(),
    });
  } finally {
    db.close();
  }
}
export async function removeLocalPhoto(owner: string, id: string) {
  const db = await connection();
  try {
    await db.delete('images', [campusKey(owner), id]);
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
