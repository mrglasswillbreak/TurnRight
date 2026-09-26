import {
  BufferGeometry,
  Color,
  LoadingManager,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  Texture,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import {
  defaultModelMaterial,
  identityTransform,
  modelId,
  newModelDocument,
  MODEL_LIMITS,
  type ModelMaterial,
  type Vec3,
} from './model-document';
import { objectFromGeometry } from './model-primitives';
import {
  MODEL_FILE_BYTES,
  type ModelFile,
  type ModelImport,
} from './model-file-types';

const decoder = new TextDecoder();
const nameKey = (name: string) =>
  decodeURIComponent(name)
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .toLowerCase();
const imageMime = (name: string) =>
  /\.png$/i.test(name)
    ? 'image/png'
    : /\.webp$/i.test(name)
      ? 'image/webp'
      : 'image/jpeg';
function base64(bytes: Uint8Array) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
/** All dependency resolution is against user-supplied files; no remote URL is fetched. */
export async function importModelFiles(
  files: ModelFile[],
  primary: string,
): Promise<ModelImport> {
  if (
    files.length > 100 ||
    files.reduce((n, f) => n + f.data.byteLength, 0) > MODEL_FILE_BYTES
  )
    throw new Error('Choose at most 100 files totalling 50 MiB.');
  const file = files.find((f) => f.name === primary);
  if (!file) throw new Error('Choose the primary model file.');
  const warnings: string[] = [],
    missing: string[] = [],
    urls: string[] = [];
  const document = newModelDocument([0, 0]);
  document.materials = [];
  const resolve = (name: string) => {
    if (/^(https?:|\/\/|file:|javascript:)/i.test(name)) {
      missing.push(name);
      return undefined;
    }
    const exact = files.find((f) => nameKey(f.name) === nameKey(name));
    if (exact) return exact;
    const candidates = files.filter(
      (f) =>
        nameKey(f.name).split('/').at(-1) === nameKey(name).split('/').at(-1),
    );
    if (candidates.length === 1) return candidates[0];
    missing.push(name);
    return undefined;
  };
  const manager = new LoadingManager();
  const allowed = new Set<string>();
  // GLTFLoader also creates blob URLs for embedded buffer-view images. Only
  // URLs created during this isolated worker operation may bypass resolution.
  const createObjectURL = URL.createObjectURL;
  URL.createObjectURL = (blob) => {
    const url = createObjectURL.call(URL, blob);
    urls.push(url);
    allowed.add(url);
    return url;
  };
  const objectUrl = (data: ArrayBuffer, mime = 'application/octet-stream') =>
    URL.createObjectURL(new Blob([data], { type: mime }));
  manager.setURLModifier((url) => {
    if (
      allowed.has(url) ||
      /^data:(application\/octet-stream|application\/gltf-buffer|image\/(png|jpeg|webp));base64,/i.test(
        url,
      )
    )
      return url;
    const dependency = resolve(url);
    if (!dependency)
      throw new Error(`Missing dependency: ${url}. Supply it with the model.`);
    const result = objectUrl(dependency.data, imageMime(dependency.name));
    allowed.add(result);
    return result;
  });
  let root: Object3D;
  const ext = primary.split('.').at(-1)?.toLowerCase();
  try {
    if (ext === 'gltf' || ext === 'glb') {
      let json: Record<string, any>, binary: ArrayBuffer | undefined;
      if (ext === 'glb') {
        const view = new DataView(file.data);
        if (
          view.byteLength < 20 ||
          view.getUint32(0, true) !== 0x46546c67 ||
          view.getUint32(4, true) !== 2 ||
          view.getUint32(8, true) !== view.byteLength
        )
          throw new Error('Choose a valid glTF 2 GLB file.');
        let offset = 12;
        json = {};
        while (offset + 8 <= view.byteLength) {
          const size = view.getUint32(offset, true),
            kind = view.getUint32(offset + 4, true);
          if (offset + 8 + size > view.byteLength)
            throw new Error('The GLB contains a truncated chunk.');
          const data = file.data.slice(offset + 8, offset + 8 + size);
          if (kind === 0x4e4f534a) json = JSON.parse(decoder.decode(data));
          else if (kind === 0x004e4942) binary = data;
          offset += 8 + size;
        }
      } else json = JSON.parse(decoder.decode(file.data));
      if (json.asset?.version !== '2.0')
        throw new Error('Only glTF 2.0 static models are supported.');
      if (json.animations?.length)
        warnings.push(
          'Animations are omitted; the default static pose is imported.',
        );
      if (json.skins?.length)
        warnings.push(
          'Rigging is omitted; mesh geometry in its default pose is imported.',
        );
      const unsupported = (json.extensionsUsed || []).filter(
        (e: string) => e !== 'KHR_texture_transform',
      );
      if (unsupported.length)
        warnings.push(
          `Extensions are converted to core materials or omitted: ${unsupported.join(', ')}.`,
        );
      const required = (json.extensionsRequired || []).filter((e: string) =>
        [
          'KHR_draco_mesh_compression',
          'EXT_meshopt_compression',
          'KHR_texture_basisu',
        ].includes(e),
      );
      if (required.length)
        throw new Error(
          `Re-export without compressed extensions: ${required.join(', ')}.`,
        );
      for (const mesh of json.meshes || [])
        for (const primitive of mesh.primitives || []) {
          if (primitive.targets?.length)
            warnings.push('Morph targets are omitted.');
          if (primitive.mode !== undefined && primitive.mode !== 4)
            warnings.push(
              'Only triangle geometry is editable; points and lines are omitted.',
            );
        }
      for (const material of json.materials || []) {
        if (material.extensions) delete material.extensions;
        if (material.occlusionTexture)
          warnings.push('Ambient occlusion maps are omitted.');
        if (
          material.normalTexture?.scale !== undefined &&
          material.normalTexture.scale !== 1
        )
          warnings.push('Normal map intensity is reset to one.');
      }
      json.extensionsRequired = (json.extensionsRequired || []).filter(
        (e: string) => e === 'KHR_texture_transform',
      );
      for (const [index, buffer] of (json.buffers || []).entries()) {
        if (!buffer.uri && index === 0 && binary) {
          buffer.uri = objectUrl(binary);
          allowed.add(buffer.uri);
        } else if (buffer.uri && !String(buffer.uri).startsWith('data:')) {
          const supplied = resolve(buffer.uri);
          if (!supplied)
            throw new Error(`Missing geometry buffer: ${buffer.uri}.`);
          buffer.uri = objectUrl(supplied.data);
          allowed.add(buffer.uri);
        }
      }
      for (const image of json.images || [])
        if (image.uri && !String(image.uri).startsWith('data:')) {
          const supplied = resolve(image.uri);
          if (supplied) {
            image.uri = objectUrl(supplied.data, imageMime(supplied.name));
            allowed.add(image.uri);
          } else {
            image.uri =
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==';
            warnings.push(
              'Missing image replaced by white. Supply the image and import again to retain it.',
            );
          }
        }
      const gltf = await new GLTFLoader(manager).parseAsync(
        JSON.stringify(json),
        '',
      );
      root = gltf.scene;
    } else if (ext === 'obj')
      root = new OBJLoader(manager).parse(decoder.decode(file.data));
    else if (ext === 'stl') {
      root = new Mesh(
        new STLLoader().parse(file.data),
        new MeshStandardMaterial({ color: '#c6cbd1' }),
      );
      warnings.push(
        'STL contains geometry only; choose the intended units and up axis.',
      );
    } else throw new Error('Choose a GLB, glTF, OBJ, or STL file.');
    root.updateMatrixWorld(true);
    const materials = new Map<string, string>(),
      images = new Map<string, string>();
    const saveImage = async (texture: Texture) => {
      if (images.has(texture.source.uuid))
        return images.get(texture.source.uuid)!;
      const source = texture.image as ImageBitmap;
      if (!source || !source.width || !source.height)
        throw new Error('A texture could not be decoded.');
      if (source.width > 4096 || source.height > 4096)
        throw new Error(
          'Reduce textures to 4096 × 4096 pixels or smaller before importing.',
        );
      const canvas = new OffscreenCanvas(source.width, source.height);
      canvas.getContext('2d')!.drawImage(source, 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      if (blob.size > MODEL_LIMITS.imageBytes)
        throw new Error(
          'A decoded texture exceeds 4 MiB. Reduce its dimensions before importing.',
        );
      const id = modelId();
      document.images.push({
        id,
        name: `Texture ${document.images.length + 1}`,
        mime: 'image/png',
        data: base64(new Uint8Array(await blob.arrayBuffer())),
      });
      images.set(texture.source.uuid, id);
      return id;
    };
    const saveMaterial = async (source: MeshStandardMaterial) => {
      if (materials.has(source.uuid)) return materials.get(source.uuid)!;
      const id = modelId(),
        material: ModelMaterial = {
          ...defaultModelMaterial(),
          id,
          name: source.name || `Material ${document.materials.length + 1}`,
          colour: `#${source.color?.getHexString() || 'c6cbd1'}`,
          opacity: source.opacity ?? 1,
          roughness: source.roughness ?? 0.8,
          metalness: source.metalness ?? 0,
          doubleSided: source.side === 2,
          emissive: `#${source.emissive?.getHexString() || '000000'}`,
          alphaTest: source.alphaTest || 0,
        };
      for (const slot of [
        'map',
        'normalMap',
        'roughnessMap',
        'metalnessMap',
        'emissiveMap',
      ] as const) {
        const texture = source[slot];
        if (!texture) continue;
        if (texture.channel !== 0) {
          warnings.push('A texture using a secondary UV set was omitted.');
          continue;
        }
        const target = slot === 'map' ? 'baseMap' : slot;
        material[target] = await saveImage(texture);
        (material.textureSettings ||= {})[target] = {
          flipY: texture.flipY,
          wrapS: texture.wrapS,
          wrapT: texture.wrapT,
          offset: texture.offset.toArray(),
          repeat: texture.repeat.toArray(),
          rotation: texture.rotation,
        };
      }
      materials.set(source.uuid, id);
      document.materials.push(material);
      return id;
    };
    const nodes: Object3D[] = [];
    root.traverse((o) => {
      if (o instanceof Mesh) nodes.push(o);
    });
    if (!nodes.length)
      throw new Error('No editable triangle meshes were found.');
    if (nodes.length > MODEL_LIMITS.objects)
      throw new Error('Reduce the file to at most 100 mesh objects.');
    let vertexCount = 0,
      faceCount = 0;
    for (const node of nodes) {
      const mesh = node as Mesh,
        geometry = mesh.geometry.clone() as BufferGeometry;
      geometry.applyMatrix4(mesh.matrixWorld);
      vertexCount += geometry.getAttribute('position').count;
      faceCount +=
        (geometry.index?.count || geometry.getAttribute('position').count) / 3;
      if (vertexCount > MODEL_LIMITS.vertices || faceCount > MODEL_LIMITS.faces)
        throw new Error(
          'Reduce the model to 100,000 vertices and 200,000 faces.',
        );
      const sources = (
        Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      ) as MeshStandardMaterial[];
      const ids = await Promise.all(sources.map(saveMaterial));
      const object = objectFromGeometry(
        geometry,
        mesh.name || primary,
        ids[0],
        true,
      );
      object.source = { kind: 'import', name: primary };
      for (let i = 0; i < object.faces.length; i++) {
        const group = geometry.groups.find(
          (g) => i * 3 >= g.start && i * 3 < g.start + g.count,
        );
        if (group)
          object.faces[i].material = ids[group.materialIndex || 0] || ids[0];
      }
      document.objects.push(object);
      geometry.dispose();
    }
    // Preserve the imported hierarchy as organisational parents; transforms are baked in metres.
    const ids = new Map(nodes.map((n, i) => [n.uuid, document.objects[i].id]));
    const parentId = (node: Object3D | null): string | undefined => {
      if (!node || node === root) return undefined;
      const known = ids.get(node.uuid);
      if (known) return known;
      const id = modelId();
      ids.set(node.uuid, id);
      document.objects.push({
        id,
        name: node.name || 'Imported group',
        parentId: parentId(node.parent),
        hidden: false,
        locked: false,
        vertices: {},
        faces: [],
        transform: identityTransform(),
        source: { kind: 'import', name: primary },
      });
      return id;
    };
    for (const [i, node] of nodes.entries())
      document.objects[i].parentId = parentId(node.parent);
    if (document.objects.length > MODEL_LIMITS.objects)
      throw new Error(
        'The imported hierarchy exceeds 100 objects. Flatten unnecessary groups and retry.',
      );
    if (ext === 'obj') {
      const obj = decoder.decode(file.data),
        mtls = [...obj.matchAll(/^mtllib\s+(.+)$/gm)].map((m) =>
          resolve(m[1].trim()),
        );
      for (const supplied of mtls) {
        if (!supplied) continue;
        let current: ModelMaterial | undefined;
        for (const line of decoder.decode(supplied.data).split(/\r?\n/)) {
          const [key, ...values] = line.trim().split(/\s+/);
          if (key === 'newmtl')
            current = document.materials.find(
              (m) => m.name === values.join(' '),
            );
          if (!current) continue;
          if (key === 'Kd' && values.length >= 3)
            current.colour = `#${new Color().setRGB(...(values.slice(0, 3).map(Number) as [number, number, number]), SRGBColorSpace).getHexString()}`;
          else if (key === 'd' || key === 'Tr')
            current.opacity =
              key === 'Tr' ? 1 - Number(values[0]) : Number(values[0]);
          else if (key === 'Ns')
            current.roughness = Math.sqrt(2 / (Number(values[0]) + 2));
          else if (key === 'map_Kd') {
            const name = values.join(' ');
            if (name.startsWith('-')) {
              warnings.push(
                'OBJ texture options are unsupported; export textures with baked UV transforms.',
              );
              continue;
            }
            const image = resolve(name);
            if (image) {
              const bitmap = await createImageBitmap(
                new Blob([image.data], { type: imageMime(name) }),
              );
              const texture = new Texture(bitmap);
              current.baseMap = await saveImage(texture);
              bitmap.close();
            }
          } else if (
            ['map_Bump', 'bump', 'map_Ks', 'map_d', 'illum', 'Ks'].includes(key)
          )
            warnings.push(
              'OBJ diffuse colour, opacity, and diffuse textures are retained; other MTL properties use core PBR defaults.',
            );
        }
      }
    }
    const all = document.objects.flatMap((o) => Object.values(o.vertices)),
      min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    for (const p of all)
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], p[i]);
        max[i] = Math.max(max[i], p[i]);
      }
    return {
      document,
      warnings: [...new Set(warnings)],
      missing: [...new Set(missing)],
      dimensions: max.map((n, i) => n - min[i]) as Vec3,
      vertices: all.length,
      faces: document.objects.reduce((n, o) => n + o.faces.length, 0),
      filename: primary,
    };
  } finally {
    URL.createObjectURL = createObjectURL;
    for (const url of urls) URL.revokeObjectURL(url);
  }
}
