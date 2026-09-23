import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { publicCampus } from "./public-campus.mjs";
import { syntheticPhotoEvidence } from "./photo-source.mjs";

export async function packagePhotos(data, root, asset, { fetcher = fetch } = {}) {
  const catalogueFile = path.join(root, "data/photos/catalogue.json");
  const catalogue = await fs
    .readFile(catalogueFile, "utf8")
    .then(JSON.parse)
    .catch((e) => {
      if (e.code === "ENOENT") return [];
      throw e;
    });
  const audit = await fs
    .readFile(path.join(root, "data/photos/research/source-metadata-audit.json"), "utf8")
    .then(JSON.parse)
    .catch((e) => {
      if (e.code === "ENOENT") return { pages: [] };
      throw e;
    });
  const withdrawn = new Set(
    audit.pages
      .filter((p) => syntheticPhotoEvidence(p.imageinfo?.[0]))
      .map((p) => `commons:${p.pageid}`),
  );
  const buildings = new Set(
    data.map.features
      .filter((f) => f.properties?.kind === "building")
      .map((f) => String(f.properties.id)),
  );
  const resolve = (id) => {
    const seen = new Set();
    while (data.buildingIdAliases?.[id] && !seen.has(id)) {
      seen.add(id);
      id = data.buildingIdAliases[id];
    }
    return id;
  };
  // An owner's explicit gallery, including an empty one, takes precedence over the research catalogue.
  const overridden = new Set((data.photoOverrides || []).map(resolve));
  const combined = [
    ...(data.photos || []),
    ...catalogue.filter(
      (p) =>
        buildings.has(resolve(p.buildingId)) &&
        !overridden.has(resolve(p.buildingId)) &&
        !(data.photos || []).some((old) => old.id === p.id),
    ),
  ];
  // A baseline may contain an older research gallery. Do not resurrect a source
  // withdrawn after original metadata revealed synthetic content.
  const photos = publicCampus(
    combined.filter((p) => !withdrawn.has(p.id)),
    "photos",
  );
  const assets = new Map();
  for (const photo of photos) {
    if (
      !/^[a-f0-9]{64}$/.test(photo.sha256) ||
      photo.url !== `/packages/photos/${photo.sha256}.webp` ||
      !photo.license ||
      !photo.author ||
      !photo.attribution ||
      !photo.sourceUrl ||
      !photo.licenseUrl ||
      !buildings.has(resolve(photo.buildingId))
    )
      throw Error(`Invalid approved photograph ${photo.id}`);
    if (assets.has(photo.url)) {
      if (assets.get(photo.url).bytes !== photo.bytes)
        throw Error("Conflicting photograph asset size");
      continue;
    }
    let bytes;
    for (const folder of ["data/release-photos", "data/photos"]) {
      try {
        bytes = await fs.readFile(path.join(root, folder, `${photo.sha256}.webp`));
        break;
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
    if (!bytes && process.env.PUBLISHED_MAP_URL) {
      const origin = new URL(process.env.PUBLISHED_MAP_URL);
      if (origin.protocol !== "https:") throw Error("Published map must use HTTPS");
      const response = await fetcher(new URL(photo.url, origin), {
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) bytes = Buffer.from(await response.arrayBuffer());
    }
    if (
      !bytes ||
      bytes.length !== photo.bytes ||
      bytes.length > 250 * 1024 ||
      createHash("sha256").update(bytes).digest("hex") !== photo.sha256 ||
      bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.toString("ascii", 8, 12) !== "WEBP"
    )
      throw Error(
        `Photograph missing or failed integrity: ${photo.id}. No release images may be omitted.`,
      );
    await asset(photo.url, bytes, "image/webp");
    assets.set(photo.url, { bytes: bytes.length });
  }
  if (photos.length) data.photos = photos;
  else delete data.photos;
  const bytes = [...assets.values()].reduce((sum, a) => sum + a.bytes, 0);
  if (bytes > 20 * 1024 * 1024)
    console.warn("Photographs exceed 20 MiB; all approved photographs remain included.");
  return photos.length ? { bytes, assetUrls: [...assets.keys()] } : undefined;
}
