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
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Feature } from 'geojson';
import type { BuildingModel, BuildingVisual } from './visual-types';
import type { CampusData } from './types';
import { createFacadeTextures } from './facade-textures';
import { buildingRevision } from './building-visuals';
import { detailRevision } from './building-facades';
import { buildingOutline } from './building-outline';
export function PhotoModelPreview(props: {
  feature: Feature;
  visual?: BuildingVisual;
  data: CampusData;
  wallId?: string;
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
  const [message, setMessage] = useState('Building preview…');
  const signature = JSON.stringify([
    buildingRevision(props.feature),
    detailRevision(props.feature),
    props.visual,
    props.wallId,
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
      model: BuildingModel | undefined,
      lastWall: string | undefined;
    let releases: (() => void)[] = [];
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const scene = new Scene(),
      group = new Group(),
      camera = new PerspectiveCamera(40, 1, 0.1, 5000);
    scene.background = new Color('#dfe6e9');
    scene.add(group);
    camera.up.set(0, 0, 1);
    const draw = () => {
      if (!disposed && renderer) {
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
    const textures = createFacadeTextures(draw);
    const clear = () => {
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
    const worker = new Worker(
      new URL('./building-preview.worker.ts', import.meta.url),
      { type: 'module' },
    );
    try {
      renderer = new WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      element.appendChild(renderer.domElement);
      renderer.domElement.setAttribute(
        'aria-label',
        'Building model. Use view buttons to rotate and zoom.',
      );
      scene.add(new AmbientLight('#ffffff', 1.6));
      const sun = new DirectionalLight('#ffffff', 1.8);
      sun.position.set(-60, -90, 130);
      scene.add(sun);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = false;
      controls.addEventListener('change', draw);
      observer = new ResizeObserver(() => {
        const width = element.clientWidth,
          height = element.clientHeight;
        if (!width || !height) return;
        renderer!.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        draw();
      });
      observer.observe(element);
      action.current = (a) => {
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
    }
    const send = () => {
      if (disposed) return;
      if (running) {
        pending = true;
        return;
      }
      running = true;
      pending = false;
      active = generation;
      const { feature, visual } = current.current;
      worker.postMessage({
        revision: active,
        features: [feature],
        visuals: visual ? [visual] : [],
      });
      deadline = setTimeout(() => {
        worker.terminate();
        setMessage(
          'Preview timed out. Reopen to retry; your draft is retained.',
        );
      }, 15000);
    };
    request.current = () => {
      generation++;
      send();
    };
    worker.onerror = () => {
      clearTimeout(deadline);
      setMessage('3D preview stopped. Reopen to retry.');
    };
    worker.onmessage = ({ data: reply }) => {
      clearTimeout(deadline);
      running = false;
      if (disposed) return;
      if (active !== generation) {
        send();
        return;
      }
      const result = reply.results[0];
      if (result.error) {
        setMessage(result.error);
        return;
      }
      const first = !model;
      model = result.model;
      const { data, wallId } = current.current;
      clear();
      let selectedCentre: Vector3 | undefined,
        selectedNormal: Vector3 | undefined;
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
        group.add(new Mesh(geometry, material));
        const surface = part.surfaces?.find(
          (s) => s.wallId === wallId && s.role === 'wall',
        );
        if (surface) {
          const i = part.indices[surface.start * 3];
          selectedNormal = new Vector3().fromBufferAttribute(
            geometry.getAttribute('normal'),
            i,
          );
          const vertices = new Set(
            part.indices.slice(
              surface.start * 3,
              (surface.start + surface.count) * 3,
            ),
          );
          selectedCentre = new Vector3();
          for (const vertex of vertices)
            selectedCentre.add(
              new Vector3().fromArray(part.positions, vertex * 3),
            );
          selectedCentre.divideScalar(vertices.size);
        }
        if (wallId) {
          const positions = buildingOutline(part, {
            buildingId: model!.id,
            wallId,
          });
          if (positions.length) {
            const outline = new BufferGeometry();
            outline.setAttribute(
              'position',
              new Float32BufferAttribute(positions, 3),
            );
            group.add(
              new LineSegments(
                outline,
                new LineBasicMaterial({ color: '#1764ed', depthTest: false }),
              ),
            );
          }
        }
        if (part.texture)
          releases.push(
            textures.acquire(part.texture, data, (t) => {
              material.map = t;
              material.color.set('#ffffff');
              material.needsUpdate = true;
            }),
          );
      }
      if (controls && (first || lastWall !== wallId)) {
        const box = new Box3().setFromObject(group),
          centre = box.getCenter(new Vector3()),
          size = box.getSize(new Vector3()).length();
        if (selectedCentre && selectedNormal) {
          selectedCentre.z = centre.z;
          controls.target.copy(selectedCentre);
          camera.position
            .copy(selectedCentre)
            .addScaledVector(selectedNormal, size * 1.7);
          camera.position.z += size * 0.2;
        } else {
          controls.target.copy(centre);
          camera.position
            .copy(centre)
            .add(new Vector3(size, -size, size * 0.7));
        }
        controls.update();
      }
      lastWall = wallId;
      setMessage('Estimated dimensions · selected wall outlined');
      draw();
      if (pending) send();
    };
    return () => {
      disposed = true;
      clearTimeout(deadline);
      worker.terminate();
      observer?.disconnect();
      controls?.dispose();
      clear();
      textures.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
      request.current = () => {};
      action.current = () => {};
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => request.current(), 120);
    return () => clearTimeout(timer);
  }, [signature]);
  return (
    <section className="photo-model-preview">
      <div ref={host} className="photo-model-canvas" />
      <output aria-live="polite">{message}</output>
      <div className="photo-model-view-buttons">
        {['left', 'right', 'in', 'out'].map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => action.current(a)}
            aria-label={`${a === 'in' || a === 'out' ? 'Zoom' : 'Rotate'} ${a}`}
          >
            {a === 'left' ? '↶' : a === 'right' ? '↷' : a === 'in' ? '+' : '−'}
          </button>
        ))}
      </div>
    </section>
  );
}
