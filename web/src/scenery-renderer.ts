import {
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from 'three';
import { MercatorCoordinate } from 'maplibre-gl';
import type { CampusData } from './types';
import { generateScenery } from './campus-scenery';

/** Shared geometries/materials. No textures, extra context, dynamic shadows or route objects. */
export function createScenery(
  data: CampusData,
  origin: MercatorCoordinate,
  scale: number,
) {
  const items = generateScenery(data),
    group = new Group();
  const crownGeometry = new SphereGeometry(1, 7, 5),
    trunkGeometry = new CylinderGeometry(0.12, 0.19, 1, 5);
  crownGeometry.rotateX(Math.PI / 2);
  trunkGeometry.rotateX(Math.PI / 2);
  const leafMaterial = new MeshLambertMaterial({ color: '#ffffff' }),
    trunkMaterial = new MeshLambertMaterial({ color: '#75624b' });
  const shadowMaterial = new MeshBasicMaterial({
    color: '#172c22',
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
  });
  const shadowGeometry = new CircleGeometry(1, 14);
  const crowns = new InstancedMesh(crownGeometry, leafMaterial, items.length),
    trunks = new InstancedMesh(trunkGeometry, trunkMaterial, items.length);
  const shade = new InstancedMesh(
    shadowGeometry,
    shadowMaterial,
    items.length * 3,
  );
  const transform = new Object3D(),
    colour = new Color();
  items.forEach((tree, i) => {
    const at = MercatorCoordinate.fromLngLat(tree.coordinates),
      x = (at.x - origin.x) / scale,
      y = -(at.y - origin.y) / scale;
    transform.position.set(x, y, tree.height - tree.radius * 0.8);
    transform.scale.set(
      tree.radius,
      tree.radius,
      tree.shrub ? 0.8 : tree.radius * 1.15,
    );
    transform.rotation.set(0, 0, i * 2.399);
    transform.updateMatrix();
    crowns.setMatrixAt(i, transform.matrix);
    colour.setHSL(
      0.27 + (i % 7) * 0.007,
      0.24 + (i % 3) * 0.04,
      0.31 + (i % 5) * 0.023,
    );
    crowns.setColorAt(i, colour);
    transform.rotation.set(0, 0, 0);
    transform.position.set(x, y, tree.height / 2);
    transform.scale.set(1, 1, tree.height);
    transform.updateMatrix();
    trunks.setMatrixAt(i, transform.matrix);
    for (let ring = 0; ring < 3; ring++) {
      const radius = tree.radius * (1 + ring * 0.27);
      shade.setMatrixAt(
        i * 3 + ring,
        new Matrix4()
          .makeTranslation(x + 0.5, y + 0.6, 0.035 + ring * 0.003)
          .scale(new Vector3(radius, radius * 0.8, 1)),
      );
    }
  });
  crowns.instanceMatrix.needsUpdate = true;
  trunks.instanceMatrix.needsUpdate = true;
  shade.instanceMatrix.needsUpdate = true;
  // MapLibre supplies a custom camera matrix, so its view/projection is not Three's frustum.
  for (const mesh of [crowns, trunks, shade]) {
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return {
    group,
    update(active: boolean, reduced: boolean, zoom: number, dark: boolean) {
      group.visible = active && zoom >= 15.8;
      const fraction = reduced ? 0.25 : zoom < 16.5 ? 0.5 : 1;
      crowns.count = trunks.count = Math.floor(items.length * fraction);
      shade.count = crowns.count * 3;
      leafMaterial.color.set(dark ? '#9fc4bb' : '#ffffff');
      const fade = Math.min(1, Math.max(0, (zoom - 15.8) / 0.7));
      leafMaterial.opacity = trunkMaterial.opacity = fade;
      leafMaterial.transparent = trunkMaterial.transparent = fade < 1;
      shadowMaterial.opacity = (dark ? 0.055 : 0.09) * fade;
    },
    dispose() {
      group.removeFromParent();
      crownGeometry.dispose();
      trunkGeometry.dispose();
      shadowGeometry.dispose();
      leafMaterial.dispose();
      trunkMaterial.dispose();
      shadowMaterial.dispose();
      crowns.dispose();
      trunks.dispose();
      shade.dispose();
    },
  };
}
