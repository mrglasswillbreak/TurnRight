import { describe, expect, it } from 'vitest';
import {
  clampSheetHeight,
  resizeSheetKey,
  sheetLimits,
  sheetViewport,
} from '../src/sheet-size';
import { publicMapPadding } from '../src/public-map-layout';

describe('resizable public cards', () => {
  it('allows a desktop card to open at full height and then shrink', () => {
    const desktop = sheetLimits(900, 96, 32, true);
    expect(desktop).toEqual({ min: 96, max: 868 });
    expect(
      resizeSheetKey('ArrowDown', desktop.max, desktop.min, desktop.max),
    ).toBe(836);
    expect(resizeSheetKey('Home', desktop.max, desktop.min, desktop.max)).toBe(
      96,
    );
    expect(resizeSheetKey('End', 400, desktop.min, desktop.max)).toBe(868);
  });
  it('keeps the map exposed and lets a dialog fit above a short keyboard viewport', () => {
    const phone = sheetLimits(844, 96);
    expect(phone.min).toBe(96);
    expect(phone.max).toBeLessThan(844 - 32);
    const keyboard = sheetLimits(240, 220);
    expect(keyboard.min).toBeLessThanOrEqual(keyboard.max);
    expect(clampSheetHeight(600, keyboard.min, keyboard.max)).toBe(208);
    expect(clampSheetHeight(-20, phone.min, phone.max)).toBe(96);
    expect(clampSheetHeight(NaN, phone.min, phone.max)).toBe(96);
  });

  it('gives focused search room for results instead of reserving map controls', () => {
    for (const height of [320, 450, 540]) {
      const search = sheetLimits(height, 96, 208, false, true);
      expect(search.max).toBe(height - 32);
      expect(search.max - 196).toBeGreaterThanOrEqual(92);
      expect(sheetLimits(height, 96, 288, false, true)).toEqual(search);
      expect(
        resizeSheetKey('ArrowDown', search.max, search.min, search.max),
      ).toBe(search.max - 32);
    }
    expect(sheetLimits(844, 96, 208).max).toBe(636);
  });

  it('anchors sheets to the visible viewport with either keyboard resize behavior', () => {
    expect(sheetViewport(844, { height: 450, offsetTop: 0 })).toEqual({
      height: 450,
      bottom: 394,
    });
    expect(sheetViewport(844, { height: 450, offsetTop: 70 })).toEqual({
      height: 450,
      bottom: 324,
    });
    expect(sheetViewport(450, { height: 450, offsetTop: 0 })).toEqual({
      height: 450,
      bottom: 0,
    });
    expect(sheetViewport(844, { height: 844, offsetTop: 0 })).toEqual({
      height: 844,
      bottom: 0,
    });
    expect(sheetViewport(450)).toEqual({ height: 450, bottom: 0 });
  });

  it('supports keyboard resizing without trapping unrelated keys', () => {
    expect(resizeSheetKey('ArrowUp', 310, 96, 320)).toBe(320);
    expect(resizeSheetKey('ArrowDown', 110, 96, 320)).toBe(96);
    expect(resizeSheetKey('Home', 250, 96, 320)).toBe(96);
    expect(resizeSheetKey('End', 250, 96, 320)).toBe(320);
    expect(resizeSheetKey('Tab', 250, 96, 320)).toBeNull();
    expect(resizeSheetKey('Escape', 250, 96, 320)).toBeNull();
  });
});

function padding(
  width: number,
  height: number,
  panel: { top: number; right: number; height: number },
) {
  return publicMapPadding({
    getBoundingClientRect: () => ({ width, height, left: 0, bottom: height }),
    closest: () => ({
      querySelector: () => ({ getBoundingClientRect: () => panel }),
    }),
  } as unknown as HTMLElement);
}

describe('map space around the public card', () => {
  it('keeps a phone selection above the actual panel, including its keyboard offset', () => {
    expect(
      padding(390, 844, { top: 400, right: 378, height: 432 }).bottom,
    ).toBe(464);
    expect(
      padding(390, 844, { top: 250, right: 378, height: 432 }).bottom,
    ).toBe(614);
  });

  it('uses the space beside a desktop card and above a compact search bar', () => {
    expect(padding(1280, 900, { top: 384, right: 464, height: 500 }).left).toBe(
      484,
    );
    expect(
      padding(1280, 900, { top: 788, right: 464, height: 96 }).bottom,
    ).toBe(132);
  });

  it('always leaves usable map space in a short landscape viewport', () => {
    const result = padding(640, 320, { top: 26, right: 628, height: 282 });
    expect(result.top + result.bottom).toBeLessThanOrEqual(220);
    expect(result.left + result.right).toBeLessThan(540);
  });
});
