import { type wallMetrics } from './model-authoring';
export type Metrics = ReturnType<typeof wallMetrics>;

export type WallView = { x: number; y: number; width: number; height: number };
