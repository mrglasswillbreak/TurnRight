import { afterEach, describe, expect, it, vi } from 'vitest';
import { modelPreviewGesture } from '../src/model-preview-gesture';

const point = (changes = {}) => ({
  pointerId: 1,
  pointerType: 'touch',
  button: 0,
  clientX: 50,
  clientY: 60,
  ...changes,
});
function setup(hit = true) {
  vi.useFakeTimers();
  const pick = vi.fn(() => hit),
    holding = vi.fn();
  return { gesture: modelPreviewGesture({ pick, holding }), pick, holding };
}
afterEach(() => vi.useRealTimers());
describe('3D detail long press', () => {
  it('opens actions once while held and suppresses the release tap', () => {
    const { gesture, pick, holding } = setup();
    gesture.down(point());
    vi.advanceTimersByTime(549);
    expect(pick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(pick).toHaveBeenCalledWith(50, 60, true, true);
    expect(holding).toHaveBeenLastCalledWith(true);
    gesture.up(point());
    expect(gesture.suppressCompatibilityMouse()).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(pick).toHaveBeenCalledTimes(1);
    expect(holding).toHaveBeenLastCalledWith(false);
    gesture.down(point());
    expect(gesture.suppressCompatibilityMouse()).toBe(false);
  });
  it('retains ordinary taps, mouse clicks and right click actions', () => {
    const { gesture, pick } = setup();
    gesture.down(point());
    gesture.up(point());
    expect(pick).toHaveBeenLastCalledWith(50, 60, false, false);
    for (const button of [0, 2]) {
      const e = point({ pointerType: 'mouse', button });
      gesture.down(e);
      vi.advanceTimersByTime(1000);
      expect(pick).toHaveBeenCalledTimes(button === 0 ? 1 : 2);
      gesture.up(e);
      expect(pick).toHaveBeenLastCalledWith(50, 60, button === 2, false);
    }
  });
  it('supports pen input without selecting walls through hidden details', () => {
    const { gesture, pick, holding } = setup(false);
    gesture.down(point({ pointerType: 'pen' }));
    vi.advanceTimersByTime(550);
    expect(pick).toHaveBeenCalledWith(50, 60, true, true);
    expect(holding).not.toHaveBeenCalledWith(true);
    gesture.up(point());
    expect(pick).toHaveBeenLastCalledWith(50, 60, false, false);
  });
  it.each(['move', 'pinch', 'cancel', 'reset'])(
    'cancels on %s without a delayed action or tap',
    (reason) => {
      const { gesture, pick } = setup();
      gesture.down(point());
      if (reason === 'move') gesture.move(point({ clientX: 56 }));
      if (reason === 'pinch') gesture.down(point({ pointerId: 2 }));
      if (reason === 'cancel') gesture.cancel(point());
      if (reason === 'reset') gesture.reset();
      vi.advanceTimersByTime(1000);
      gesture.up(point());
      if (reason === 'pinch') gesture.up(point({ pointerId: 2 }));
      expect(pick).not.toHaveBeenCalled();
    },
  );
  it('releases orbit controls when an active hold is interrupted', () => {
    const { gesture, holding } = setup();
    gesture.down(point());
    vi.advanceTimersByTime(550);
    gesture.cancel(point());
    expect(holding).toHaveBeenLastCalledWith(false);
    gesture.down(point());
    vi.advanceTimersByTime(550);
    gesture.reset();
    expect(holding).toHaveBeenLastCalledWith(false);
  });
});
