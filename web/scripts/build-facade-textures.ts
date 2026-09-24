import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { CampusData } from '../src/types';
import type { VisualTexture } from '../src/visual-types';
import {
  facadeErrors,
  rectifyTexture,
  textureKey,
} from '../src/building-facades';
export async function buildFacadeTextures(
  data: CampusData,
  output: string,
): Promise<VisualTexture[]> {
  const textures = new Map<string, VisualTexture>();
  for (const feature of data.map.features.filter(
    (f) => f.properties?.kind === 'building',
  )) {
    const errors = facadeErrors(feature, data.photos, true);
    if (errors.length)
      throw Error(`${feature.properties?.name}: ${errors.join(' ')}`);
    for (const facade of Object.values(
      feature.properties?.appearance?.facades || {},
    ) as import('../src/visual-types').FacadeDescription[]) {
      const recipe = facade.texture;
      if (!recipe || textures.has(textureKey(recipe))) continue;
      const photo = data.photos!.find((p) => p.id === recipe.photoId)!;
      if (!photo || photo.buildingId !== feature.properties?.id)
        throw Error('Texture building evidence mismatch');
      const filename = path.join('public', decodeURIComponent(photo.url));
      if (!/^\/packages\/[a-zA-Z0-9_/-]+\.webp$/.test(photo.url))
        throw Error('Invalid approved photograph path');
      // Preview/release preparation restores approved assets into public before this build.
      const source = await fs
        .readFile(filename)
        .catch(async () =>
          fs.readFile(
            path.join('../data/release-photos', photo.sha256 + '.webp'),
          ),
        )
        .catch(async () =>
          fs.readFile(path.join('../data/photos', photo.sha256 + '.webp')),
        );
      if (
        source.length !== photo.bytes ||
        createHash('sha256').update(source).digest('hex') !== photo.sha256
      )
        throw Error('Texture photograph failed verification');
      const { data: pixels, info } = await sharp(source)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      if (info.width > 1600 || info.height > 1600)
        throw Error('Texture source exceeds approved dimensions');
      const transformed = rectifyTexture(
        pixels,
        info.width,
        info.height,
        recipe.corners,
      );
      const content = await sharp(transformed, {
        raw: { width: 512, height: 512, channels: 4 },
      })
        .webp({ quality: 85, effort: 5 })
        .toBuffer();
      const sha256 = createHash('sha256').update(content).digest('hex');
      if (content.length > 250 * 1024)
        throw Error('Texture derivative exceeds 250 KiB');
      await fs.mkdir(output, { recursive: true });
      await fs.writeFile(path.join(output, sha256 + '.webp'), content);
      textures.set(textureKey(recipe), {
        id: textureKey(recipe),
        photoId: photo.id,
        url: `/packages/texture-${sha256.slice(0, 12)}/${sha256}.webp`,
        bytes: content.length,
        sha256,
        width: 512,
        height: 512,
        author: photo.author,
        license: photo.license,
        licenseUrl: photo.licenseUrl,
        attribution: photo.attribution,
        sourceUrl: photo.sourceUrl,
        modifications:
          'Façade crop, perspective rectification, resampling to 512 pixels and WebP compression. ' +
          (photo.modifications || ''),
      });
    }
  }
  return [...textures.values()];
}
