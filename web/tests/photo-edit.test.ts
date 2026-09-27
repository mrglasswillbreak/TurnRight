import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import {
  defaultPhotoRecipe,
  validatePhotoRecipe,
  photoModifications,
  rotatePhoto,
} from '../src/photo-edit';
import {
  localPhotos,
  localPhoto,
  saveLocalPhoto,
  removeLocalPhoto,
  updateLocalPhoto,
  associateLocalPhoto,
} from '../src/photo-local';
describe('local image drafts', () => {
  it('rotates through all four orientations and retains a straighten adjustment', () => {
    for (const step of [90, -90]) {
      let angle = 0;
      const orientations = [];
      for (let i = 0; i < 4; i++) {
        angle = rotatePhoto(angle, step);
        orientations.push(angle);
      }
      expect(new Set(orientations).size).toBe(4);
      expect(angle).toBe(0);
    }
    expect(rotatePhoto(95, 90)).toBe(-175);
  });
  it('rejects invalid geometry, unbounded decoding controls and formats', () => {
    expect(() => validatePhotoRecipe(defaultPhotoRecipe())).not.toThrow();
    for (const patch of [
      { width: Infinity },
      { quality: 0 },
      { crop: { x: 0.9, y: 0, width: 0.5, height: 1 } },
      { format: 'image/svg+xml' },
      {
        masks: Array(51).fill({
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          mode: 'blur',
        }),
      },
    ])
      expect(() =>
        validatePhotoRecipe({ ...defaultPhotoRecipe(), ...patch } as never),
      ).toThrow();
  });
  it('records modifications without inventing source attribution', () => {
    const recipe = defaultPhotoRecipe();
    recipe.masks = [{ x: 0, y: 0, width: 0.2, height: 0.3, mode: 'redact' }];
    expect(photoModifications(recipe)).toContain('Privacy areas flattened');
    expect(photoModifications(recipe)).not.toContain('Author');
  });
  it('retains originals and recipes independently for each owner', async () => {
    const draft = {
      id: 'same-id',
      owner: 'one',
      target: 'building:one',
      filename: 'original.png',
      source: new Blob(['original'], { type: 'image/png' }),
      recipe: defaultPhotoRecipe(),
      metadata: {},
      updated: 0,
    };
    await saveLocalPhoto('one', draft);
    await saveLocalPhoto('two', { ...draft, filename: 'other.png' });
    expect((await localPhoto('one', 'same-id'))?.filename).toBe('original.png');
    expect((await localPhotos('two'))[0].filename).toBe('other.png');
    await removeLocalPhoto('one', 'same-id');
    expect(await localPhoto('one', 'same-id')).toBeUndefined();
    expect(await localPhoto('two', 'same-id')).toBeDefined();
  });
  it('updates recipes without copying originals, scopes gallery reads and retains concurrent photo associations', async () => {
    const owner = crypto.randomUUID();
    const original = new Blob([new Uint8Array(4 * 1024 * 1024)], {
      type: 'image/png',
    });
    const draft = {
      id: 'large',
      owner,
      target: 'building:one',
      filename: 'large.png',
      source: original,
      recipe: defaultPhotoRecipe(),
      metadata: {},
      updated: 0,
      output: new Blob(['old output'], { type: 'image/webp' }),
    };
    await saveLocalPhoto(owner, draft);
    await saveLocalPhoto(owner, {
      ...draft,
      id: 'other',
      target: 'building:two',
    });
    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    await Promise.all([
      updateLocalPhoto(
        owner,
        draft.id,
        { recipe: { ...draft.recipe, quality: 0.7 } },
        true,
      ),
      associateLocalPhoto(owner, draft.id, 'published-id'),
    ]);
    expect(put.mock.instances.every((store) => store.name === 'images')).toBe(
      true,
    );
    put.mockRestore();
    const rows = await localPhotos(owner, 'building:one');
    expect(rows).toHaveLength(1);
    expect(rows[0].recipe.quality).toBe(0.7);
    expect(rows[0].photoId).toBe('published-id');
    expect(rows[0].output).toBeUndefined();
    expect(await rows[0].source.arrayBuffer()).toEqual(
      await original.arrayBuffer(),
    );
    expect((await localPhotos(owner, 'building:two'))[0].output?.size).toBe(10);
    await removeLocalPhoto(owner, draft.id);
    await expect(
      updateLocalPhoto(owner, draft.id, { filename: 'No resurrection' }),
    ).rejects.toThrow('unavailable');
  });
  it('keeps local originals within their campus even if location changes during an IndexedDB write', async () => {
    const draft = {
      id: 'campus-image',
      owner: 'one',
      target: 'building:one',
      filename: 'lasu.png',
      source: new Blob(['original']),
      recipe: defaultPhotoRecipe(),
      metadata: {},
      updated: 0,
    };
    try {
      vi.stubGlobal('location', { search: '' });
      const write = saveLocalPhoto('one', draft);
      vi.stubGlobal('location', { search: '?campus=unilag' });
      await write;
      expect(await localPhoto('one', draft.id)).toBeUndefined();
      await saveLocalPhoto('one', { ...draft, filename: 'unilag.png' });
      expect((await localPhoto('one', draft.id))?.filename).toBe('unilag.png');
      vi.stubGlobal('location', { search: '' });
      expect((await localPhoto('one', draft.id))?.filename).toBe('lasu.png');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
