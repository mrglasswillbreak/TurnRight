import type { Camera, Group, Scene, WebGLRenderer } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
export interface ModelPreviewScene {
  scene: Scene;
  group: Group;
  renderer: WebGLRenderer;
  controls: OrbitControls;
  camera: () => Camera;
  origin: () => number[] | undefined;
  draw: () => void;
  setGestureActive: (active: boolean) => void;
  alignMesh: (
    pose: {
      key: string;
      objectId: string;
      centre: [number, number, number];
      normal: [number, number, number];
      width: number;
    } | null,
  ) => void;
}
