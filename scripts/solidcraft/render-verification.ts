import { Box3, Mesh, type MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { compileModelDocument } from '../../web/src/model-document-compiler';
import type { ModelDocument } from '../../web/src/model-document';
import { modelDocumentRevision } from '../../web/src/model-document-revision';

export async function verifyGLB(bytes: ArrayBuffer, document: ModelDocument) {
  const restored = await new GLTFLoader().parseAsync(bytes, '');
  let sourceRevision;
  restored.scene.traverse((object) => {
    sourceRevision ||= object.userData.sourceDocumentRevision;
  });
  if (sourceRevision !== modelDocumentRevision(document))
    throw new Error('GLB source document revision mismatch.');
  const bounds = new Box3().setFromObject(restored.scene);
  const expected = [
    [Infinity, Infinity, Infinity],
    [-Infinity, -Infinity, -Infinity],
  ];
  for (const part of compileModelDocument(document, document.origin))
    for (let i = 0; i < part.positions.length; i += 3) {
      const p = [
        part.positions[i],
        part.positions[i + 2],
        -part.positions[i + 1],
      ];
      for (let a = 0; a < 3; a++) {
        expected[0][a] = Math.min(expected[0][a], p[a]);
        expected[1][a] = Math.max(expected[1][a], p[a]);
      }
    }
  const error = Math.max(
    ...[bounds.min.toArray(), bounds.max.toArray()].flatMap((p, i) =>
      p.map((n, j) => Math.abs(n - expected[i][j])),
    ),
  );
  restored.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    for (const material of (Array.isArray(object.material)
      ? object.material
      : [object.material]) as MeshStandardMaterial[]) {
      for (const key of [
        'map',
        'normalMap',
        'roughnessMap',
        'metalnessMap',
        'emissiveMap',
      ] as const) {
        const texture = material[key];
        texture?.image?.close?.();
        texture?.dispose();
      }
      material.dispose();
    }
  });
  if (error > 0.01) throw new Error('GLB round trip exceeded 1 cm.');
  return error;
}
