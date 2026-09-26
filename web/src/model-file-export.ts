import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  ImageBitmapLoader,
  Mesh,
  MeshStandardMaterial,
  Texture,
  SRGBColorSpace,
  DoubleSide,
  FrontSide,
} from 'three';
import { workerImageExporter } from './model-gltf-worker-images';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { compileModelDocument } from './model-document-compiler';
import type { ModelMesh } from './visual-types';
import type { ModelDocument } from './model-document';
import type { ModelExportOptions, ModelFile } from './model-file-types';
const encoder = new TextEncoder();
export function exportOBJ(
  meshes: ModelMesh[],
  scale = 1,
  up: 'y' | 'z' = 'z',
): ModelFile[] {
  const obj = [
      '# TurnRight static geometry',
      `# ${scale} exported units per metre; ${up.toUpperCase()} up`,
      'mtllib model.mtl',
    ],
    mtl: string[] = [],
    files: ModelFile[] = [];
  let offset = 1;
  const point = (p: number[]) => (up === 'y' ? [p[0], p[2], -p[1]] : p);
  meshes.forEach((mesh, index) => {
    const material = mesh.material,
      name = `surface_${index}`;
    obj.push(`o object_${index}`, `usemtl ${name}`);
    const colour = (material?.colour || mesh.colour).slice(1);
    mtl.push(
      `newmtl ${name}`,
      `Kd ${[0, 2, 4].map((i) => parseInt(colour.slice(i, i + 2), 16) / 255).join(' ')}`,
      `d ${material?.opacity ?? 1}`,
      'illum 2',
      `Ns ${Math.max(0, 2 / Math.max(0.001, material?.roughness ?? 0.8) ** 2 - 2)}`,
    );
    const url = material?.maps?.baseMap;
    if (url) {
      const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(url);
      if (!match)
        throw new Error(
          'Export needs the original texture bytes. Reload the editable building first.',
        );
      const name = `texture_${index}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`,
        raw = atob(match[2]);
      files.push({
        name,
        data: Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer,
      });
      mtl.push(`map_Kd ${name}`);
    }
    for (let i = 0; i < mesh.positions.length; i += 3)
      obj.push(
        `v ${point(mesh.positions.slice(i, i + 3))
          .map((n) => n * scale)
          .join(' ')}`,
      );
    for (let i = 0; i < mesh.positions.length / 3; i++) {
      let [u, v] = mesh.uvs?.slice(i * 2, i * 2 + 2) || [0, 0];
      const settings = material?.textureSettings?.baseMap;
      if (settings) {
        const c = Math.cos(settings.rotation),
          s = Math.sin(settings.rotation),
          x = u,
          y = v;
        u = settings.repeat[0] * (c * x + s * y) + settings.offset[0];
        v = settings.repeat[1] * (-s * x + c * y) + settings.offset[1];
        if (!settings.flipY) v = 1 - v;
      }
      obj.push(`vt ${u} ${v}`);
      obj.push(
        `vn ${point(mesh.normals?.slice(i * 3, i * 3 + 3) || [0, 0, 1]).join(' ')}`,
      );
    }
    for (let i = 0; i < mesh.indices.length; i += 3)
      obj.push(
        `f ${mesh.indices
          .slice(i, i + 3)
          .map((n) => `${n + offset}/${n + offset}/${n + offset}`)
          .join(' ')}`,
      );
    offset += mesh.positions.length / 3;
    mtl.push('');
  });
  return [
    { name: 'model.obj', data: encoder.encode(obj.join('\n')).buffer },
    { name: 'model.mtl', data: encoder.encode(mtl.join('\n')).buffer },
    ...files,
  ];
}
export async function exportModel(
  document: ModelDocument,
  options: ModelExportOptions,
  native: ModelMesh[] = [],
): Promise<ModelFile[]> {
  const meshes = [
    ...native,
    ...compileModelDocument(document, document.origin),
  ];
  if (!meshes.length)
    throw new Error('Choose an object containing visible geometry.');
  if (!Number.isFinite(options.scale) || options.scale <= 0)
    throw new Error('Choose valid export units.');
  if (options.format === 'obj')
    return exportOBJ(meshes, options.scale, options.up);
  const root = new Group(),
    textures: Texture[] = [],
    bitmaps: ImageBitmap[] = [];
  try {
    for (const part of meshes) {
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
      const source = part.material,
        material = new MeshStandardMaterial({
          color: source?.colour || part.colour,
          opacity: source?.opacity ?? 1,
          transparent: (source?.opacity ?? 1) < 1,
          roughness: source?.roughness ?? 0.8,
          metalness: source?.metalness ?? 0,
          side: source?.doubleSided ? DoubleSide : FrontSide,
          emissive: source?.emissive || '#000000',
          alphaTest: source?.alphaTest || 0,
        });
      for (const [slot, url] of Object.entries(source?.maps || {})) {
        if (!/^data:image\/(png|jpeg|webp);base64,/.test(url))
          throw new Error(
            'Reload the editable document to export packaged textures.',
          );
        const bitmap = await new ImageBitmapLoader().loadAsync(url);
        bitmaps.push(bitmap);
        const texture = new Texture(bitmap);
        texture.needsUpdate = true;
        textures.push(texture);
        const settings = source?.textureSettings?.[slot as 'baseMap'];
        if (settings) {
          texture.flipY = settings.flipY;
          texture.wrapS = settings.wrapS as 1000;
          texture.wrapT = settings.wrapT as 1000;
          texture.offset.fromArray(settings.offset);
          texture.repeat.fromArray(settings.repeat);
          texture.rotation = settings.rotation;
        }
        if (slot === 'baseMap' || slot === 'emissiveMap')
          texture.colorSpace = SRGBColorSpace;
        const key = slot === 'baseMap' ? 'map' : slot;
        if (
          key === 'map' ||
          key === 'normalMap' ||
          key === 'roughnessMap' ||
          key === 'metalnessMap' ||
          key === 'emissiveMap'
        )
          material[key] = texture;
      }
      const mesh = new Mesh(geometry, material);
      mesh.name = part.surfaces?.[0]?.objectId || 'Building';
      root.add(mesh);
    }
    const standard = options.format === 'glb' || options.format === 'gltf';
    root.scale.setScalar(standard ? 1 : options.scale);
    if (standard || options.up === 'y') root.rotation.x = -Math.PI / 2;
    root.updateMatrixWorld(true);
    if (options.format === 'stl') {
      const result = new STLExporter().parse(root, { binary: true });
      return [
        {
          name: 'model.stl',
          data: result.buffer.slice(
            result.byteOffset,
            result.byteOffset + result.byteLength,
          ) as ArrayBuffer,
        },
      ];
    }
    // GLTFExporter's non-binary image path expects a DOM canvas. Export binary in
    // the worker, then expose the same buffer as a data URI for self-contained glTF.
    const result = (await workerImageExporter(textures, bitmaps).parseAsync(
      root,
      {
        binary: true,
        onlyVisible: true,
        maxTextureSize: 4096,
      },
    )) as ArrayBuffer;
    if (options.format === 'glb') return [{ name: 'model.glb', data: result }];
    const view = new DataView(result),
      jsonLength = view.getUint32(12, true),
      json = JSON.parse(
        new TextDecoder().decode(result.slice(20, 20 + jsonLength)),
      ),
      binaryStart = 20 + jsonLength + 8,
      bytes = new Uint8Array(result.slice(binaryStart));
    let raw = '';
    for (let i = 0; i < bytes.length; i += 8192)
      raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
    if (json.buffers?.[0])
      json.buffers[0].uri = `data:application/octet-stream;base64,${btoa(raw)}`;
    return [
      { name: 'model.gltf', data: encoder.encode(JSON.stringify(json)).buffer },
    ];
  } finally {
    root.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        (o.material as MeshStandardMaterial).dispose();
      }
    });
    for (const texture of textures) texture.dispose();
    for (const bitmap of bitmaps) bitmap.close();
  }
}
