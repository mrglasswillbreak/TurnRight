import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { openDB } from 'idb';
import { defaultPhotoRecipe } from '../src/photo-edit';
import { localPhoto, localPhotos, updateLocalPhoto } from '../src/photo-local';

it('atomically upgrades existing image bytes and recipes to separate metadata and content stores', async () => {
  const legacy = await openDB('turnright-local-images', 1, {
    upgrade(db) {
      db.createObjectStore('images', { keyPath: ['owner', 'id'] }).createIndex(
        'owner',
        'owner',
      );
    },
  });
  const record = {
    owner: 'legacy',
    id: 'image',
    target: 'building:one',
    filename: 'old.png',
    sourceBytes: new Uint8Array([1, 2, 3]).buffer,
    sourceType: 'image/png',
    outputBytes: new Uint8Array([4, 5]).buffer,
    outputType: 'image/webp',
    recipe: { ...defaultPhotoRecipe(), rotation: 90 },
    metadata: { caption: 'Keep this caption' },
    updated: 123,
  };
  await legacy.put('images', record);
  legacy.close();
  const [photo] = await localPhotos('legacy', 'building:one');
  expect(photo.recipe.rotation).toBe(90);
  expect(photo.metadata.caption).toBe('Keep this caption');
  expect(photo.source.type).toBe('image/png');
  expect(await photo.source.arrayBuffer()).toEqual(record.sourceBytes);
  expect(await photo.output!.arrayBuffer()).toEqual(record.outputBytes);
  await updateLocalPhoto(
    'legacy',
    'image',
    { recipe: defaultPhotoRecipe() },
    true,
  );
  const restored = await localPhoto('legacy', 'image');
  expect(restored?.output).toBeUndefined();
  expect(await restored!.source.arrayBuffer()).toEqual(record.sourceBytes);
  const db = await openDB('turnright-local-images', 2);
  expect(
    (await db.get('images', ['legacy', 'image'])).sourceBytes,
  ).toBeUndefined();
  db.close();
});
