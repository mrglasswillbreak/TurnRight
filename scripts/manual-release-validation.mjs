/** Full local release evidence. This command never submits, approves or publishes. */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { coverageSnapshot } from './coverage-scope.mjs';
import { root } from './toolchain.mjs';
import {
  manualValidationGates,
  manualValidationEnvironment,
} from './manual-release-gates.mjs';

export const validationKind = 'turnright-manual-validation';
export const validationPolicyVersion = 1;
const digest = (value) => createHash('sha256').update(value).digest('hex');
export const validationPolicyHash = digest(
  JSON.stringify(manualValidationGates),
);
const identityFields = [
  'commit',
  'tree',
  'sourceSnapshot',
  'dependencySnapshot',
  'coverageSnapshot',
];
const same = (a, b) => identityFields.every((key) => a?.[key] === b?.[key]);

function validIdentity(identity) {
  return (
    identity &&
    Object.keys(identity).length === identityFields.length &&
    identityFields.every((key) =>
      new RegExp(
        `^[a-f0-9]{${['commit', 'tree'].includes(key) ? 40 : 64}}$`,
      ).test(identity[key]),
    )
  );
}

export function assertManualValidationReceipt(receipt, expectedIdentity) {
  if (
    !validIdentity(expectedIdentity) ||
    !validIdentity(receipt?.identity) ||
    !validIdentity(receipt?.finalIdentity) ||
    !same(receipt.identity, expectedIdentity) ||
    !same(receipt.finalIdentity, expectedIdentity)
  )
    throw Error('MANUAL_VALIDATION_IDENTITY');
  if (
    receipt.kind !== validationKind ||
    receipt.schemaVersion !== 1 ||
    receipt.policyVersion !== validationPolicyVersion ||
    receipt.policyHash !== validationPolicyHash ||
    receipt.status !== 'passed' ||
    !Number.isFinite(Date.parse(receipt.startedAt)) ||
    !Number.isFinite(Date.parse(receipt.completedAt)) ||
    Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt)
  )
    throw Error('MANUAL_VALIDATION_RECEIPT');
  if (
    !Array.isArray(receipt.gates) ||
    receipt.gates.length !== manualValidationGates.length ||
    receipt.gates.some(
      (gate, index) =>
        gate.id !== manualValidationGates[index].id ||
        gate.status !== 'passed' ||
        gate.exitCode !== 0 ||
        gate.signal !== null ||
        gate.commandHash !==
          digest(JSON.stringify(manualValidationGates[index].command)) ||
        !Number.isFinite(Date.parse(gate.startedAt)) ||
        !Number.isFinite(Date.parse(gate.completedAt)) ||
        Date.parse(gate.completedAt) < Date.parse(gate.startedAt) ||
        gate.log?.path !== `${gate.id}.log` ||
        !/^[a-f0-9]{64}$/.test(gate.log.sha256) ||
        !Number.isSafeInteger(gate.log.bytes) ||
        gate.log.bytes < 0,
    )
  )
    throw Error('MANUAL_VALIDATION_GATES');
  const thresholds = { statements: 80, lines: 80, functions: 80, branches: 70 };
  if (
    receipt.coverage?.snapshot !== expectedIdentity.coverageSnapshot ||
    Object.entries(thresholds).some(([key, value]) => {
      const metric = receipt.coverage?.summary?.[key];
      return (
        !metric ||
        !Number.isFinite(metric.pct) ||
        metric.pct < value ||
        metric.pct > 100 ||
        !Number.isSafeInteger(metric.total) ||
        metric.total <= 0 ||
        !Number.isSafeInteger(metric.covered) ||
        metric.covered < 0 ||
        metric.covered > metric.total ||
        (metric.covered / metric.total) * 100 < value ||
        metric.pct > (metric.covered / metric.total) * 100 + 0.01
      );
    })
  )
    throw Error('MANUAL_VALIDATION_COVERAGE');
  return receipt;
}

/** Dependency injection is only for unit tests; the CLI always uses fixed gates. */
export async function runManualValidation(expectedCommit, dependencies) {
  if (!/^[a-f0-9]{40}$/.test(expectedCommit))
    throw Error('MANUAL_VALIDATION_COMMIT');
  const receipt = {
    schemaVersion: 1,
    kind: validationKind,
    policyVersion: validationPolicyVersion,
    policyHash: validationPolicyHash,
    status: 'running',
    startedAt: dependencies.now(),
    gates: [],
  };
  try {
    receipt.identity = await dependencies.identity();
    if (
      !validIdentity(receipt.identity) ||
      receipt.identity.commit !== expectedCommit
    )
      throw Error('MANUAL_VALIDATION_IDENTITY');
    await dependencies.save(receipt);
    for (const gate of manualValidationGates) {
      const record = {
        id: gate.id,
        commandHash: digest(JSON.stringify(gate.command)),
        status: 'running',
        startedAt: dependencies.now(),
      };
      receipt.gates.push(record);
      await dependencies.save(receipt);
      const result = await dependencies.run(gate);
      Object.assign(record, result, {
        completedAt: dependencies.now(),
        status:
          result.exitCode === 0 && result.signal === null ? 'passed' : 'failed',
      });
      await dependencies.save(receipt);
      if (record.status !== 'passed')
        throw Error('MANUAL_VALIDATION_GATE_FAILED');
    }
    receipt.finalIdentity = await dependencies.identity();
    receipt.coverage = await dependencies.coverage();
    receipt.completedAt = dependencies.now();
    receipt.status = 'passed';
    assertManualValidationReceipt(receipt, receipt.identity);
    await dependencies.save(receipt);
    return receipt;
  } catch (error) {
    receipt.status = 'failed';
    receipt.completedAt = dependencies.now();
    const active = receipt.gates.at(-1);
    if (active?.status === 'running')
      Object.assign(active, {
        status: 'failed',
        completedAt: receipt.completedAt,
        exitCode: null,
        signal: 'EXECUTION_FAILED',
      });
    receipt.error = /^MANUAL_VALIDATION_[A-Z_]+$/.test(error?.message)
      ? error.message
      : 'MANUAL_VALIDATION_EXECUTION_FAILED';
    await dependencies.save(receipt);
    throw error;
  }
}

export function manualValidationArguments(args) {
  if (
    args.length !== 4 ||
    args[0] !== '--expected-commit' ||
    !/^[a-f0-9]{40}$/.test(args[1]) ||
    args[2] !== '--output' ||
    !path.isAbsolute(args[3])
  )
    throw Error(
      'Use --expected-commit <full SHA> --output <new absolute private directory>.',
    );
  return { expectedCommit: args[1], output: path.resolve(args[3]) };
}

const git = (...args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: manualValidationEnvironment(process.env),
    timeout: 30_000,
    maxBuffer: 64 * 1024 * 1024,
  }).trim();

export async function currentManualValidationIdentity() {
  if (
    git('status', '--porcelain=v1', '--untracked-files=all') ||
    git('rev-parse', '--is-shallow-repository') !== 'false'
  )
    throw Error('MANUAL_VALIDATION_CLEAN_HISTORY');
  const files = git('ls-files', '-z').split('\0').filter(Boolean).sort();
  const source = createHash('sha256'),
    dependencies = createHash('sha256');
  for (const file of files) {
    const bytes = await fs.readFile(path.join(root, file));
    source.update(file).update('\0').update(bytes).update('\0');
    if (
      /package(?:-lock)?\.json$|requirements[^/]*\.(?:lock|txt|in)$|Dockerfile$|\.node-version$|pyproject\.toml$/.test(
        file,
      )
    )
      dependencies.update(file).update('\0').update(bytes).update('\0');
  }
  return {
    commit: git('rev-parse', 'HEAD'),
    tree: git('rev-parse', 'HEAD^{tree}'),
    sourceSnapshot: source.digest('hex'),
    dependencySnapshot: dependencies.digest('hex'),
    coverageSnapshot: await coverageSnapshot(),
  };
}

async function fileEvidence(filename) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(filename)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { path: path.basename(filename), bytes, sha256: hash.digest('hex') };
}

async function executeGate(gate, output, environment) {
  const logFile = path.join(output, `${gate.id}.log`);
  const log = createWriteStream(logFile, { flags: 'wx', mode: 0o600 });
  const child = spawn(gate.command[0], gate.command.slice(1), {
    cwd: root,
    env: {
      ...environment,
      ...(gate.id === 'unit-coverage'
        ? { CAMPUS_ID: 'ci-non-default-campus' }
        : {}),
    },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bytes = 0,
    timedOut = false,
    logError = false,
    killing;
  const stop = () => {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* Already exited. */
    }
    killing ||= setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* Exited. */
      }
    }, 15_000);
  };
  const timer = setTimeout(() => {
    timedOut = true;
    stop();
  }, gate.timeoutMs);
  const interrupt = () => {
    timedOut = true;
    stop();
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  log.on('error', () => {
    logError = true;
    stop();
  });
  const write = (chunk) => {
    bytes += chunk.length;
    if (bytes > 128 * 1024 * 1024) {
      logError = true;
      stop();
      return;
    }
    log.write(chunk);
  };
  child.stdout.on('data', write);
  child.stderr.on('data', write);
  const result = await new Promise((resolve) => {
    child.once('error', () =>
      resolve({ exitCode: null, signal: 'SPAWN_ERROR' }),
    );
    child.once('close', (exitCode, signal) => resolve({ exitCode, signal }));
  });
  clearTimeout(timer);
  clearTimeout(killing);
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
  await new Promise((resolve) => log.end(resolve));
  return {
    ...result,
    ...(timedOut ? { exitCode: null, signal: 'TIMEOUT_OR_INTERRUPTION' } : {}),
    ...(logError ? { exitCode: null, signal: 'LOG_FAILURE' } : {}),
    log: await fileEvidence(logFile),
  };
}

async function main() {
  if (process.platform !== 'linux')
    throw Error('Local release validation requires Linux/WSL2.');
  const { expectedCommit, output } = manualValidationArguments(
    process.argv.slice(2),
  );
  const relativeOutput = path.relative(root, output);
  if (
    !relativeOutput.startsWith('..' + path.sep) &&
    !path.isAbsolute(relativeOutput) &&
    !relativeOutput.startsWith('.local-runtime' + path.sep)
  )
    throw Error(
      'Validation output must be outside the checkout or under ignored .local-runtime.',
    );
  for (const folder of [root, path.join(root, 'web')]) {
    if (
      (await fs.readdir(folder)).some(
        (file) => /^\.env(?:\.|$)/.test(file) && file !== '.env.example',
      )
    )
      throw Error('MANUAL_VALIDATION_LOCAL_CONFIGURATION');
  }
  for (const name of [
    'web/release-build.json',
    'web/coverage/unit/receipt.json',
    'web/coverage/browser-receipt.json',
    '.local-runtime/services.json',
    '.local-runtime/accounts.json',
  ]) {
    if (await fs.stat(path.join(root, name)).catch(() => null))
      throw Error('MANUAL_VALIDATION_FRESH_CHECKOUT');
  }
  await fs.mkdir(output, { mode: 0o700 });
  const environment = manualValidationEnvironment(process.env);
  environment.PATH =
    path.join(root, '.local-runtime/manual-python/bin') +
    ':' +
    environment.PATH;
  await runManualValidation(expectedCommit, {
    now: () => new Date().toISOString(),
    identity: currentManualValidationIdentity,
    run: async (gate) => {
      console.log(`Starting ${gate.id}`);
      return executeGate(gate, output, environment);
    },
    save: async (receipt) => {
      const temporary = path.join(output, 'receipt.tmp');
      await fs.writeFile(temporary, JSON.stringify(receipt, null, 2) + '\n', {
        mode: 0o600,
      });
      await fs.rename(temporary, path.join(output, 'receipt.json'));
    },
    coverage: async () => ({
      snapshot: await coverageSnapshot(),
      summary: JSON.parse(
        await fs.readFile(
          path.join(root, 'web/coverage/combined/coverage-summary.json'),
          'utf8',
        ),
      ).total,
    }),
  });
  console.log(
    'All local validation gates passed. No review or publication was requested.',
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
