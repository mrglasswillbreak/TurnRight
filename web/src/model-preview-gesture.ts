type Pointer = Pick<
  PointerEvent,
  'pointerId' | 'pointerType' | 'button' | 'clientX' | 'clientY'
>;

/** Picking stays separate from orbiting. Holding a detail never edits geometry. */
export function modelPreviewGesture(options: {
  pick: (
    x: number,
    y: number,
    actions: boolean,
    detailOnly: boolean,
  ) => boolean;
  holding: (value: boolean) => void;
}) {
  let down: (Pointer & { moved: boolean; held: boolean }) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let suppressMouse = false;
  const pointers = new Set<number>();
  const stopTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const reset = () => {
    stopTimer();
    down = undefined;
    pointers.clear();
    suppressMouse = false;
    options.holding(false);
  };
  return {
    down(e: Pointer) {
      suppressMouse = false;
      pointers.add(e.pointerId);
      stopTimer();
      if (pointers.size !== 1) {
        if (down) down.moved = true;
        options.holding(false);
        return;
      }
      down = {
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        button: e.button,
        clientX: e.clientX,
        clientY: e.clientY,
        moved: false,
        held: false,
      };
      if (
        e.button === 0 &&
        (e.pointerType === 'touch' || e.pointerType === 'pen')
      ) {
        const start = down;
        timer = setTimeout(() => {
          timer = undefined;
          if (down !== start || start.moved || pointers.size !== 1) return;
          if (options.pick(start.clientX, start.clientY, true, true)) {
            start.held = true;
            suppressMouse = true;
            options.holding(true);
          }
        }, 550);
      }
    },
    move(e: Pointer) {
      if (
        down?.pointerId === e.pointerId &&
        Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) > 5
      ) {
        down.moved = true;
        stopTimer();
      }
    },
    up(e: Pointer) {
      pointers.delete(e.pointerId);
      const tap = down;
      down = undefined;
      stopTimer();
      options.holding(false);
      if (
        !tap ||
        tap.pointerId !== e.pointerId ||
        tap.moved ||
        tap.held ||
        pointers.size ||
        Math.hypot(e.clientX - tap.clientX, e.clientY - tap.clientY) > 5
      )
        return;
      options.pick(e.clientX, e.clientY, e.button === 2, false);
    },
    cancel(e: Pointer) {
      pointers.delete(e.pointerId);
      down = undefined;
      stopTimer();
      options.holding(false);
    },
    reset,
    // Touch release may synthesize mouse events after the menu has opened.
    // Consume those on this canvas only; the next pointer press behaves normally.
    suppressCompatibilityMouse() {
      return suppressMouse;
    },
  };
}
