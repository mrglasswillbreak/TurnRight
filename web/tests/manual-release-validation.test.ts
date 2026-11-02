import { expect, it, vi } from 'vitest';
import path from 'node:path';
import {
  assertManualValidationHost,
  assertManualValidationReceipt,
  manualValidationArguments,
  runManualValidation,
} from '../../scripts/manual-release-validation.mjs';
import {
  manualValidationEnvironment,
  manualValidationGates,
} from '../../scripts/manual-release-gates.mjs';

const sha = 'a'.repeat(40);
const identity = {
  commit: sha,
  tree: 'b'.repeat(40),
  sourceSnapshot: 'c'.repeat(64),
  dependencySnapshot: 'd'.repeat(64),
  coverageSnapshot: 'e'.repeat(64),
};
const metric = { total: 100, covered: 90, skipped: 0, pct: 90 };
function harness() {
  const receipts: Array<Record<string, unknown>> = [];
  const dependencies = {
    now: () => '2026-11-01T12:00:00.000Z',
    identity: vi.fn(async () => ({ ...identity })),
    run: vi.fn(async (gate: { id: string }) => ({
      exitCode: 0 as number | null,
      signal: null as string | null,
      log: { path: `${gate.id}.log`, bytes: 123, sha256: 'f'.repeat(64) },
    })),
    save: vi.fn(async (receipt: Record<string, unknown>) => {
      receipts.push(structuredClone(receipt));
    }),
    coverage: vi.fn(async () => ({
      snapshot: identity.coverageSnapshot,
      summary: Object.fromEntries(
        ['statements', 'lines', 'functions', 'branches'].map((key) => [
          key,
          { ...metric },
        ]),
      ),
    })),
  };
  return { dependencies, receipts };
}

it('accepts an ordinary Linux host UID for native worker ownership checks', () => {
  expect(() => assertManualValidationHost('linux', 1000, 1000)).not.toThrow();
});

it.each([
  [0, 0],
  [0, 1000],
  [1000, 0],
  [undefined, 1000],
  [1000, undefined],
])(
  'rejects root or unavailable host identities (%s, %s)',
  (uid, effectiveUid) => {
    expect(() =>
      assertManualValidationHost('linux', uid, effectiveUid),
    ).toThrow('ordinary host UID');
  },
);

it.each(['win32', 'darwin'])(
  'rejects unsupported validation hosts even with an ordinary UID: %s',
  (platform) => {
    expect(() => assertManualValidationHost(platform, 1000, 1000)).toThrow(
      'Linux/WSL2',
    );
  },
);

it('executes every fixed gate sequentially and saves pending evidence before execution', async () => {
  const { dependencies, receipts } = harness();
  dependencies.run.mockImplementation(async (gate) => {
    const latest = receipts.at(-1)!;
    expect(latest.status).toBe('running');
    const gates = latest.gates as Array<{ id: string; status: string }>;
    expect(gates.at(-1)).toMatchObject({ id: gate.id, status: 'running' });
    return {
      exitCode: 0,
      signal: null,
      log: { path: `${gate.id}.log`, bytes: 123, sha256: 'f'.repeat(64) },
    };
  });
  const receipt = await runManualValidation(sha, dependencies);
  expect(dependencies.run.mock.calls.map(([gate]) => gate.id)).toEqual(
    manualValidationGates.map((gate) => gate.id),
  );
  expect(dependencies.identity).toHaveBeenCalledTimes(2);
  expect(assertManualValidationReceipt(receipt, identity)).toBe(receipt);
  expect(receipts.at(-1)?.status).toBe('passed');
});

it.each([
  { exitCode: 1, signal: null },
  { exitCode: null, signal: 'SIGTERM' },
  { exitCode: 0, signal: 'TIMEOUT_OR_INTERRUPTION' },
  { exitCode: null, signal: 'SPAWN_ERROR' },
])('stops after a failed or interrupted gate: %j', async (failure) => {
  const { dependencies, receipts } = harness();
  dependencies.run.mockResolvedValueOnce({
    ...failure,
    log: { path: 'toolchain.log', bytes: 1, sha256: 'f'.repeat(64) },
  });
  await expect(runManualValidation(sha, dependencies)).rejects.toThrow(
    'MANUAL_VALIDATION_GATE_FAILED',
  );
  expect(dependencies.run).toHaveBeenCalledTimes(1);
  expect(dependencies.coverage).not.toHaveBeenCalled();
  expect(receipts.at(-1)).toMatchObject({ status: 'failed' });
  expect(receipts.some((receipt) => receipt.status === 'passed')).toBe(false);
});

it('does not execute a command if its durable pending receipt cannot be saved', async () => {
  const { dependencies } = harness();
  dependencies.save
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(Error('disk unavailable'));
  await expect(runManualValidation(sha, dependencies)).rejects.toThrow(
    'disk unavailable',
  );
  expect(dependencies.run).not.toHaveBeenCalled();
});

it('rejects a different initial commit before any test', async () => {
  const { dependencies } = harness();
  await expect(
    runManualValidation('0'.repeat(40), dependencies),
  ).rejects.toThrow('MANUAL_VALIDATION_IDENTITY');
  expect(dependencies.run).not.toHaveBeenCalled();
});

it.each([
  'commit',
  'tree',
  'sourceSnapshot',
  'dependencySnapshot',
  'coverageSnapshot',
])('rejects %s changes during validation', async (field) => {
  const { dependencies, receipts } = harness();
  dependencies.identity
    .mockResolvedValueOnce({ ...identity })
    .mockResolvedValueOnce({
      ...identity,
      [field]: '0'.repeat(field === 'commit' || field === 'tree' ? 40 : 64),
    });
  await expect(runManualValidation(sha, dependencies)).rejects.toThrow(
    'MANUAL_VALIDATION_IDENTITY',
  );
  expect(receipts.at(-1)?.status).toBe('failed');
});

it.each(['statements', 'lines', 'functions', 'branches'])(
  'rejects insufficient combined %s coverage',
  async (field) => {
    const { dependencies } = harness();
    const coverage = await dependencies.coverage();
    coverage.summary[field].pct = field === 'branches' ? 69.99 : 79.99;
    dependencies.coverage.mockResolvedValue(coverage);
    await expect(runManualValidation(sha, dependencies)).rejects.toThrow(
      'MANUAL_VALIDATION_COVERAGE',
    );
  },
);

it('rejects a stale coverage snapshot even after successful command exits', async () => {
  const { dependencies } = harness();
  const coverage = await dependencies.coverage();
  dependencies.coverage.mockResolvedValue({
    ...coverage,
    snapshot: '0'.repeat(64),
  });
  await expect(runManualValidation(sha, dependencies)).rejects.toThrow(
    'MANUAL_VALIDATION_COVERAGE',
  );
});

it('rejects missing, duplicated, reordered or forged successful gate receipts', async () => {
  const { dependencies } = harness();
  const receipt = await runManualValidation(sha, dependencies);
  type RecordedGate = {
    commandHash: string;
    log: { path: string; bytes: number; sha256: string };
  };
  const recordedGates: RecordedGate[] = receipt.gates;
  for (const alter of [
    (gates: RecordedGate[]) => gates.slice(1),
    (gates: RecordedGate[]) => [...gates.slice(0, -1), gates[0]],
    (gates: RecordedGate[]) => [...gates].reverse(),
    (gates: RecordedGate[]) =>
      gates.map((gate, index) =>
        index ? gate : { ...gate, commandHash: '0'.repeat(64) },
      ),
    (gates: RecordedGate[]) =>
      gates.map((gate, index) =>
        index ? gate : { ...gate, log: { ...gate.log, sha256: 'unverified' } },
      ),
  ]) {
    expect(() =>
      assertManualValidationReceipt(
        { ...receipt, gates: alter(recordedGates) },
        identity,
      ),
    ).toThrow('MANUAL_VALIDATION_GATES');
  }
  expect(() =>
    assertManualValidationReceipt(
      { ...receipt, policyHash: '0'.repeat(64) },
      identity,
    ),
  ).toThrow('MANUAL_VALIDATION_RECEIPT');
  expect(() =>
    assertManualValidationReceipt({ ...receipt, status: 'running' }, identity),
  ).toThrow('MANUAL_VALIDATION_RECEIPT');
});

it('accepts only a full immutable revision and a new absolute receipt location', () => {
  const output = path.resolve('manual-validation-test-receipt');
  expect(
    manualValidationArguments(['--expected-commit', sha, '--output', output]),
  ).toEqual({ expectedCommit: sha, output });
  for (const args of [
    ['--expected-commit', 'main', '--output', '/tmp/receipt'],
    ['--expected-commit', sha, '--output', 'relative'],
    [
      '--expected-commit',
      sha,
      '--output',
      '/tmp/receipt',
      '--skip',
      'coverage',
    ],
    [
      '--expected-commit',
      sha,
      '--output',
      '/tmp/receipt',
      '--grep',
      'one test',
    ],
  ])
    expect(() => manualValidationArguments(args)).toThrow();
});

it('removes production credentials, inherited skips and runtime injection options', () => {
  const environment = manualValidationEnvironment({
    PATH: '/trusted/bin',
    HOME: '/home/validator',
    LANG: 'C.UTF-8',
    SUPABASE_SERVICE_ROLE_KEY: 'private',
    VERCEL_TOKEN: 'private',
    GH_TOKEN: 'private',
    GITHUB_WORKFLOW_TOKEN: 'private',
    NODE_OPTIONS: '--require untrusted.js',
    AUDIT_GREP: 'one test',
    TURNRIGHT_COVERAGE: '0',
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    PUBLISHED_MAP_URL: 'https://production.invalid',
  });
  expect(environment).toEqual({
    PATH: '/trusted/bin',
    HOME: '/home/validator',
    LANG: 'C.UTF-8',
    CI: 'true',
    GOMEMLIMIT: '256MiB',
    GOMAXPROCS: '2',
    PYTHONDONTWRITEBYTECODE: '1',
  });
});

it('keeps complete browser, native, security and fresh-stack gates without selection flags', () => {
  expect(manualValidationGates.map((gate) => gate.id)).toEqual([
    'toolchain',
    'dependencies',
    'linux-prerequisites',
    'unit-coverage',
    'quality',
    'dependency-audit',
    'configured-build',
    'python-lint',
    'python-tests',
    'chromium-coverage',
    'webkit',
    'webkit-photos',
    'offline',
    'offline-photos',
    'combined-coverage',
    'bounded-import',
    'native-postgis',
    'isolated-engine',
    'gis-import',
    'local-stack',
    'python-audit',
    'secret-history',
    'static-analysis',
    'production-build',
  ]);
  expect(
    manualValidationGates.flatMap((gate) => gate.command).join(' '),
  ).not.toMatch(/--(?:grep|shard|pass-with-no-tests|ignore-scripts)/);
});
