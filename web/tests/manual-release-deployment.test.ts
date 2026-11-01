import { expect, it } from 'vitest';
import {
  manualDeploymentProvenance,
  assertObservedPreviewSource,
} from '../../scripts/manual-release-deployment.mjs';
import { localReleaseEnvironment } from '../../scripts/manual-release-provenance.mjs';
import { assertManualComparisonReceipt } from '../../scripts/manual-release-verification.mjs';

const commit = 'a'.repeat(40);
const deployment = {
  id: 'dpl_preview',
  projectId: 'project',
  url: 'preview.vercel.app',
  meta: { turnrightSourceRevision: commit },
};
const request = {
  expectedMainCommit: commit,
  localRunId: '11111111-1111-4111-8111-111111111111',
  release: { deploymentId: deployment.id, origin: 'https://' + deployment.url },
};

it('requires the exact validated commit even when historical deployments permit missing provenance', () => {
  expect(manualDeploymentProvenance(deployment, commit)).toEqual({
    commit,
    deploymentId: deployment.id,
    projectId: deployment.projectId,
    origin: request.release.origin,
  });
  for (const meta of [{}, { turnrightSourceRevision: 'b'.repeat(40) }])
    expect(() =>
      manualDeploymentProvenance({ ...deployment, meta }, commit),
    ).toThrow();
  for (const expected of [undefined, null, '', 'short'])
    expect(() => manualDeploymentProvenance(deployment, expected)).toThrow(
      'SOURCE_REQUIRED',
    );
});

it('records observed deployment provenance and rejects mismatched verification identities', () => {
  const observed = manualDeploymentProvenance(deployment, commit);
  expect(assertObservedPreviewSource(request, observed)).toEqual(observed);
  for (const changed of [
    undefined,
    { ...observed, commit: 'b'.repeat(40) },
    { ...observed, deploymentId: 'dpl_other' },
    { ...observed, origin: 'https://other.vercel.app' },
    { ...observed, projectId: '' },
  ])
    expect(() => assertObservedPreviewSource(request, changed)).toThrow(
      'OBSERVED_PREVIEW_SOURCE',
    );
});

it('binds the recorded observation to the later live deployment readback', () => {
  const current = {
    sourceCommit: commit,
    sourceProvenance: manualDeploymentProvenance(deployment, commit),
    localRunId: request.localRunId,
  };
  const prior = {
    ...current,
    localRunId: '22222222-2222-4222-8222-222222222222',
  };
  expect(() =>
    assertManualComparisonReceipt(prior, current, request),
  ).not.toThrow();
  expect(() =>
    assertManualComparisonReceipt(
      { ...prior, sourceProvenance: undefined },
      current,
      request,
    ),
  ).toThrow('COMPARISON_BINDING');
  expect(() =>
    assertManualComparisonReceipt(
      {
        ...prior,
        sourceProvenance: {
          ...prior.sourceProvenance,
          commit: 'b'.repeat(40),
        },
      },
      current,
      request,
    ),
  ).toThrow('COMPARISON_BINDING');
});

it('removes inherited browser, protocol, Node and TLS diagnostic logging switches', () => {
  const switches = [
    'DEBUG',
    'PWDEBUG',
    'NODE_DEBUG',
    'NODE_DEBUG_NATIVE',
    'DEBUG_COLORS',
    'DEBUG_DEPTH',
    'DEBUG_SHOW_HIDDEN',
    'DEBUG_HIDE_DATE',
    'PW_LOG_NAME',
    'PW_API_TO_IMPL_LOG',
    'PLAYWRIGHT_DEBUG',
    'PLAYWRIGHT_DEBUG_LOG',
    'PLAYWRIGHT_TRACE',
    'SSLKEYLOGFILE',
  ];
  const environment = {
    ...Object.fromEntries(switches.map((name) => [name, '*'])),
    PATH: '/bin',
    SUPABASE_SERVICE_ROLE_KEY: 'private',
    PLAYWRIGHT_BROWSERS_PATH: '/browsers',
  };
  const clean = localReleaseEnvironment(environment, request);
  for (const name of switches) expect(clean[name]).toBeUndefined();
  expect(clean.PLAYWRIGHT_BROWSERS_PATH).toBe('/browsers');
  expect(clean.SUPABASE_SERVICE_ROLE_KEY).toBe('private');
});
