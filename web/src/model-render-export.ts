import {
  AmbientLight,
  Box3,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  Mesh,
  OrthographicCamera,
  PCFSoftShadowMap,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { ModelDocument } from './model-document';
import type { ModelMesh } from './visual-types';
import { compileModelDocument } from './model-document-compiler';
import { createModelRenderMaterial } from './model-render-material';
import { modelEnvironment } from './model-environment';

export type ModelRenderView =
  | 'north'
  | 'east'
  | 'south'
  | 'west'
  | 'roof'
  | 'oblique-ne'
  | 'oblique-sw';
export const MODEL_RENDER_VIEWS: ModelRenderView[] = [
  'north',
  'east',
  'south',
  'west',
  'roof',
  'oblique-ne',
  'oblique-sw',
];

/** Deterministic high-resolution views use the same geometry and PBR materials as the map. */
export async function createModelRenderExport(
  document: ModelDocument,
  native: ModelMesh[] = [],
  size = 2400,
) {
  if (!Number.isInteger(size) || size < 256 || size > 4096)
    throw new Error('Choose an export size between 256 and 4096 pixels.');
  const renderer = new WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size * 0.75);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  const scene = new Scene(),
    root = new Group();
  scene.background = new Color('#f4f3ef');
  scene.add(root);
  const releaseEnvironment = modelEnvironment(renderer, scene);
  scene.add(new AmbientLight('#ffffff', 0.65));
  const sun = new DirectionalLight('#ffffff', 2.2);
  sun.position.set(-50, -80, 120);
  scene.add(sun);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.00005;
  sun.shadow.normalBias = 0.02;
  const ground = new Mesh(
    new PlaneGeometry(1, 1),
    new ShadowMaterial({ opacity: 0.18 }),
  );
  ground.receiveShadow = true;
  scene.add(ground);
  const resources: ReturnType<typeof createModelRenderMaterial>[] = [];
  const dispose = () => {
    root.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    for (const r of resources) {
      r.release();
      r.material.dispose();
    }
    releaseEnvironment();
    ground.geometry.dispose();
    ground.material.dispose();
    sun.shadow.map?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };
  try {
    for (const part of [
      ...native,
      ...compileModelDocument(document, document.origin),
    ]) {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        'position',
        new Float32BufferAttribute(part.positions, 3),
      );
      geometry.setIndex(part.indices);
      if (part.normals)
        geometry.setAttribute(
          'normal',
          new Float32BufferAttribute(part.normals, 3),
        );
      else geometry.computeVertexNormals();
      if (part.uvs)
        geometry.setAttribute('uv', new Float32BufferAttribute(part.uvs, 2));
      const resource = createModelRenderMaterial(
        part.material || {
          id: 'plain',
          name: 'Surface',
          colour: part.colour,
          roughness: 0.8,
          metalness: 0,
          opacity: 1,
          doubleSided: false,
        },
        () => {},
      );
      resources.push(resource);
      const mesh = new Mesh(geometry, resource.material);
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
    }
    if (!(await Promise.all(resources.map((r) => r.ready))).every(Boolean))
      throw new Error('A model texture could not be verified or decoded.');
    const box = new Box3().setFromObject(root),
      center = box.getCenter(new Vector3()),
      extent = box.getSize(new Vector3());
    if (box.isEmpty())
      throw new Error('The model contains no visible geometry.');
    const radius = extent.length() / 2;
    ground.position.set(center.x, center.y, box.min.z - 0.04);
    ground.scale.set(radius * 8, radius * 8, 1);
    sun.position
      .copy(center)
      .add(new Vector3(-radius, -radius * 1.5, radius * 3));
    sun.target.position.copy(center);
    scene.add(sun.target);
    Object.assign(sun.shadow.camera, {
      left: -radius * 1.5,
      right: radius * 1.5,
      top: radius * 1.5,
      bottom: -radius * 1.5,
      near: 0.1,
      far: radius * 8,
    });
    sun.shadow.camera.updateProjectionMatrix();
    return {
      dispose,
      async render(
        view: ModelRenderView,
        direction?: [number, number, number],
      ): Promise<Blob> {
        const directions: Record<ModelRenderView, number[]> = {
          north: [0, 1, 0],
          east: [1, 0, 0],
          south: [0, -1, 0],
          west: [-1, 0, 0],
          roof: [0, 0, 1],
          'oblique-ne': [1, 1, 0.75],
          'oblique-sw': [-1, -1, 0.75],
        };
        if (!directions[view]) throw new Error('Unknown render view.');
        const camera = new OrthographicCamera(
          -radius * 1.35,
          radius * 1.35,
          radius * 1.0125,
          -radius * 1.0125,
          0.1,
          radius * 8 + 1,
        );
        camera.up.set(
          ...((view === 'roof' ? [0, 1, 0] : [0, 0, 1]) as [
            number,
            number,
            number,
          ]),
        );
        camera.position
          .copy(center)
          .add(
            new Vector3(
              ...(direction || (directions[view] as [number, number, number])),
            )
              .normalize()
              .multiplyScalar(radius * 4 + 1),
          );
        camera.lookAt(center);
        camera.updateMatrixWorld(true);
        const projected = new Box3();
        for (const x of [box.min.x, box.max.x])
          for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z])
              projected.expandByPoint(
                new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse),
              );
        const dimensions = projected.getSize(new Vector3()),
          half = Math.max(dimensions.y, dimensions.x * 0.75) * 0.56;
        camera.top = half;
        camera.bottom = -half;
        camera.left = -half / 0.75;
        camera.right = half / 0.75;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        return await new Promise<Blob>((resolve, reject) =>
          renderer.domElement.toBlob(
            (blob) =>
              blob
                ? resolve(blob)
                : reject(new Error('Render encoding failed.')),
            'image/png',
          ),
        );
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
