import { useEffect, useRef, useState } from 'react';
import {
  AmbientLight,
  Box3,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  OrthographicCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  Raycaster,
  Vector2,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Feature } from 'geojson';
import type {
  BuildingModel,
  BuildingVisual,
  BuildingSelection,
  ModelMesh,
} from './visual-types';
import type { CampusData } from './types';
import { createFacadeTextures } from './facade-textures';
import { buildingRevision } from './building-visuals';
import { detailRevision } from './building-facades';
import { buildingOutline } from './building-outline';
import type { SurfaceFrame } from './model-surface';
import { surfaceCameraFrame, surfaceLocal } from './model-surface-frame';
import { ModelButton } from './ModelButton';
import { Focus, RotateCcw, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { modelPreviewGesture } from './model-preview-gesture';
export function PhotoModelPreview(props: {
  feature: Feature;
  visual?: BuildingVisual;
  data: CampusData;
  wallId?: string;
  selection?: BuildingSelection;
  onSelect?: (selection: BuildingSelection) => void;
  hidden?: string[];
  active?: boolean;
  surface?: SurfaceFrame | null;
  surfaceEditing?: boolean;
  onUnavailable?: () => void;
  onActions?: (x: number, y: number) => void;
  onMetrics?: (metrics: {
    drawMs: number;
    calls: number;
    triangles: number;
    textures: number;
    textureBytes: number;
  }) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    current = useRef(props);
  current.current = props;
  const request = useRef<() => void>(() => {}),
    action = useRef<(a: string) => void>(() => {});
  const syncSurface = useRef<() => void>(() => {});
  const syncSelection = useRef<() => void>(() => {});
  const retry = useRef<() => void>(() => {});
  const resume = useRef<() => void>(() => {});
  const cancelGesture = useRef<() => void>(() => {});
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('Building preview…');
  const signature = JSON.stringify([
    buildingRevision(props.feature),
    detailRevision(props.feature),
    props.visual,
  ]);
  useEffect(() => {
    const element = host.current!;
    let disposed = false,
      renderer: WebGLRenderer | undefined,
      controls: OrbitControls | undefined,
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
    let stableOrigin: number[] | undefined;
    const align = () => {
      const frame = current.current.surface;
      if (controls) controls.enabled = !current.current.surfaceEditing;
      if (
        !current.current.surfaceEditing ||
        !frame ||
        !stableOrigin ||
        !renderer
      ) {
        camera = orbitCamera;
        element.dataset.projection = 'orbit';
        return;
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
    const clearHighlights = () => {
      for (const o of highlights.children.slice()) {
        highlights.remove(o);
        if (o instanceof LineSegments) {
          o.geometry.dispose();
          (o.material as LineBasicMaterial).dispose();
        }
      }
    };
    syncSelection.current = () => {
      clearHighlights();
      const {
        selection,
        wallId,
        hidden = [],
        surfaceEditing,
        surface: frame,
      } = current.current;
      if (!model) return;
      for (const mesh of group.children) {
        if (!(mesh instanceof Mesh)) continue;
        const part = mesh.userData.part as ModelMesh;
        if (
          mesh.userData.filterKey !==
          JSON.stringify([hidden, surfaceEditing, frame?.kind, frame?.key])
        ) {
          const triangles: number[] = [],
            excluded = new Set(hidden);
          let surface = 0;
          for (let t = 0; t < part.indices.length / 3; t++) {
            while (
              part.surfaces?.[surface] &&
              t >= part.surfaces[surface].start + part.surfaces[surface].count
            )
              surface++;
            const s = part.surfaces?.[surface];
            const inSurface =
              !surfaceEditing ||
              !frame ||
              frame.kind === 'footprint' ||
              (frame.kind === 'wall'
                ? s?.wallId === frame.key
                : s?.partId === frame.key);
            if (inSurface && (!s?.elementId || !excluded.has(s.elementId)))
              triangles.push(t);
          }
          mesh.geometry.setIndex(
            triangles.flatMap((t) => part.indices.slice(t * 3, t * 3 + 3)),
          );
          mesh.userData.filterKey = JSON.stringify([
            hidden,
            surfaceEditing,
            frame?.kind,
            frame?.key,
          ]);
          mesh.userData.triangles = triangles;
        }
        const material = mesh.material as MeshLambertMaterial;
        material.transparent =
          !!part.text || (!!surfaceEditing && frame?.kind === 'footprint');
        material.opacity =
          surfaceEditing && frame?.kind === 'footprint' ? 0.22 : 1;
        material.depthWrite = !material.transparent;
        const selected = selection || { buildingId: model.id, wallId };
        if (!selected.wallId && !selected.elementId && !selected.partId)
          continue;
        const positions = buildingOutline(part, selected);
        if (positions.length) {
          const geometry = new BufferGeometry();
          geometry.setAttribute(
            'position',
            new Float32BufferAttribute(positions, 3),
          );
          highlights.add(
            new LineSegments(
              geometry,
              new LineBasicMaterial({ color: '#168aff', depthTest: false }),
            ),
          );
        }
      }
      draw();
    };
    const clear = () => {
      clearHighlights();
      for (const release of releases) release();
      releases = [];
      for (const o of group.children.slice()) {
        group.remove(o);
        if (o instanceof Mesh || o instanceof LineSegments) {
          o.geometry.dispose();
          (o.material as MeshLambertMaterial).dispose();
        }
      }
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
      for (const part of model!.meshes) {
        const geometry = new BufferGeometry();
        geometry.setAttribute(
          'position',
          new Float32BufferAttribute(part.positions, 3),
        );
        geometry.setIndex(part.indices);
        geometry.computeVertexNormals();
        if (part.uvs)
          geometry.setAttribute('uv', new Float32BufferAttribute(part.uvs, 2));
        const material = new MeshLambertMaterial({
          color: part.colour,
          side: DoubleSide,
        });
        const rendered = new Mesh(geometry, material);
        rendered.userData.part = part;
        group.add(rendered);
        if (part.texture || part.text)
          releases.push(
            textures.acquire((part.texture || part.text)!, data, (t) => {
              material.map = t;
              material.transparent = !!part.text;
              material.alphaTest = part.text ? 0.03 : 0;
              material.color.set('#ffffff');
              material.needsUpdate = true;
            }),
          );
      }
      if (controls && first) action.current('reset');
      syncSelection.current();
      setMessage('Estimated dimensions · selected wall outlined');
      draw();
      if (pending) send();
    };
    return () => {
      disposed = true;
      cancelGesture.current();
      gestureEvents.abort();
      cancelGesture.current = () => {};
      clearTimeout(deadline);
      worker.terminate();
      observer?.disconnect();
      cancelAnimationFrame(resizeFrame);
      themeObserver.disconnect();
      controls?.dispose();
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
  }, []);
  useEffect(() => {
    cancelGesture.current();
    request.current();
  }, [signature]);
  const surfaceKey = JSON.stringify([props.surface, props.surfaceEditing]);
  useEffect(() => syncSurface.current(), [surfaceKey]);
  const selectionKey = JSON.stringify([
    props.selection,
    props.wallId,
    props.hidden,
  ]);
  useEffect(() => syncSelection.current(), [selectionKey]);
  useEffect(() => {
    if (props.active !== false) resume.current();
    else cancelGesture.current();
  }, [props.active]);
  return (
    <section className="photo-model-preview">
      <div ref={host} className="photo-model-canvas" />
      <output aria-live="polite">{message}</output>
      {failed && (
        <button onClick={() => retry.current()}>Retry model preview</button>
      )}
      {!props.surfaceEditing && (
        <div className="photo-model-view-buttons">
          <ModelButton icon={<Focus />} onClick={() => action.current('fit')}>
            Fit selection
          </ModelButton>
          <ModelButton
            icon={<RotateCcw />}
            onClick={() => action.current('reset')}
          >
            Reset view
          </ModelButton>
          {(
            [
              ['left', RotateCcw],
              ['right', RotateCw],
              ['in', ZoomIn],
              ['out', ZoomOut],
            ] as const
          ).map(([a, Icon]) => (
            <ModelButton
              key={a}
              icon={<Icon />}
              title={`${a === 'in' || a === 'out' ? 'Zoom' : 'Rotate'} ${a}`}
              aria-label={`${a === 'in' || a === 'out' ? 'Zoom' : 'Rotate'} ${a}`}
              onClick={() => action.current(a)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
