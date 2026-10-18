// Recovery never promotes a deployment again: verify the already-live package
// and its exact Vercel receipt, then finish through the same SQL approval guard.
export function publicationMode(release, catalogueRevision) {
  if (
    !release.deployment_id ||
    !release.review_id ||
    !release.version ||
    !release.catalogue_revision ||
    !release.published_catalogue_revision
  )
    throw Error('A complete reviewed preview is required');
  if (catalogueRevision === release.published_catalogue_revision) {
    if (release.status === 'preview') return 'reconcile';
    if (release.status === 'published') return 'complete';
  }
  if (
    release.status === 'preview' &&
    catalogueRevision === release.catalogue_revision
  )
    return 'promote';
  throw Error('The campus directory changed. Create a fresh reviewed preview.');
}

export async function publishReviewedRelease(
  release,
  {
    db,
    readCatalogue,
    validateSnapshot,
    promote,
    verifyCurrent,
    progress = async () => {},
  },
) {
  const mode = publicationMode(release, (await readCatalogue()).revision);
  if (mode === 'complete') {
    const deployment = await verifyCurrent(release.deployment_id, {
      releaseId: release.id,
    });
    if (
      (await readCatalogue()).revision !== release.published_catalogue_revision
    )
      throw Error('Production changed during verification');
    return deployment;
  }
  let lease;
  try {
    await progress(
      'Checking exact review approval and acquiring publication lease',
    );
    lease = await db(
      'rpc/gis_begin_publication',
      'POST',
      { release_identity: release.id },
      'return=representation',
      75000,
    );
    if (typeof lease !== 'string' || !lease)
      throw Error('Publication lease was not returned');
    await validateSnapshot();
    const expectedBefore =
      mode === 'promote'
        ? release.catalogue_revision
        : release.published_catalogue_revision;
    if ((await readCatalogue()).revision !== expectedBefore)
      throw Error(
        'Another campus changed before publication. Build a fresh preview.',
      );
    const saveDeployment = (deploymentId) =>
      db(
        `releases?id=eq.${release.id}`,
        'PATCH',
        {
          deployment_id: deploymentId,
          error: null,
        },
        'return=minimal',
      );
    await progress(
      mode === 'promote'
        ? 'Publishing reviewed preview and verifying production'
        : 'Verifying the already-live production deployment',
    );
    const deployment =
      mode === 'promote'
        ? await promote(release.deployment_id, {
            releaseId: release.id,
            operation: 'publish',
            onCreated: saveDeployment,
          })
        : await verifyCurrent(release.deployment_id, { releaseId: release.id });
    if (
      (await readCatalogue()).revision !== release.published_catalogue_revision
    )
      throw Error(
        'Published campus directory verification failed. Inspect production before retrying.',
      );
    if (mode === 'reconcile' && deployment.id !== release.deployment_id)
      await saveDeployment(deployment.id);
    await progress('Recording verified publication with the approved snapshot');
    const receipt = await db(
      'rpc/gis_complete_publication',
      'POST',
      {
        release_identity: release.id,
        lease_token: lease,
        deployment_identity: deployment.id,
        deployment_origin: `https://${deployment.url}`,
      },
      'return=representation',
      75000,
    );
    if (
      receipt?.id !== release.id ||
      receipt.status !== 'published' ||
      receipt.version !== release.version ||
      receipt.deployment_id !== deployment.id ||
      receipt.deployment_url !== `https://${deployment.url}`
    )
      throw Error(
        'Publication completion receipt mismatch. Inspect production before retrying.',
      );
    return deployment;
  } finally {
    if (lease)
      await db('rpc/gis_end_publication', 'POST', {
        release_identity: release.id,
        lease_token: lease,
      }).catch(() => {});
  }
}
