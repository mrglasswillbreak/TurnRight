import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import PhotoCompare from '../../src/PhotoCompare';
import { render } from './render';
import { click, fill, setPicker, field } from './interact';

function source() {
  const canvas = document.createElement('canvas');
  canvas.width = 80;
  canvas.height = 40;
  return canvas.toDataURL();
}
const canvas = () => page.getByRole('application').element() as HTMLElement;
const pointer = (type: string, x: number, y: number, id = 1, button = 0) =>
  act(() => {
    const el = canvas(),
      box = el.getBoundingClientRect();
    el.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: id,
        button,
        clientX: box.left + x,
        clientY: box.top + y,
      }),
    );
  });
const key = (key: string) =>
  act(() =>
    canvas().dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true }),
    ),
  );

it('normalizes drawn privacy regions and cancels incomplete or multi-touch selections', async () => {
  const onRegion = vi.fn(),
    onCancel = vi.fn(),
    image = source();
  await render(
    <>
      <style>{'.photo-compare-canvas { width: 400px; height: 300px; }'}</style>
      <PhotoCompare
        source={image}
        output={image}
        tool="redact"
        onRegion={onRegion}
        onCancel={onCancel}
      />
    </>,
  );
  vi.spyOn(canvas(), 'setPointerCapture').mockImplementation(() => {});
  await expect
    .poll(
      () =>
        (
          page
            .getByAltText('Edited photograph preview')
            .element() as HTMLImageElement
        ).style.width,
    )
    .toBe('400px');
  await pointer('pointerdown', 100, 100);
  await pointer('pointermove', 300, 200);
  await pointer('pointerup', 300, 200);
  expect(onRegion).toHaveBeenCalledWith({
    x: 0.25,
    y: 0.25,
    width: 0.5,
    height: 0.5,
  });
  await pointer('pointerdown', 100, 100);
  await pointer('pointerdown', 120, 120, 2);
  await pointer('pointermove', 150, 150, 2);
  await pointer('pointerup', 150, 150, 2);
  await pointer('pointerup', 100, 100);
  expect(onRegion).toHaveBeenCalledOnce();
  await pointer('pointerdown', 100, 100);
  await key('Escape');
  await pointer('pointerup', 300, 200);
  expect(onCancel).toHaveBeenCalledOnce();
  expect(onRegion).toHaveBeenCalledOnce();
  await pointer('pointerdown', 10, 10, 1, 2);
  await pointer('pointermove', 30, 30);
  await pointer('pointerup', 30, 30);
  await pointer('pointercancel', 30, 30);
  expect(onRegion).toHaveBeenCalledOnce();
});

it('supports bounded keyboard, wheel, pan and comparison controls, then resets for a new photo', async () => {
  const image = source(),
    props = {
      source: image,
      output: image,
      tool: 'navigate' as const,
      onRegion: vi.fn(),
      onCancel: vi.fn(),
    };
  const element = (src: string) => (
    <>
      <style>{'.photo-compare-canvas { width: 300px; height: 600px; }'}</style>
      <PhotoCompare {...props} source={src} />
    </>
  );
  const view = await render(element(image));
  vi.spyOn(canvas(), 'setPointerCapture').mockImplementation(() => {});
  await expect
    .poll(() =>
      field('Before and after comparison')
        .element()
        .getAttribute('aria-orientation'),
    )
    .toBe('vertical');
  await setPicker('Before and after comparison', '70');
  await act(() =>
    field('Before and after comparison')
      .element()
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }),
      ),
  );
  expect(
    field('Before and after comparison')
      .element()
      .getAttribute('aria-valuenow'),
  ).toBe('68');
  await click('Zoom in');
  expect((field('Image zoom').element() as HTMLInputElement).value).toBe('125');
  await click('Zoom out');
  await fill('Image zoom', '9000');
  expect((field('Image zoom').element() as HTMLInputElement).value).toBe(
    '1200',
  );
  await fill('Image zoom', '1');
  expect((field('Image zoom').element() as HTMLInputElement).value).toBe('25');
  await click('Fit image');
  const preview = page
    .getByAltText('Edited photograph preview')
    .element() as HTMLImageElement;
  const before = preview.style.left;
  await key('ArrowLeft');
  await key('ArrowUp');
  expect(preview.style.left).not.toBe(before);
  await key('ArrowRight');
  await key('ArrowDown');
  await pointer('pointerdown', 100, 100);
  await pointer('pointermove', 130, 130);
  await pointer('pointerup', 130, 130);
  expect(props.onRegion).not.toHaveBeenCalled();
  await act(() =>
    canvas().dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: -100,
        clientX: 100,
        clientY: 100,
      }),
    ),
  );
  expect(
    Number((field('Image zoom').element() as HTMLInputElement).value),
  ).toBeGreaterThan(100);
  await view.rerender(element(image + '#another-photo'));
  expect((field('Image zoom').element() as HTMLInputElement).value).toBe('100');
});
