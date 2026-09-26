import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { db, allRows } from "./cloud.mjs";
import {
  publishedCampus,
  snapshotHash,
  validateReleaseSnapshot,
} from "../web/server/release-validation";
import {preservePublished} from "../web/scripts/published-assets.mjs";
import {preserveCampusCatalogue,readPublishedCatalogue} from "../web/scripts/published-campus-catalogue.mjs";
import {activeCampus} from "../web/server/campuses";
import { prepareReleasePhotos } from './photo-release.mjs';
import { arrivalIssues } from '../web/src/arrival';
import {hydrateModelEdits} from '../web/server/model-assets';
import {modelDocumentRevision} from '../web/src/model-document-revision';
import { vercelApi, uploadSource, waitForDeployment, publishDeployment } from "./vercel-api.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  web = path.join(root, "web");
const id = process.env.RELEASE_ID,
  operation = process.env.RELEASE_OPERATION || "preview";
if (
  !id ||
  !process.env.VERCEL_TOKEN ||
  !process.env.VERCEL_PROJECT_ID ||
  !process.env.VERCEL_ORG_ID
)
  throw new Error("Release/Vercel workflow secrets are missing");
try {
  const [release] = await db(`releases?id=eq.${encodeURIComponent(id)}`);
  if (!release) throw new Error("Release not found");
  const campus = await activeCampus();
  const catalog = await readPublishedCatalogue(process.env.PUBLISHED_MAP_URL!);
  if (!release.catalogue_revision || catalog.revision !== release.catalogue_revision) throw Error('The campus directory changed. Create a fresh reviewed preview.');
  if (operation === "preview") {
    if (release.status !== "queued") throw new Error("Only queued releases can be built");
    await db(`releases?id=eq.${id}`, "PATCH", { status: "building", error: null });
    if (!release.snapshot.features.length)
      throw new Error("No approved source baseline. Run bootstrap first.");
    const manifestPath = campus.id === 'lasu' ? 'packages/latest.json' : `packages/${campus.slug}/latest.json`;
    let manifest;
    if (release.restored_from) {
      const [historical] = await db(`releases?id=eq.${release.restored_from}&status=eq.published`);
      if (!historical?.deployment_url || !historical.version) throw Error('The historical campus package is unavailable.');
      // Reuse the immutable reviewed package, but build a fresh site with the current other campuses.
      manifest = await preservePublished(path.join(web,'public'), historical.deployment_url, false, historical.version, `/packages/${historical.version}/manifest.json`);
      if (campus.id !== 'lasu' && manifest.campus?.id !== campus.id) throw Error('Historical package campus mismatch.');
      await fs.mkdir(path.dirname(path.join(web,'public',manifestPath)),{recursive:true});
      await fs.writeFile(path.join(web,'public',manifestPath),JSON.stringify(manifest,null,2));
    } else {
    const published = await publishedCampus();
    const data = validateReleaseSnapshot({...release.snapshot,edits:await hydrateModelEdits(release.snapshot.edits)}, published, {restoring:!!release.restored_from});
    for(const feature of data.map.features){const doc=feature.properties?.modelDocument;if(doc){feature.properties!.authoredModelRevision=modelDocumentRevision(doc);if(doc.curves.length)feature.properties!.surfaceCurves=doc.curves;}}
    await prepareReleasePhotos(data, root);
    data.createdAt = new Date().toISOString();
    await fs.writeFile(path.join(root, "data/release-input.json"), JSON.stringify(data));
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/build-campus-visuals.ts",
        "../data/release-input.json",
        "../data/release-visuals",
        "--reviewed",
      ],
      {
        cwd: web,
        env: process.env,
        stdio: "inherit",
        timeout: 120000,
      },
    );
    execFileSync(process.execPath, [path.join(root, "scripts/package.mjs")], {
      cwd: root,
      env: {
        ...process.env,
        CAMPUS_INPUT: "data/release-input.json",
        CAMPUS_ID: campus.id,
        CAMPUS_SLUG: campus.slug,
        CAMPUS_NAME: campus.name,
        VISUALS_INPUT: "data/release-visuals",
        RELEASE_SUMMARY: release.summary,
      },
      stdio: "inherit",
    });
    manifest = JSON.parse(await fs.readFile(path.join(web,'public',manifestPath),'utf8'));
    }
    const preserved = await preserveCampusCatalogue(path.join(web,'public'),process.env.PUBLISHED_MAP_URL!,{
      expectedRevision:release.catalogue_revision,replacement:{campus,manifest}
    });
    const packagedData = JSON.parse(await fs.readFile(path.join(web, 'public', manifest.dataUrl), 'utf8'));
    const photoIssues = arrivalIssues(packagedData);
    if (photoIssues.length) throw new Error(photoIssues.join('\n'));
    await fs.writeFile(
      path.join(web, "release-build.json"),
      JSON.stringify({ version: manifest.version, releaseId: id, campusId: campus.id, manifestPath, catalogueRevision:preserved.revision }),
    );
    const project = await vercelApi(
      `/v9/projects/${encodeURIComponent(process.env.VERCEL_PROJECT_ID!)}`,
    );
    const files = await uploadSource(root);
    const created = await vercelApi("/v13/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: project.name,
        project: project.id,
        files,
        meta: { turnrightRelease: id, turnrightVersion: manifest.version },
        projectSettings: {
          rootDirectory: "web",
          // The reviewed reference catalogue is uploaded under data/.
          sourceFilesOutsideRootDirectory: true,
          framework: "vite",
          buildCommand: "npm run build",
          outputDirectory: "dist",
          installCommand: "npm ci",
        },
      }),
    });
    // Save the deployment ID early so a timed-out build can be inspected without guessing.
    await db(`releases?id=eq.${id}`, "PATCH", {
      deployment_id: created.id,
      version: manifest.version,
      published_catalogue_revision: preserved.revision,
    });
    const deployment = await waitForDeployment(created.id);
    const url = `https://${deployment.url}`;
    await db(`releases?id=eq.${id}`, "PATCH", { status: "preview", preview_url: url });
    console.log(`Preview ready: ${url}`);
  } else if (operation === "publish") {
    if (operation === "publish" && release.status !== "preview")
      throw new Error("Review a ready preview first");
    if (!release.deployment_id) throw new Error("Deployment is missing");
    await db(`releases?id=eq.${id}`, "PATCH", { error: null });
    if (operation === "publish") {
      validateReleaseSnapshot({...release.snapshot,edits:await hydrateModelEdits(release.snapshot.edits)}, await publishedCampus(), {restoring:!!release.restored_from});
      const [features, edits] = await Promise.all([
        allRows("source_features"),
        allRows("map_edits"),
      ]);
      if (
        !release.restored_from && snapshotHash(release.snapshot.features, release.snapshot.edits) !==
        snapshotHash(features, edits)
      )
        throw new Error("Preview is stale. Create a fresh reviewed preview.");
    }
    if((await readPublishedCatalogue(process.env.PUBLISHED_MAP_URL!)).revision !== release.catalogue_revision) throw Error('Another campus changed before publication. Build a fresh preview.');
    const deployment = await publishDeployment(release.deployment_id, {
      releaseId: id,
      operation,
      onCreated: (deploymentId: string) =>
        db(`releases?id=eq.${id}`, "PATCH", {
          deployment_id: deploymentId,
          error: null,
        }),
    });
    if((await readPublishedCatalogue(process.env.PUBLISHED_MAP_URL!)).revision !== release.published_catalogue_revision) throw Error('Published campus directory verification failed. Inspect the production deployment before retrying.');
    await db(`releases?id=eq.${id}`, "PATCH", {
      status: "published",
      deployment_url: `https://${deployment.url}`,
      published_at: new Date().toISOString(),
      error: null,
    });
    console.log("Production release and domain assignment verified.");
  } else throw new Error("Unknown release operation");
} catch (error) {
  const message = (error as Error).message;
  await db(
    `releases?id=eq.${id}`,
    "PATCH",
    operation === "preview" ? { status: "failed", error: message } : { error: message },
  ).catch(() => {});
  console.error(message);
  process.exitCode = 1;
}
