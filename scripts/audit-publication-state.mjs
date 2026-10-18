import { mkdir, writeFile } from 'node:fs/promises';
import { db } from './cloud.mjs';
import { vercelApi } from './vercel-api.mjs';
import { readPublishedCatalogue } from '../web/scripts/published-campus-catalogue.mjs';

// Read only: no deployment, credential generation, lease or database mutation.
// Export bounded release metadata, never snapshots, identities or credentials.
const result = {
  recordedAt: new Date().toISOString(),
  readOnly: true,
  campuses: [],
};
const campuses = await db('campuses?select=id,slug&slug=in.(lasu,unilag)');
for (const campus of campuses) {
  process.env.CAMPUS_ID = campus.id;
  const releases = await db(
    'releases?select=id,status,summary,version,review_id,catalogue_revision,published_catalogue_revision,deployment_id,preview_url,deployment_url,error,created_at,published_at&order=created_at.desc&limit=6',
  );
  const records = [];
  for (const release of releases) {
    const review = release.review_id
      ? await db(
          `gis_reviews?id=eq.${release.review_id}&select=id,status,content_hash,reviewed_at`,
        )
      : [];
    const jobs = await db(
      `jobs?kind=like.release:${release.id}:*&select=id,kind,status,message,created_at,completed_at&order=created_at.desc&limit=5`,
    );
    const audit = await db(
      `workspace_audit?subject=eq.${release.id}&select=action,created_at,details&order=id.desc&limit=10`,
    );
    let deployment;
    if (release.deployment_id) {
      try {
        const d = await vercelApi(
          `/v13/deployments/${encodeURIComponent(release.deployment_id)}`,
        );
        deployment = {
          id: d.id,
          url: d.url,
          projectId: d.projectId,
          target: d.target,
          readyState: d.readyState,
          aliasAssigned: d.aliasAssigned,
          meta: {
            turnrightPromotion: d.meta?.turnrightPromotion,
            turnrightPreview: d.meta?.turnrightPreview,
            turnrightRelease: d.meta?.turnrightRelease,
            turnrightVersion: d.meta?.turnrightVersion,
          },
        };
      } catch (error) {
        if (!error.message.startsWith('Vercel 404:')) throw error;
        deployment = { id: release.deployment_id, unavailable: 'not-found' };
      }
    }
    records.push({ release, review: review[0], jobs, audit, deployment });
  }
  const leases = await db(
    `gis_publication_leases?campus_id=eq.${campus.id}&select=campus_id,release_id,expires_at`,
  );
  result.campuses.push({ slug: campus.slug, releases: records, leases });
}
const project = await vercelApi(
  `/v9/projects/${encodeURIComponent(process.env.VERCEL_PROJECT_ID)}`,
);
const production = project.targets?.production;
result.production = production && {
  id: production.id,
  url: production.url,
  readyState: production.readyState,
  meta: {
    turnrightPromotion: production.meta?.turnrightPromotion,
    turnrightPreview: production.meta?.turnrightPreview,
  },
};
result.catalogue = await readPublishedCatalogue(process.env.PUBLISHED_MAP_URL);
await mkdir('web/work/release-readiness', { recursive: true });
await writeFile(
  'web/work/release-readiness/publication-state.json',
  JSON.stringify(result, null, 2) + '\n',
);
console.log('Read-only publication state captured for both campuses.');
