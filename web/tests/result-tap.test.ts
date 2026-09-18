import { describe, expect, it } from 'vitest';
import { ResultTap } from '../src/result-tap';
const down = {
  pointerId: 1,
  pointerType: 'touch',
  isPrimary: true,
  button: 0,
  clientX: 100,
  clientY: 200,
  timeStamp: 100,
};
const up = { ...down, timeStamp: 180 };

describe('mobile search result taps', () => {
  it('selects on release even if the browser never sends a click', () => {
    const tap = new ResultTap();
    expect(tap.begin(down, true)).toBe(true);
    expect(tap.end(up)).toBe(true);
    expect(tap.end(up)).toBe(false);
    expect(tap.allowClick(1)).toBe(false);
  });
  it('accepts small finger movement and pen taps', () => {
    const tap = new ResultTap();
    expect(tap.begin({ ...down, pointerType: 'pen' }, true)).toBe(true);
    expect(tap.end({ ...up, clientX: 104, clientY: 204 })).toBe(true);
  });
  it('does not select when a scroll moves away and back', () => {
    const tap = new ResultTap();
    tap.begin(down, true);
    tap.move({ ...up, clientY: 220 });
    tap.move(up);
    expect(tap.end(up)).toBe(false);
    expect(tap.allowClick(1)).toBe(false);
  });
  it('checks release movement even when a move event was skipped', () => {
    const tap = new ResultTap();
    tap.begin(down, true);
    expect(tap.end({ ...up, clientX: 125 })).toBe(false);
  });
  it('cancels for browser panning or lost capture', () => {
    const tap = new ResultTap();
    tap.begin(down, true);
    tap.cancel();
    expect(tap.end(up)).toBe(false);
    expect(tap.allowClick(1)).toBe(false);
    expect(tap.begin(down, true)).toBe(true);
    expect(tap.end(up)).toBe(true);
  });
  it('does not activate on long presses or another finger', () => {
    const tap = new ResultTap();
    tap.begin(down, true);
    expect(tap.end({ ...up, timeStamp: 900 })).toBe(false);
    tap.begin(down, true);
    expect(tap.end({ ...up, pointerId: 2 })).toBe(false);
    tap.begin({ ...down, pointerId: 2, isPrimary: false }, true);
    expect(tap.end(up)).toBe(false);
  });
  it('preserves mouse, keyboard, screen-reader and ordinary browsing clicks', () => {
    const tap = new ResultTap();
    expect(tap.begin(down, false)).toBe(false);
    expect(tap.end(up)).toBe(false);
    expect(tap.allowClick(1)).toBe(true);
    tap.begin(down, true);
    tap.end(up);
    expect(tap.allowClick(0)).toBe(true);
    expect(tap.begin({ ...down, pointerType: 'mouse' }, true)).toBe(false);
    expect(tap.end(up)).toBe(false);
    expect(tap.allowClick(1)).toBe(true);
  });
});
