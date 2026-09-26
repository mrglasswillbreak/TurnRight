import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preserveCampusCatalogue, catalogueRevision } from "./published-campus-catalogue.mjs";
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.env.VERCEL && process.env.SOURCE_REDISTRIBUTION_APPROVED !== "true")
  throw new Error(
    "ArcGIS redistribution permission is unconfirmed. Complete the source-rights check in docs/DEPLOYMENT.md before deployment.",
  );
const release = await fs
  .readFile(path.join(web, "release-build.json"), "utf8")
  .then(JSON.parse)
  .catch(() => null);
if (release) {
  const manifest = JSON.parse(
    await fs.readFile(path.join(web, "public", release.manifestPath || "packages/latest.json"), "utf8"),
  );
  if(release.catalogueRevision) {
    const catalogue = JSON.parse(await fs.readFile(path.join(web,'public/packages/campuses.json'),'utf8'));
    if(catalogueRevision(catalogue)!==release.catalogueRevision)throw Error('Frozen campus catalogue changed during deployment');
  }
  if (manifest.version !== release.version)
    throw new Error("Frozen release manifest changed during deployment");
} else if (process.env.PUBLISHED_MAP_URL) {
  const result = await preserveCampusCatalogue(
    path.join(web, "public"),
    process.env.PUBLISHED_MAP_URL,
  );
  console.log(`Preserved ${result.catalogue.campuses.length} published campus packages for this code build.`);
}
