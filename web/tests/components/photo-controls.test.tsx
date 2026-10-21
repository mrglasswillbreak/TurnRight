import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { PhotoEditControls } from '../../src/PhotoEditControls';
import { PhotoLocalDrafts } from '../../src/PhotoLocalDrafts';
import { defaultPhotoRecipe, type PhotoRecipe } from '../../src/photo-edit';
import {
  saveLocalPhoto,
  localPhotos,
  type LocalPhoto,
} from '../../src/photo-local';
import type { PhotoOptimizerState } from '../../src/usePhotoOptimizer';
import type { PhotoTool } from '../../src/PhotoCompare';
import { render } from './render';
import { button, click, fill, choose, expand, setPicker } from './interact';

const photograph = (id: string): LocalPhoto => ({
  id,
  owner: 'photo-controls-owner',
  target: 'library',
  filename: `${id}.png`,
  source: new Blob(['source'], { type: 'image/png' }),
  output: new Blob(['output'], { type: 'image/webp' }),
  metadata: {},
  updated: 1,
  recipe: defaultPhotoRecipe(),
});

it('invalidates privacy areas on geometry edits and maintains independent colour and resize settings', async () => {
  const image = document.createElement('canvas');
  image.width = 80;
  image.height = 40;
  const sourceUrl = image.toDataURL();
  function Editor() {
    const [recipe, setRecipe] = useState<PhotoRecipe>({
      ...defaultPhotoRecipe(),
      masks: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.2, mode: 'redact' }],
    });
    const [tool, setTool] = useState<PhotoTool>('navigate');
    const state = {
      current: { ...photograph('first'), recipe },
      settingsTab: 'edit',
      tool,
      setTool,
      sourceUrl,
      change: (patch: Partial<PhotoRecipe>) =>
        setRecipe((r) => ({ ...r, ...patch })),
    } as PhotoOptimizerState;
    return (
      <>
        <PhotoEditControls state={state} />
        <output data-testid="recipe">{JSON.stringify(recipe)}</output>
        <output data-testid="tool">{tool}</output>
      </>
    );
  }
  const recipe = () =>
    JSON.parse(
      page.getByTestId('recipe').element().textContent!,
    ) as PhotoRecipe;
  await render(<Editor />);
  await expand('Crop & orientation');
  await choose('Crop aspect ratio', '1');
  await expect
    .poll(() => recipe().crop)
    .toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
  expect(recipe().masks).toEqual([]);
  await choose('Crop aspect ratio', 'free');
  expect(page.getByTestId('tool').element().textContent).toBe('crop');
  await click('Draw crop');
  await fill('Crop x (%)', '10');
  await fill('Crop y (%)', '20');
  await fill('Crop width (%)', '100');
  await fill('Crop height (%)', '100');
  expect(recipe().crop).toEqual({ x: 0.1, y: 0.2, width: 0.9, height: 0.8 });
  await click('Rotate left');
  expect(recipe().rotation).toBe(-90);
  await click('Rotate right');
  await click('Flip horizontal');
  await click('Flip vertical');
  await setPicker('Straighten', '5');
  expect(recipe()).toMatchObject({ rotation: 5, flipX: true, flipY: true });
  await expand('Light & colour');
  await setPicker('Exposure', '0.5');
  await setPicker('Contrast', '1.5');
  await setPicker('Saturation', '0.5');
  await setPicker('Temperature', '-0.5');
  expect(recipe()).toMatchObject({
    exposure: 0.5,
    contrast: 1.5,
    saturation: 0.5,
    temperature: -0.5,
  });
  await expand('Privacy areas (0)');
  await click('Add redaction with coordinates');
  await fill('Area 1 x (%)', '10');
  await fill('Area 1 y (%)', '20');
  await fill('Area 1 width (%)', '30');
  await fill('Area 1 height (%)', '40');
  expect(recipe().masks).toEqual([
    { mode: 'redact', x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  ]);
  for (const tool of ['blur', 'pixelate', 'redact']) {
    await click(tool);
    expect(page.getByTestId('tool').element().textContent).toBe(tool);
  }
  await click('Remove area 1');
  await click('Add redaction with coordinates');
  await click('Clear areas');
  expect(recipe().masks).toEqual([]);
  await expand('Resize');
  await fill('Longest edge (px)', '1200');
  expect(recipe().width).toBe(1200);
});

it('keeps batch compression independent of crop and safely removes a persisted local image', async () => {
  const first = photograph('first'),
    second = photograph('second');
  first.recipe = {
    ...first.recipe,
    width: 800,
    quality: 0.7,
    targetKiB: 100,
    format: 'image/jpeg',
  };
  second.recipe.crop = { x: 0.2, y: 0.2, width: 0.5, height: 0.5 };
  await saveLocalPhoto(first.owner, first);
  await saveLocalPhoto(first.owner, second);
  const save = vi.fn(),
    prepare = vi.fn(),
    renderBatch = vi.fn(),
    abort = vi.fn(),
    setError = vi.fn();
  function Gallery({ protectedIds = [] }: { protectedIds?: string[] }) {
    const [items, setItems] = useState([first, second]),
      [selected, setSelected] = useState(first.id);
    const [panel, setPanel] = useState<string | null>('files');
    const state = {
      widePhoto: false,
      panel,
      setPanel,
      items,
      selected,
      setSelected,
      setItems,
      current: items.find((p) => p.id === selected),
      busy: false,
      setPast: vi.fn(),
      setFuture: vi.fn(),
      setPreviewPaused: vi.fn(),
      setTool: vi.fn(),
      prepare,
      prepared: false,
      save,
      render: renderBatch,
      protectedIds,
      previewController: { current: { abort } },
      pending: { current: Promise.resolve() },
      owner: first.owner,
      setError,
    } as unknown as PhotoOptimizerState;
    return <PhotoLocalDrafts state={state} />;
  }
  const view = await render(<Gallery protectedIds={['first']} />);
  await expect.element(button('Remove local files')).toBeDisabled();
  await expand('Batch tools');
  await click('Apply compression settings to batch');
  expect(save.mock.calls[1][0]).toMatchObject({
    id: 'second',
    output: undefined,
    recipe: {
      crop: second.recipe.crop,
      width: 800,
      quality: 0.7,
      targetKiB: 100,
      format: 'image/jpeg',
    },
  });
  await click('Optimise batch');
  expect(renderBatch).toHaveBeenLastCalledWith([first, second], false);
  await click('Use batch for map');
  expect(renderBatch).toHaveBeenLastCalledWith([first, second], true);
  await click('Prepare for offline use');
  expect(prepare).toHaveBeenCalledOnce();
  await view.rerender(<Gallery />);
  await click('Remove local files');
  await expect
    .poll(async () =>
      (await localPhotos(first.owner, 'library')).map((p) => p.id),
    )
    .toEqual(['second']);
  expect(abort).toHaveBeenCalledOnce();
  expect(setError).not.toHaveBeenCalled();
  await click('Remove local files');
  await expect
    .poll(async () => (await localPhotos(first.owner, 'library')).length)
    .toBe(0);
  expect(
    page.getByText('No local photos. Add photos from the gallery.').query(),
  ).not.toBeNull();
  await click('Collapse local images');
  expect(
    page
      .getByRole('region', { name: 'Local images and offline tools' })
      .query(),
  ).toBeNull();
});
