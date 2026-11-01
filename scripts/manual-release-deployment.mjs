/** Manual publication requires observed deployment provenance, including new releases. */
import { assertDeploymentSource } from './release-source-revision.mjs';
import { requireManual } from './manual-release-request.mjs';

export function manualDeploymentProvenance(deployment, expectedMainCommit) {
  requireManual(
    typeof expectedMainCommit === 'string' &&
      /^[a-f0-9]{40}$/.test(expectedMainCommit),
    'DEPLOYMENT_SOURCE_REQUIRED',
  );
  assertDeploymentSource(deployment, expectedMainCommit);
  return {
    commit: deployment.meta.turnrightSourceRevision,
    deploymentId: deployment.id,
    projectId: deployment.projectId,
    origin: 'https://' + deployment.url,
  };
}

export function assertObservedPreviewSource(request, observed) {
  requireManual(
    observed?.commit === request.expectedMainCommit &&
      observed.deploymentId === request.release.deploymentId &&
      observed.origin === request.release.origin &&
      typeof observed.projectId === 'string' &&
      observed.projectId.length > 0,
    'OBSERVED_PREVIEW_SOURCE',
  );
  return {
    commit: observed.commit,
    deploymentId: observed.deploymentId,
    projectId: observed.projectId,
    origin: observed.origin,
  };
}
