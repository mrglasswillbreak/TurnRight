import type { RefObject } from 'react';
import {
  PerspectiveCamera,
  OrthographicCamera,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { surfaceCameraFrame } from './model-surface-frame';
import type { ModelPreviewScene } from './model-preview-scene';
import { type PhotoPreviewProps } from './photo-preview-types.js';
export function alignPreviewCamera({
  current,
  controls,
  alignedControls,
  meshPose,
  renderer,
  meshPoseKey,
  meshGesture,
  camera,
  alignedCamera,
  element,
  stableOrigin,
  orbitCamera,
}: {
  current: RefObject<PhotoPreviewProps>;
  controls: OrbitControls | undefined;
  alignedControls: OrbitControls | undefined;
  meshPose: Parameters<ModelPreviewScene['alignMesh']>[0];
  renderer: WebGLRenderer | undefined;
  meshPoseKey: string;
  meshGesture: boolean;
  camera: PerspectiveCamera | OrthographicCamera;
  alignedCamera: OrthographicCamera;
  element: HTMLDivElement;
  stableOrigin: number[] | undefined;
  orbitCamera: PerspectiveCamera;
}): { camera: PerspectiveCamera | OrthographicCamera; meshPoseKey: string } {
  const frame = current.current.surface;
  if (controls)
    controls.enabled =
      !current.current.surfaceEditing && !meshPose && !meshGesture;
  if (alignedControls) alignedControls.enabled = !!meshPose && !meshGesture;
  if (meshPose && renderer) {
    camera = alignedCamera;
    if (meshPoseKey !== meshPose.key) {
      meshPoseKey = meshPose.key;
      const normal = new Vector3(...meshPose.normal).normalize(),
        centre = new Vector3(...meshPose.centre);
      camera.up.set(0, 0, 1);
      if (Math.abs(normal.z) > 0.95) camera.up.set(0, 1, 0);
      camera.position.copy(centre).addScaledVector(normal, 4000);
      camera.lookAt(centre);
      camera.zoom = 1;
      alignedControls?.target.copy(centre);
    }
    const width = meshPose.width,
      ratio = Math.max(
        0.1,
        element.clientWidth / Math.max(1, element.clientHeight),
      );
    camera.left = -width / 2;
    camera.right = width / 2;
    camera.top = width / ratio / 2;
    camera.bottom = -width / ratio / 2;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    element.dataset.projection = 'mesh';
    return { camera, meshPoseKey };
  }
  meshPoseKey = '';
  if (!current.current.surfaceEditing || !frame || !stableOrigin || !renderer) {
    camera = orbitCamera;
    element.dataset.projection = 'orbit';
    return { camera, meshPoseKey };
  }
  camera = alignedCamera;
  const pose = surfaceCameraFrame(
    frame,
    stableOrigin,
    renderer.domElement.getBoundingClientRect(),
  );
  const centre = new Vector3(...pose.centre),
    right = new Vector3(...pose.right).normalize(),
    up = new Vector3(...pose.up).normalize();
  const normal = right.clone().cross(up).normalize();
  camera.left = -pose.width / 2;
  camera.right = pose.width / 2;
  camera.top = pose.height / 2;
  camera.bottom = -pose.height / 2;
  camera.up.copy(up);
  camera.position.copy(centre).addScaledVector(normal, 4000);
  camera.lookAt(centre);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  element.dataset.projection = frame.kind;
  return { camera, meshPoseKey };
}
