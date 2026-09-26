import { expect, it } from 'vitest';
import { importModelFiles } from '../src/model-file-import';
import { exportOBJ } from '../src/model-file-export';
import { compileModelDocument } from '../src/model-document-compiler';
import {
  modelDocumentErrors,
  newModelDocument,
  transformPoint,
} from '../src/model-document';
import { primitive } from '../src/model-primitives';
import { placeImportedModel } from '../src/model-import-placement';
import { modelFileZip } from '../src/model-file-zip';
import { transformModelObject, transformModelHierarchy } from '../src/model-object-transform';
const file = (name: string, text: string) => ({
  name,
  data: new TextEncoder().encode(text).buffer,
});
it('transforms imported groups together and protects locked descendants', () => {
  const doc = newModelDocument([0, 0]), a = primitive('box'), b = primitive('box');
  a.id = 'group'; a.faces = []; a.vertices = {};
  b.parentId = a.id; b.transform.position = [5, 0, 0];
  doc.objects = [a, b];
  const moved = transformModelHierarchy(doc, a.id, 'move', [2, 3, 4]);
  expect(moved.objects[1].transform.position).toEqual([7, 3, 4]);
  expect(doc.objects[1].transform.position).toEqual([5, 0, 0]);
  b.locked = true;
  expect(() => transformModelHierarchy(doc, a.id, 'move', [1, 0, 0])).toThrow(/Unlock/);
});
it('round trips OBJ geometry, normals, UVs, diffuse colour and explicit units', async () => {
  const doc = newModelDocument([3.2, 6.46]);
  doc.objects = [primitive('box')];
  doc.materials[0].colour = '#1784ce';
  const files = exportOBJ(compileModelDocument(doc, doc.origin), 1000, 'y');
  const imported = await importModelFiles(files, 'model.obj');
  expect(imported.faces).toBe(doc.objects[0].faces.length);
  expect(imported.dimensions).toEqual([4000, 4000, 4000]);
  const result = placeImportedModel(newModelDocument(doc.origin), imported, {
    scale: 0.001,
    up: 'y',
    centre: true,
  });
  expect(modelDocumentErrors(result)).toEqual([]);
  expect(result.materials.find((m) => m.name === 'surface_0')?.colour).toBe(
    '#1784ce',
  );
  expect(
    Math.max(...Object.values(result.objects[0].vertices).map((p) => p[2])),
  ).toBeCloseTo(4);
  const zip = new Uint8Array(await modelFileZip(files).arrayBuffer());
  expect(Array.from(zip.slice(0, 4))).toEqual([80, 75, 3, 4]);
});
it('reports missing OBJ materials, rejects missing or remote glTF buffers without network access', async () => {
  const obj = await importModelFiles(
    [file('part.obj', 'mtllib absent.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3')],
    'part.obj',
  );
  expect(obj.missing).toEqual(['absent.mtl']);
  for (const uri of ['missing.bin', 'https://example.org/model.bin'])
    await expect(
      importModelFiles(
        [
          file(
            'part.gltf',
            JSON.stringify({
              asset: { version: '2.0' },
              buffers: [{ uri, byteLength: 36 }],
            }),
          ),
        ],
        'part.gltf',
      ),
    ).rejects.toThrow(/Missing geometry buffer/);
});
it('imports STL as geometry-only and preserves parametric profiles during object transforms', async () => {
  const imported = await importModelFiles(
    [
      file(
        'part.stl',
        'solid part\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid part',
      ),
    ],
    'part.stl',
  );
  expect(imported.faces).toBe(1);
  expect(imported.warnings.join(' ')).toMatch(/geometry only/);
  const object = primitive('ellipse'),
    moved = transformModelObject(object, 'move', [3, 5, 8]),
    rotated = transformModelObject(moved, 'rotate', [0, 0, 45]);
  expect(rotated.curve).toEqual(object.curve);
  expect(rotated.vertices).toEqual(object.vertices);
  expect(rotated.transform.rotation[2]).toBeCloseTo(45);
  const p = Object.values(object.vertices)[0];
  expect(transformPoint(p, moved.transform)).toEqual([
    p[0] + 3,
    p[1] + 5,
    p[2] + 8,
  ]);
});
