import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { photoDerivative } from "../web/server/photo-processing";
import { validPhoto } from "../web/src/arrival";
import type { CampusPhoto } from "../web/src/types";
import { requirePhotographicSource } from "./photo-source.mjs";

const root = path.resolve(import.meta.dirname, "..");
const raw = path.join(root, "data/raw/photo-research");
const destination = path.join(root, "data/photos");
await fs.mkdir(path.join(destination, "research"), { recursive: true });
const inventory = JSON.parse(await fs.readFile(path.join(raw, "inventory.json"), "utf8"));
const decisions = JSON.parse(await fs.readFile(path.join(destination, "decisions.json"), "utf8"));
const sourceAudit = JSON.parse(await fs.readFile(path.join(destination, "research/source-metadata-audit.json"), "utf8"));
const references = JSON.parse(
  await fs.readFile(path.join(root, "data/raw/building-references/index.json"), "utf8"),
);
const inputs = await fs
  .readFile(path.join(destination, "research/inputs.json"), "utf8")
  .then(JSON.parse)
  .catch((e) => {
    if (e.code === "ENOENT") return {};
    throw e;
  });
const strip = (s = "") =>
  s
    .replace(/<[^>]*>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/&#(\d+);/g, (_: string, n: string) => String.fromCodePoint(Number(n)))
    .trim();
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const catalogue: CampusPhoto[] = [],
  candidates: object[] = [],
  duplicates = new Map<string, string>();
for (const page of inventory.pages) {
  const info = page.imageinfo?.[0],
    meta = info?.extmetadata || {},
    decision = decisions[page.title];
  const credit = {
    author: strip(meta.Artist?.value),
    license: strip(meta.LicenseShortName?.value),
    licenseUrl: meta.LicenseUrl?.value,
    originalUrl: info?.url,
    originalSha1: info?.sha1,
    width: info?.width,
    height: info?.height,
    checkedAt: inventory.researchedAt,
    capturedAt: strip(meta.DateTimeOriginal?.value),
    description: strip(meta.ImageDescription?.value).slice(0, 1000),
  };
  const candidate: Record<string, unknown> = {
    id: `commons:${page.pageid}`,
    title: page.title,
    sourceUrl:
      info?.descriptionurl ||
      `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`,
    ...credit,
  };
  if (decision?.status === "included") {
    requirePhotographicSource(page, sourceAudit.pages.find((p: { pageid: number }) => p.pageid === page.pageid));
    if (
      !info?.url ||
      !credit.author ||
      !["CC BY-SA 4.0", "CC BY 4.0", "CC0 1.0", "Public domain"].includes(credit.license)
    )
      throw Error(`Rights no longer verified: ${page.title}`);
    const name = `${page.pageid}.original`;
    let bytes = await fs.readFile(path.join(raw, name)).catch(() => null);
    let inputUrl = info.url,
      inputKind = "original";
    if (!bytes) {
      const reference = references.find((r: { title: string }) => r.title === page.title);
      if (reference) {
        bytes = await fs
          .readFile(path.join(root, `data/raw/building-references/${reference.id}.jpg`))
          .catch(() => null);
        if (bytes) {
          inputUrl = reference.image;
          inputKind = "Commons thumbnail";
        }
      }
      if (!bytes) {
        bytes = await fs.readFile(path.join(raw, `review-${page.pageid}.jpg`)).catch(() => null);
        if (bytes) {
          inputUrl = info.thumburl || info.url;
          inputKind = info.thumburl ? "Commons thumbnail" : "original";
        }
      }
    }
    const recordedInput = inputs[page.title];
    if (recordedInput && (!bytes || sha(bytes) !== recordedInput.sha256)) {
      bytes = null;
      inputUrl = recordedInput.url;
      inputKind = recordedInput.kind;
    }
    if (!bytes) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const response = await fetch(inputUrl, {
          signal: AbortSignal.timeout(60000),
          headers: { "User-Agent": "TurnRightCampus/1.0 (LASU photo attribution research)" },
        });
        if (response.ok) {
          bytes = Buffer.from(await response.arrayBuffer());
          break;
        }
        if (![429, 500, 502, 503, 504].includes(response.status))
          throw Error(`Cannot download original: ${response.status} ${page.title}`);
        const delay = Math.max(
          6000 * (attempt + 1),
          Number(response.headers.get("retry-after") || 0) * 1000,
        );
        if (delay > 60000)
          throw Error(
            `Source requests a ${delay / 1000}s pause. Retry later; no release photograph will be omitted: ${page.title}`,
          );
        await new Promise((r) => setTimeout(r, delay));
      }
      if (!bytes) throw Error(`Incomplete original download: ${page.title}`);
      if (inputKind === "original") await fs.writeFile(path.join(raw, name), bytes);
    }
    const originalSha1 = createHash("sha1").update(bytes).digest("hex");
    // MediaWiki returns a hexadecimal SHA-1 for imageinfo; never trust a truncated/resized download.
    if (inputKind === "original" && originalSha1 !== info.sha1)
      throw Error(`Original checksum changed: ${page.title}`);
    if (recordedInput && sha(bytes) !== recordedInput.sha256)
      throw Error(`Recorded source variant changed: ${page.title}`);
    inputs[page.title] = {
      url: inputUrl,
      kind: inputKind,
      sha256: sha(bytes),
      bytes: bytes.length,
    };
    const image = await photoDerivative(bytes);
    const duplicate = duplicates.get(image.sha256);
    if (duplicate) {
      candidates.push({
        ...candidate,
        status: "duplicate",
        duplicateOf: duplicate,
        reason: "Identical optimized pixels / original content.",
      });
      continue;
    }
    duplicates.set(image.sha256, candidate.id as string);
    await fs.writeFile(path.join(destination, `${image.sha256}.webp`), image.bytes);
    const photo: CampusPhoto = {
      id: candidate.id as string,
      buildingId: decision.buildingId,
      caption: decision.caption,
      alt: decision.alt,
      author: credit.author,
      sourceUrl: candidate.sourceUrl as string,
      license: credit.license as CampusPhoto["license"],
      licenseUrl: String(
        credit.licenseUrl ||
          (credit.license === "Public domain"
            ? "https://creativecommons.org/publicdomain/mark/1.0/"
            : ""),
      ).replace(/^http:/, "https:"),
      attribution: `${credit.author} · ${page.title.replace(/^File:/, "")} · ${credit.license}`,
      modifications:
        "Oriented, resized and converted to WebP; EXIF, location and other embedded metadata removed. No scene content added.",
      ...(credit.capturedAt.match(/\d{4}-\d{2}-\d{2}/)
        ? { capturedAt: credit.capturedAt.match(/\d{4}-\d{2}-\d{2}/)![0] }
        : {}),
      checkedAt: inventory.researchedAt,
      historical: !!decision.historical,
      width: image.width,
      height: image.height,
      bytes: image.bytes.length,
      sha256: image.sha256,
      url: `/packages/photos/${image.sha256}.webp`,
    };
    if (!validPhoto(photo)) throw Error(`Incomplete public photo metadata: ${page.title}`);
    catalogue.push(photo);
    candidates.push({
      ...candidate,
      status: "included",
      reason: decision.reason,
      buildingId: photo.buildingId,
      derivativeSha256: image.sha256,
      processingInput: inputs[page.title],
      bytes: photo.bytes,
      qualityReviewedAt: decision.qualityReviewedAt,
    });
  } else {
    const obviouslyUnrelated =
      !/LASU|Lagos.State.University|Senate building|School of Communication|Theater Art and Music|Enitan|Abisogun|Bola Ahmed|Post-graduate|Law.library/i.test(
        page.title + " " + credit.description,
      );
    const otherCampus = /Epe|Ikeja|LASUTH|University of Education|Oto.Ijanikin/i.test(
      page.title + " " + credit.description,
    );
    const event =
      /Wikimedia|Wikipedi|Wikiquote|training|edit.a.thon|workshop|portrait|Prof\.|Dr\.|Farmer|Ants|Food.carnival|Windmill|Sky.image|savannah|COVID|Maternity|Surgical|Nurse|landscape/i.test(
        page.title,
      );
    candidates.push({
      ...candidate,
      status:
        decision?.status ||
        (obviouslyUnrelated || otherCampus || event ? "rejected" : "awaiting evidence/permission"),
      ...(decision?.duplicateOf ? { duplicateOf: decision.duplicateOf } : {}),
      reason:
        decision?.reason ||
        (otherCampus
          ? "Outside the published LASU Ojo campus or a different institution."
          : obviouslyUnrelated
            ? "Search false positive: not an identifiable LASU Ojo building photograph."
            : event
              ? "Event, person, nature or other subject; no useful identified Ojo building view."
              : "A specific published building match and/or redistribution evidence remains unconfirmed."),
    });
  }
}
const coverage = inventory.buildings.map((b: { id: string }) => ({
  ...b,
  photoIds: catalogue.filter((p) => p.buildingId === b.id).map((p) => p.id),
  status: catalogue.some((p) => p.buildingId === b.id)
    ? "with photographs"
    : "without verified photographs",
}));
const receipts = [
  ...new Map(inventory.receipts.map((r: { file: string }) => [r.file, r])).values(),
] as { file: string }[];
const report = {
  publishedVersion: inventory.publishedVersion,
  researchedAt: inventory.researchedAt,
  before: { buildings: coverage.length, photographedBuildings: 0, photos: 0 },
  after: {
    buildings: coverage.length,
    photographedBuildings: coverage.filter((b: { photoIds: string[] }) => b.photoIds.length).length,
    photos: catalogue.length,
    bytes: catalogue.reduce((n, p) => n + p.bytes, 0),
  },
  buildings: coverage,
  candidates,
  excludedFormats: inventory.excludedFormats,
  receipts,
};
const snapshots: Record<string, string> = {};
for (const file of [...receipts.map((r) => r.file), "data/raw/published-arrival-campus.json"])
  snapshots[file] = await fs.readFile(path.join(root, file), "utf8");
await fs.writeFile(
  path.join(destination, "research/commons-responses.json.gz"),
  gzipSync(JSON.stringify(snapshots), { level: 9 }),
);
await fs.writeFile(
  path.join(destination, "catalogue.json"),
  JSON.stringify(catalogue, null, 2) + "\n",
);
await fs.writeFile(
  path.join(destination, "research/inputs.json"),
  JSON.stringify(inputs, null, 2) + "\n",
);
await fs.writeFile(
  path.join(destination, "research/commons-inventory.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report.after));
