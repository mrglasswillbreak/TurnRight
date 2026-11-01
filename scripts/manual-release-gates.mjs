/** Fixed local equivalents of the CI, GIS, security and production-build gates. */
export const manualValidationGates = Object.freeze(
  [
    ['toolchain', ['npm', 'run', 'doctor', '--', '--full'], 2],
    ['dependencies', ['npm', 'ci'], 20],
    [
      'linux-prerequisites',
      ['bash', 'scripts/manual-validation-linux.sh', 'setup'],
      30,
    ],
    ['unit-coverage', ['npm', 'run', 'test:coverage:unit'], 35],
    ['quality', ['npm', 'run', 'check'], 20],
    ['dependency-audit', ['npm', 'run', 'check:dependencies'], 10],
    ['configured-build', ['npm', 'run', 'check:configured-build'], 10],
    ['python-lint', ['npm', 'run', 'lint:python'], 5],
    ['python-tests', ['npm', 'run', 'test:python'], 10],
    ['chromium-coverage', ['npm', 'run', 'test:coverage:browser'], 360],
    [
      'webkit',
      [
        'npm',
        'exec',
        '--workspace',
        'web',
        '--',
        'playwright',
        'test',
        '--config',
        'playwright.webkit.config.ts',
        '--workers=1',
        '--reporter=line',
      ],
      180,
    ],
    [
      'webkit-photos',
      [
        'npm',
        'exec',
        '--workspace',
        'web',
        '--',
        'playwright',
        'test',
        '--config',
        'playwright.photos.webkit.config.ts',
        '--reporter=line',
      ],
      60,
    ],
    [
      'offline',
      [
        'npm',
        'exec',
        '--workspace',
        'web',
        '--',
        'playwright',
        'test',
        '--config',
        'playwright.pwa.config.ts',
        '--reporter=line',
      ],
      30,
    ],
    [
      'offline-photos',
      [
        'npm',
        'exec',
        '--workspace',
        'web',
        '--',
        'playwright',
        'test',
        '--config',
        'playwright.photos.pwa.config.ts',
        '--reporter=line',
      ],
      30,
    ],
    ['combined-coverage', ['npm', 'run', 'test:coverage:check'], 30],
    [
      'bounded-import',
      ['bash', 'scripts/manual-validation-linux.sh', 'bounded-import'],
      15,
    ],
    [
      'native-postgis',
      ['bash', 'scripts/manual-validation-linux.sh', 'native-postgis'],
      20,
    ],
    [
      'isolated-engine',
      ['bash', 'scripts/manual-validation-linux.sh', 'isolated-engine'],
      30,
    ],
    [
      'gis-import',
      ['bash', 'scripts/manual-validation-linux.sh', 'gis-import'],
      30,
    ],
    [
      'local-stack',
      ['bash', 'scripts/manual-validation-linux.sh', 'local-stack'],
      60,
    ],
    [
      'python-audit',
      ['bash', 'scripts/manual-validation-linux.sh', 'python-audit'],
      15,
    ],
    [
      'secret-history',
      ['bash', 'scripts/manual-validation-linux.sh', 'secret-history'],
      30,
    ],
    [
      'static-analysis',
      ['bash', 'scripts/manual-validation-linux.sh', 'static-analysis'],
      30,
    ],
    ['production-build', ['npm', 'run', 'build'], 15],
  ].map(([id, command, minutes]) =>
    Object.freeze({
      id,
      command: Object.freeze(command),
      timeoutMs: minutes * 60_000,
    }),
  ),
);

/** Inherited test filters, cloud credentials and Node injection flags are excluded. */
export function manualValidationEnvironment(environment) {
  const permitted = [
    'PATH',
    'HOME',
    'USER',
    'LOGNAME',
    'LANG',
    'LC_ALL',
    'TMPDIR',
    'TZ',
  ];
  return {
    ...Object.fromEntries(
      permitted
        .filter((key) => environment[key])
        .map((key) => [key, environment[key]]),
    ),
    CI: 'true',
    GOMEMLIMIT: '256MiB',
    GOMAXPROCS: '2',
    PYTHONDONTWRITEBYTECODE: '1',
  };
}
