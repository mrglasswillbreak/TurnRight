import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  defaultPhotoRecipe,
  validatePhotoRecipe,
  photoModifications,
} from '../src/photo-edit';
import {
  localPhotos,
  localPhoto,
  saveLocalPhoto,
  removeLocalPhoto,
} from '../src/photo-local';
describe('local image drafts', () => {
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
});
