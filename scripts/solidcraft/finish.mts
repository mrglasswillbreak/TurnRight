import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type {
  ModelDocument,
  ModelImage,
  Vec3,
} from '../../web/src/model-document';
import { modelDocumentErrors } from '../../web/src/model-document';
import { rectifyTexture } from '../../web/src/building-facades';
import { archive, repository, sha256 } from './inventory.mjs';

const crops: Record<string, { photoId: string; rectangle: number[] }> = {
  'arcgis:University_Property:120': {
    photoId: 'commons:138069484',
    rectangle: [665 / 1320, 408 / 1400, 686 / 1320, 444 / 1400],
  },
  'arcgis:University_Property:3': {
    photoId: 'commons:198256532',
    rectangle: [642 / 960, 242 / 720, 654 / 960, 257 / 720],
  },
};
const textureSettings = (repeat = true) => ({
  flipY: true,
  wrapS: repeat ? 1000 : 1001,
  wrapT: repeat ? 1000 : 1001,
  offset: [0, 0] as [number, number],
  repeat: [1, 1] as [number, number],
  rotation: 0,
});

/** Finishing is reproducible and separate from the unchanged CAD millimetre master. */
export async function finishModel(
  document: ModelDocument,
  buildingId: string,
  baselineVersion: string,
  photos: { id: string; url: string; sha256: string }[],
) {
  const report: {
    kind: string;
    details: string;
    photoId?: string;
    imageSha256: string;
  }[] = [];
  const addImage = async (
    id: string,
    name: string,
    pixels: Uint8Array | Uint8ClampedArray,
    size: number,
    evidence?: ModelImage['evidence'],
  ) => {
    const bytes = await sharp(new Uint8Array(pixels), {
      raw: { width: size, height: size, channels: 4 },
    })
      .png()
      .toBuffer();
    document.images.push({
      id,
      name,
      mime: 'image/png',
      data: bytes.toString('base64'),
      ...(evidence ? { evidence } : {}),
    });
    return sha256(bytes);
  };
  // Modest original microtexture, not invented weathering or damage.
  const size = 256,
    rough = new Uint8Array(size * size * 4),
    normal = new Uint8Array(rough.length);
  let state = 48621;
  for (let i = 0; i < rough.length; i += 4) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const grain = (state >>> 24) / 255;
    rough.set(
      [
        180 + Math.round(grain * 35),
        180 + Math.round(grain * 35),
        180 + Math.round(grain * 35),
        255,
      ],
      i,
    );
    normal.set(
      [126 + Math.round(grain * 4), 126 + ((state >>> 16) % 5), 255, 255],
      i,
    );
  }
  for (const [id, pixels] of [
    ['surface-roughness', rough],
    ['surface-normal', normal],
  ] as const)
    report.push({
      kind: 'original-material',
      details:
        'Deterministic subtle mineral surface microtexture; no photograph or claimed weathering.',
      imageSha256: await addImage(id, id, pixels, size),
    });
  const crop = crops[buildingId];
  if (crop) {
    const audit = JSON.parse(
      await fs.readFile(
        path.join(repository, 'data/lasu-models/photo-audit.json'),
        'utf8',
      ),
    );
    if (
      !audit.records.some(
        (r: { photoId: string; status: string }) =>
          r.photoId === crop.photoId && r.status === 'reuse-verified',
      )
    )
      throw new Error('A photographic texture requires verified reuse rights.');
    const photo = photos.find((p) => p.id === crop.photoId);
    if (!photo) throw new Error('Missing associated photographic source.');
    const bytes = await fs.readFile(
      path.join(archive, 'baseline', baselineVersion, photo.url),
    );
    if (sha256(bytes) !== photo.sha256)
      throw new Error('Texture source failed integrity check.');
    const source = await sharp(bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const [x0, y0, x1, y1] = crop.rectangle;
    const corners: [number, number][] = [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
    const pixels = rectifyTexture(
      source.data,
      source.info.width,
      source.info.height,
      corners,
      128,
    );
    const modifications =
      'Small glazing sample, four-corner rectification, resampled to 128 px and repeated across estimated glazing modules; not a whole-facade photographic reconstruction.';
    report.push({
      kind: 'photographic-glazing',
      photoId: photo.id,
      details: modifications,
      imageSha256: await addImage(
        'glazing-photo',
        'Observed glazing sample',
        pixels,
        128,
        { photoId: photo.id, corners, modifications },
      ),
    });
  }
  for (const material of document.materials) {
    if (material.name === 'glass') {
      material.roughness = 0.26;
      material.metalness = 0.18;
      if (crop) {
        material.baseMap = 'glazing-photo';
        material.colour = '#ffffff';
        material.textureSettings = { baseMap: textureSettings(false) };
      }
    } else if (material.name !== 'sign') {
      material.roughness = 1;
      material.roughnessMap = 'surface-roughness';
      material.normalMap = 'surface-normal';
      material.textureSettings = {
        roughnessMap: textureSettings(),
        normalMap: textureSettings(),
      };
    }
  }
  for (const object of document.objects) {
    const glass = object.id.includes('-glass-');
    const components = new Map<string, typeof object.faces>();
    for (const face of object.faces) {
      const id = face.id.replace(/-\d+$/, '');
      if (!components.has(id)) components.set(id, []);
      components.get(id)!.push(face);
    }
    for (const faces of components.values())
      for (const face of faces) {
        const n = face.corners[0].normal || [0, 0, 1];
        const horizontal = Math.abs(n[2]) > 0.9,
          length = Math.hypot(n[0], n[1]) || 1;
        const u: Vec3 = horizontal
            ? [1, 0, 0]
            : [-n[1] / length, n[0] / length, 0],
          v: Vec3 = horizontal ? [0, 1, 0] : [0, 0, 1];
        const dot = (p: Vec3, axis: Vec3) =>
          p.reduce((sum, value, i) => sum + value * axis[i], 0);
        let minU = Infinity,
          maxU = -Infinity,
          minV = Infinity,
          maxV = -Infinity;
        if (glass)
          for (const f of faces)
            for (const c of f.corners) {
              const p = object.vertices[c.vertex],
                x = dot(p, u),
                y = dot(p, v);
              minU = Math.min(minU, x);
              maxU = Math.max(maxU, x);
              minV = Math.min(minV, y);
              maxV = Math.max(maxV, y);
            }
        for (const corner of face.corners) {
          const p = object.vertices[corner.vertex],
            x = dot(p, u),
            y = dot(p, v);
          corner.uv = glass
            ? [
                (x - minU) / Math.max(0.0001, maxU - minU),
                (y - minV) / Math.max(0.0001, maxV - minV),
              ]
            : [x / 2, y / 2];
        }
      }
  }
  const errors = modelDocumentErrors(document);
  if (errors.length) throw new Error(errors.join(' '));
  return report;
}
