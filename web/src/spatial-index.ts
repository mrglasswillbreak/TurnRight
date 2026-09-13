import type { Position } from './types.js';

export type Bounds = [number, number, number, number];
export function boundsOf(points: number[][]): Bounds {
  const bounds: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) {
    bounds[0] = Math.min(bounds[0], x);
    bounds[1] = Math.min(bounds[1], y);
    bounds[2] = Math.max(bounds[2], x);
    bounds[3] = Math.max(bounds[3], y);
  }
  return bounds;
}
export function nearbyBounds(point: Position, metres: number): Bounds {
  const y = metres / 111000;
  const x = y / Math.cos((point[1] * Math.PI) / 180);
  return [point[0] - x, point[1] - y, point[0] + x, point[1] + y];
}
export function overlaps(a: Bounds, b: Bounds) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/** Campus-scale grid. Query order matches input order for deterministic snapping. */
export class BoundsIndex<T> {
  private cells = new Map<string, number[]>();
  private entries: { bounds: Bounds; value: T }[] = [];
  constructor(private cellSize = 0.001) {}
  private keys(bounds: Bounds) {
    const result: string[] = [];
    if (!bounds.every(Number.isFinite)) return result;
    for (
      let x = Math.floor(bounds[0] / this.cellSize);
      x <= Math.floor(bounds[2] / this.cellSize);
      x++
    )
      for (
        let y = Math.floor(bounds[1] / this.cellSize);
        y <= Math.floor(bounds[3] / this.cellSize);
        y++
      )
        result.push(`${x}:${y}`);
    return result;
  }
  add(bounds: Bounds, value: T) {
    const id = this.entries.push({ bounds, value }) - 1;
    for (const key of this.keys(bounds)) {
      const cell = this.cells.get(key) || [];
      cell.push(id);
      this.cells.set(key, cell);
    }
  }
  query(bounds: Bounds): T[] {
    const ids = new Set<number>();
    for (const key of this.keys(bounds))
      for (const id of this.cells.get(key) || []) ids.add(id);
    return [...ids]
      .sort((a, b) => a - b)
      .filter((id) => overlaps(this.entries[id].bounds, bounds))
      .map((id) => this.entries[id].value);
  }
}
