import type { CampusData, CampusPackage } from './types';

export async function visualManifestMatches(
  data: CampusData,
  manifest: CampusPackage,
) {
  if (data.visuals?.detailedModels?.length || manifest.detailedModels) {
    const { detailedManifestMatches } = await import('./model-lod');
    if (!detailedManifestMatches(data, manifest)) return false;
  }
  const sectors = data.visuals?.sectors || [],
    urls = manifest.visuals?.assetUrls || [];
  const textures = data.visuals?.textures || [],
    textureUrls = manifest.textures?.assetUrls || [];
  if (
    new Set(textureUrls).size !== textureUrls.length ||
    new Set(
      [...textures, ...(data.visuals?.modelTextures || [])].map((t) => t.url),
    ).size !== textureUrls.length ||
    new Set(textures.map((t) => t.id)).size !== textures.length ||
    !textures.every(
      (t) =>
        textureUrls.includes(t.url) &&
        /^\/packages\/texture-[a-f0-9]+\/[a-f0-9]+\.webp$/.test(t.url) &&
        t.bytes <= 250 * 1024 &&
        t.width > 0 &&
        t.width <= 1024 &&
        t.height > 0 &&
        t.height <= 1024 &&
        !!t.author &&
        !!t.license &&
        !!t.attribution &&
        data.photos?.some((p) => p.id === t.photoId) &&
        manifest.assets.some(
          (a) =>
            a.url === t.url && a.bytes === t.bytes && a.sha256 === t.sha256,
        ),
    ) ||
    !(data.visuals?.modelTextures || []).every(
      (t) =>
        textureUrls.includes(t.url) &&
        /^\/packages\/model-texture-[a-f0-9]{64}\.(png|jpg|webp)$/.test(
          t.url,
        ) &&
        t.bytes > 0 &&
        t.bytes <= 4 * 1024 * 1024 &&
        manifest.assets.some(
          (a) =>
            a.url === t.url && a.bytes === t.bytes && a.sha256 === t.sha256,
        ),
    ) ||
    (manifest.textures?.bytes || 0) !==
      manifest.assets
        .filter((a) => textureUrls.includes(a.url))
        .reduce((n, a) => n + a.bytes, 0) ||
    (manifest.textures?.bytes || 0) + (manifest.visuals?.bytes || 0) >
      12 * 1024 * 1024
  )
    return false;
  return (
    photoManifestMatches(data, manifest) &&
    sectors.length === urls.length &&
    new Set(urls).size === urls.length &&
    sectors.every(
      (sector) =>
        urls.includes(sector.url) &&
        manifest.assets.some(
          (a) =>
            a.url === sector.url &&
            a.bytes === sector.bytes &&
            a.sha256 === sector.sha256,
        ),
    )
  );
}
export function photoManifestMatches(
  data: CampusData,
  manifest: CampusPackage,
) {
  const photos = data.photos || [],
    urls = [...new Set(photos.map((p) => p.url))];
  const declared = manifest.photos?.assetUrls || [];
  return (
    urls.length === declared.length &&
    new Set(declared).size === declared.length &&
    urls.every((url) => declared.includes(url)) &&
    photos.every((p) =>
      manifest.assets.some(
        (a) => a.url === p.url && a.bytes === p.bytes && a.sha256 === p.sha256,
      ),
    ) &&
    (manifest.photos?.bytes || 0) ===
      manifest.assets
        .filter((a) => urls.includes(a.url))
        .reduce((n, a) => n + a.bytes, 0)
  );
}
