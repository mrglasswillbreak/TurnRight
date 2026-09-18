// Touch activation must finish before keyboard dismissal can move the result.
// Keep the ordinary click path for mice, keyboards and assistive technology.
type PointerSample = {
  pointerId: number;
  clientX: number;
  clientY: number;
  timeStamp: number;
};

export class ResultTap {
  private start: PointerSample | null = null;
  private suppressClick = false;

  begin(
    event: PointerSample & {
      pointerType: string;
      isPrimary: boolean;
      button: number;
    },
    enabled: boolean,
  ) {
    if (!event.isPrimary) {
      this.cancel();
      return false;
    }
    this.start = null;
    this.suppressClick =
      enabled &&
      event.button === 0 &&
      (event.pointerType === 'touch' || event.pointerType === 'pen');
    if (!this.suppressClick) return false;
    this.start = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      timeStamp: event.timeStamp,
    };
    return true;
  }

  move(event: PointerSample) {
    if (
      this.start?.pointerId === event.pointerId &&
      Math.hypot(
        event.clientX - this.start.clientX,
        event.clientY - this.start.clientY,
      ) > 10
    )
      this.cancel();
  }

  end(event: PointerSample) {
    this.move(event);
    const start = this.start;
    if (!start || start.pointerId !== event.pointerId) return false;
    this.start = null;
    const duration = event.timeStamp - start.timeStamp;
    return duration >= 0 && duration <= 700;
  }

  cancel() {
    this.start = null;
  }

  allowClick(detail: number) {
    // Keyboard and screen-reader activation commonly have no pointer detail.
    return detail === 0 || !this.suppressClick;
  }
}
