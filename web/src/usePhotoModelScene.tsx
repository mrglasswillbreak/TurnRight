import type { RefObject, Dispatch, SetStateAction } from 'react';
import { useEffect, useEffectEvent } from 'react';
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  PerspectiveCamera,
  OrthographicCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  Raycaster,
  Vector2,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { BuildingModel, ModelMesh } from './visual-types';
import { createFacadeTextures } from './facade-textures';
import { surfaceLocal } from './model-surface-frame';
import { modelPreviewGesture } from './model-preview-gesture';
import type { ModelPreviewScene } from './model-preview-scene';
import { type PhotoPreviewProps } from './photo-preview-types.js';
import { alignPreviewCamera } from './photo-preview-camera.js';
import {
  updatePreviewSelection,
  clearPreviewHighlights,
  clearPreviewMeshes,
  fillPreviewMeshes,
} from './photo-preview-meshes.js';
export function usePhotoModelScene({
  host,
  current,
  request,
  action,
  syncSurface,
  syncSelection,
  retry,
  resume,
  cancelGesture,
  setFailed,
  setMessage,
}: {
  host: RefObject<HTMLDivElement | null>;
  current: RefObject<PhotoPreviewProps>;
  request: RefObject<() => void>;
  action: RefObject<(action: string) => void>;
  syncSurface: RefObject<() => void>;
  syncSelection: RefObject<() => void>;
  retry: RefObject<() => void>;
  resume: RefObject<() => void>;
  cancelGesture: RefObject<() => void>;
  setFailed: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<string>>;
}): void {
  const notifySceneClosed = useEffectEvent(() =>
    current.current.onScene?.(null),
  );
  useEffect(() => {
    const element = host.current!;
    let disposed = false,
      renderer: WebGLRenderer | undefined,
      controls: OrbitControls | undefined,
      alignedControls: OrbitControls | undefined,
      observer: ResizeObserver | undefined;
    let running = false,
      pending = false,
      generation = 0,
      active = 0,
      resizeFrame = 0,
      model: BuildingModel | undefined;
    let releases: (() => void)[] = [];
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const gestureEvents = new AbortController();
    const scene = new Scene(),
      group = new Group(),
      highlights = new Group(),
      orbitCamera = new PerspectiveCamera(40, 1, 0.1, 5000),
      alignedCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
    let camera: PerspectiveCamera | OrthographicCamera = orbitCamera;
    let meshPose: Parameters<ModelPreviewScene['alignMesh']>[0] = null,
      meshPoseKey = '',
      meshGesture = false;
    let stableOrigin: number[] | undefined;
    const align = () => {
      ({ camera, meshPoseKey } = alignPreviewCamera({
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
      }));
    };
    scene.background = new Color('#dfe6e9');
    scene.add(group);
    scene.add(highlights);
    camera.up.set(0, 0, 1);
    const draw = () => {
      if (!disposed && renderer && current.current.active !== false) {
        align();
        element.dataset.camera = JSON.stringify(orbitCamera.position.toArray());
        scene.background = new Color(
          document.documentElement.classList.contains('dark')
            ? '#202b32'
            : '#dfe6e9',
        );
        const start = performance.now();
        renderer.render(scene, camera);
        current.current.onMetrics?.({
          drawMs: performance.now() - start,
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          textures: renderer.info.memory.textures,
          textureBytes: textures.stats().bytes,
        });
      }
    };
    syncSurface.current = () => {
      syncSelection.current();
      draw();
    };
    const textures = createFacadeTextures(draw);
    const themeObserver = new MutationObserver(draw);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    const clearHighlights = () => clearPreviewHighlights(highlights);
    syncSelection.current = () =>
      updatePreviewSelection({
        current,
        clearHighlights,
        model,
        group,
        meshPose,
        highlights,
        draw,
      });
    const clear = () => {
      clearHighlights();
      for (const release of releases) release();
      releases = [];
      clearPreviewMeshes(group);
    };
    let dead = false;
    let worker = new Worker(
      new URL('./building-preview.worker.ts', import.meta.url),
      { type: 'module' },
    );
    try {
      renderer = new WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      element.appendChild(renderer.domElement);
      renderer.domElement.setAttribute(
        'aria-label',
        'Building model. Tap a detail to select; touch and hold for actions. Drag to orbit or use view buttons.',
      );
      scene.add(new AmbientLight('#ffffff', 1.6));
      const sun = new DirectionalLight('#ffffff', 1.8);
      sun.position.set(-60, -90, 130);
      scene.add(sun);
      controls = new OrbitControls(orbitCamera, renderer.domElement);
      controls.enableDamping = false;
      alignedControls = new OrbitControls(alignedCamera, renderer.domElement);
      alignedControls.enableRotate = false;
      alignedControls.enableDamping = false;
      alignedControls.enabled = false;
      alignedControls.addEventListener('change', draw);
      const raycaster = new Raycaster();
      renderer.domElement.addEventListener('contextmenu', (e) =>
        e.preventDefault(),
      );
      const pick = (
        x: number,
        y: number,
        actions: boolean,
        detailOnly: boolean,
      ) => {
        if (
          !model ||
          disposed ||
          current.current.active === false ||
          current.current.meshEditing ||
          current.current.surfaceEditing ||
          (detailOnly && !current.current.onActions)
        )
          return false;
        const bounds = renderer!.domElement.getBoundingClientRect();
        raycaster.setFromCamera(
          new Vector2(
            ((x - bounds.left) / bounds.width) * 2 - 1,
            1 - ((y - bounds.top) / bounds.height) * 2,
          ),
          camera,
        );
        for (const hit of raycaster.intersectObjects(group.children, false)) {
          const part = hit.object.userData.part as ModelMesh,
            triangle =
              hit.object.userData.triangles?.[hit.faceIndex!] ?? hit.faceIndex;
          const s = part?.surfaces?.find(
            (s) => triangle >= s.start && triangle < s.start + s.count,
          );
          if (s) {
            // Do not pick through a wall to a detail on a hidden elevation.
            if (detailOnly && !s.elementId) return false;
            current.current.onSelect?.({
              buildingId: model.id,
              partId: s.partId,
              wallId: s.wallId,
              role: s.role,
              elementId: s.elementId,
              instanceIndex: s.instanceIndex,
              objectId: s.objectId,
              faceId: s.faceId,
              roofTriangle:
                s.role === 'roof' && !s.elementId
                  ? triangle - s.start
                  : undefined,
            });
            if (actions) current.current.onActions?.(x, y);
            return true;
          }
        }
        return false;
      };
      const gesture = modelPreviewGesture({
        pick,
        holding: (held) => {
          if (controls)
            controls.enabled = !held && !current.current.surfaceEditing;
        },
      });
      cancelGesture.current = gesture.reset;
      const gestureOptions = { signal: gestureEvents.signal };
      for (const name of ['mousedown', 'mouseup', 'click'])
        renderer.domElement.addEventListener(
          name,
          (e) => {
            if (gesture.suppressCompatibilityMouse()) {
              e.preventDefault();
              e.stopImmediatePropagation();
            }
          },
          { ...gestureOptions, capture: true },
        );
      renderer.domElement.addEventListener(
        'pointerdown',
        gesture.down,
        gestureOptions,
      );
      renderer.domElement.addEventListener(
        'pointermove',
        gesture.move,
        gestureOptions,
      );
      renderer.domElement.addEventListener(
        'pointerup',
        gesture.up,
        gestureOptions,
      );
      renderer.domElement.addEventListener(
        'pointercancel',
        gesture.cancel,
        gestureOptions,
      );
      renderer.domElement.addEventListener(
        'lostpointercapture',
        gesture.cancel,
        gestureOptions,
      );
      window.addEventListener('blur', gesture.reset, gestureOptions);
      document.addEventListener(
        'visibilitychange',
        gesture.reset,
        gestureOptions,
      );
      controls.addEventListener('change', draw);
      current.current.onScene?.({
        scene,
        group,
        renderer,
        controls,
        camera: () => camera,
        origin: () => stableOrigin,
        draw,
        setGestureActive: (active) => {
          meshGesture = active;
          align();
        },
        alignMesh: (pose) => {
          const changed = meshPose?.key !== pose?.key;
          meshPose = pose;
          if (changed) syncSelection.current();
          draw();
        },
      });
      observer = new ResizeObserver(() => {
        // Canvas sizing can itself affect layout. Commit in the next frame so
        // docking/rotation does not write layout inside observer delivery.
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          const width = element.clientWidth,
            height = element.clientHeight;
          if (!width || !height || disposed) return;
          renderer!.setSize(width, height);
          orbitCamera.aspect = width / height;
          orbitCamera.updateProjectionMatrix();
          draw();
        });
      });
      observer.observe(element);
      action.current = (a) => {
        if (a === 'reset' || a === 'fit') {
          const box = new Box3().setFromObject(
              a === 'fit' && highlights.children.length ? highlights : group,
            ),
            centre = box.getCenter(new Vector3()),
            size = Math.max(2, box.getSize(new Vector3()).length());
          controls!.target.copy(centre);
          camera.position
            .copy(centre)
            .add(new Vector3(size, -size, size * 0.7));
          controls!.update();
          draw();
          return;
        }
        const offset = camera.position.clone().sub(controls!.target);
        if (a === 'left' || a === 'right')
          offset.applyAxisAngle(
            new Vector3(0, 0, 1),
            a === 'left' ? 0.3 : -0.3,
          );
        else offset.multiplyScalar(a === 'in' ? 0.8 : 1.25);
        camera.position.copy(controls!.target).add(offset);
        controls!.update();
        draw();
      };
    } catch {
      setMessage(
        '3D preview unavailable on this device. Your draft is retained.',
      );
      current.current.onUnavailable?.();
    }
    const send = () => {
      if (disposed) return;
      if (current.current.active === false) {
        pending = true;
        return;
      }
      if (dead) {
        const message = worker.onmessage;
        worker.terminate();
        worker = new Worker(
          new URL('./building-preview.worker.ts', import.meta.url),
          { type: 'module' },
        );
        worker.onmessage = message;
        worker.onerror = () =>
          fail('3D preview stopped. Your draft is retained.');
        dead = false;
        running = false;
      }
      if (running) {
        pending = true;
        return;
      }
      running = true;
      pending = false;
      active = generation;
      const { feature, visual } = current.current;
      setFailed(false);
      try {
        worker.postMessage({
          revision: active,
          features: [feature],
          visuals: visual ? [visual] : [],
        });
      } catch {
        fail('3D preview could not start. Your draft is retained.');
        return;
      }
      deadline = setTimeout(() => {
        fail('Preview timed out. Your draft is retained.');
      }, 15000);
    };
    const fail = (message: string) => {
      if (disposed) return;
      clearTimeout(deadline);
      worker.terminate();
      dead = true;
      running = false;
      setFailed(true);
      setMessage(message);
    };
    request.current = () => {
      generation++;
      send();
    };
    retry.current = () => request.current();
    resume.current = () => {
      if (pending) send();
      else draw();
    };
    worker.onerror = () => fail('3D preview stopped. Your draft is retained.');
    worker.onmessage = ({ data: reply }) => {
      if (reply?.revision !== active) return;
      clearTimeout(deadline);
      running = false;
      if (disposed) return;
      if (active !== generation) {
        send();
        return;
      }
      const result = reply?.results?.[0];
      if (!result || (!result.error && !result.model?.meshes)) {
        fail('Invalid model preview response. Your draft is retained.');
        return;
      }
      if (result.error) {
        setMessage(result.error);
        return;
      }
      const first = !model;
      model = result.model;
      stableOrigin ||= model!.origin;
      group.position.fromArray(
        surfaceLocal([...model!.origin, 0], stableOrigin),
      );
      highlights.position.copy(group.position);
      const { data } = current.current;
      clear();
      fillPreviewMeshes({
        model: model!,
        group,
        releases,
        draw,
        textures,
        data,
      });
      if (controls && first) action.current('reset');
      syncSelection.current();
      setMessage('Estimated dimensions · selected wall outlined');
      draw();
      if (pending) send();
    };
    return () => {
      disposed = true;
      notifySceneClosed();
      cancelGesture.current();
      gestureEvents.abort();
      cancelGesture.current = () => {};
      clearTimeout(deadline);
      worker.terminate();
      observer?.disconnect();
      cancelAnimationFrame(resizeFrame);
      themeObserver.disconnect();
      controls?.dispose();
      alignedControls?.dispose();
      clear();
      textures.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
      request.current = () => {};
      action.current = () => {};
      syncSelection.current = () => {};
      syncSurface.current = () => {};
      retry.current = () => {};
      resume.current = () => {};
    };
  }, [
    host,
    current,
    request,
    action,
    syncSurface,
    syncSelection,
    retry,
    resume,
    cancelGesture,
    setFailed,
    setMessage,
  ]);
}
