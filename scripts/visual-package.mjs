import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

/** Optional schema-v1 extension. Only catalogue-listed, verified sectors enter a release. */
export async function packageVisuals(directory, writeAsset) {
  const raw = await fs.readFile(path.join(directory, "catalogue.json"), "utf8").catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!raw) return null;
  const catalogue = JSON.parse(raw);
  if (
    catalogue.schemaVersion !== 1 ||
    !Array.isArray(catalogue.sectors) ||
    !Array.isArray(catalogue.buildings)
  )
    throw new Error("Invalid visual catalogue");
  let bytes = 0;
  const urls = new Set();
  for (const sector of catalogue.sectors) {
    if (
      !/^\/packages\/visual-[a-f0-9]+\/sector-[a-z0-9-]+\.json$/.test(sector.url) ||
      urls.has(sector.url)
    )
      throw new Error("Invalid visual asset path");
    urls.add(sector.url);
    const content = await fs.readFile(path.join(directory, path.basename(sector.url)));
    if (
      content.length !== sector.bytes ||
      createHash("sha256").update(content).digest("hex") !== sector.sha256
    )
      throw new Error(`Visual asset failed verification: ${sector.id}`);
    bytes += content.length;
    if (bytes > 12 * 1024 * 1024) throw new Error("Campus models exceed the 12 MB budget");
    await writeAsset(sector.url, content, "application/json");
  }
  if (bytes !== catalogue.bytes) throw new Error("Visual catalogue size mismatch");
  const textureUrls = new Set();
  const textureIds = new Set();
  let textureBytes = 0;
  for (const texture of catalogue.textures || []) {
    if (
      !texture ||
      typeof texture.id !== "string" ||
      textureIds.has(texture.id) ||
      !/^\/packages\/texture-[a-f0-9]+\/[a-f0-9]+\.webp$/.test(texture.url) ||
      !texture.photoId ||
      !texture.author ||
      !texture.license ||
      !texture.licenseUrl ||
      !texture.attribution ||
      !texture.modifications ||
      texture.width !== 512 ||
      texture.height !== 512
    )
      throw new Error("Invalid texture attribution or identity");
    textureIds.add(texture.id);
    const content = await fs.readFile(path.join(directory, path.basename(texture.url)));
    if (
      content.length !== texture.bytes ||
      content.length > 250 * 1024 ||
      createHash("sha256").update(content).digest("hex") !== texture.sha256
    )
      throw new Error("Texture integrity check failed");
    if (!textureUrls.has(texture.url)) {
      textureBytes += content.length;
      textureUrls.add(texture.url);
      await writeAsset(texture.url, content, "image/webp");
    }
  }
  if (bytes + textureBytes > 12 * 1024 * 1024)
    throw new Error("Campus geometry and textures exceed 12 MiB");
  return {
    catalogue,
    manifest: { bytes, assetUrls: [...urls] },
    ...(textureUrls.size ? { textures: { bytes: textureBytes, assetUrls: [...textureUrls] } } : {}),
  };
}
