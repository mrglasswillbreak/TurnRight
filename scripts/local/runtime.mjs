import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { packageBin } from '../toolchain.mjs';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const runtime = path.join(root, '.local-runtime');
export const origin = 'http://127.0.0.1:5180';
export const supabaseCli = packageBin('supabase');

export function requireLocalUrl(value, name = 'Service URL') {
  const url = new URL(value);
  if (
    url.hostname !== '127.0.0.1' ||
    !['http:', 'postgresql:'].includes(url.protocol)
  )
    throw Error(`${name} must use the isolated loopback environment.`);
  return url;
}

export function requireDevelopmentHost() {
  if (
    process.env.VERCEL ||
    process.env.CI_PRODUCTION ||
    process.env.NODE_ENV === 'production'
  )
    throw Error(
      'Local development commands cannot run in a production environment.',
    );
}

export async function command(
  binary,
  args,
  {
    capture = false,
    env = process.env,
    input = '',
    timeout = 20 * 60_000,
  } = {},
) {
  if (binary === supabaseCli) {
    args = [supabaseCli, ...args];
    binary = process.execPath;
  }
  return new Promise((resolve, reject) => {
    // Development-only callers supply fixed Docker/Git/Node binaries and separate argv; no shell or request-provided executable is used.
    // nosemgrep: local-runtime.semgrep-rules.javascript.lang.security.detect-child-process
    const child = spawn(binary, args, {
      cwd: root,
      env,
      windowsHide: true,
      timeout,
      stdio: [
        input.length ? 'pipe' : 'ignore',
        capture ? 'pipe' : 'inherit',
        capture ? 'pipe' : 'inherit',
      ],
    });
    let stdout = '',
      stderr = '';
    let inputError;
    child.stdout?.on('data', (value) => {
      stdout += value;
    });
    child.stderr?.on('data', (value) => {
      stderr = (stderr + value).slice(-8000);
    });
    child.on('error', reject);
    child.stdin?.on('error', (error) => {
      inputError = error;
    });
    child.on('close', (code) => {
      if (code !== 0)
        reject(
          Error(
            `${path.basename(binary)} exited ${code}${capture ? ': ' + stderr.replace(/(?:eyJ[\w.-]+|sb_secret_[\w-]+)/g, '[redacted]') : ''}`,
          ),
        );
      else if (inputError)
        reject(
          Error(`${path.basename(binary)} could not receive command input.`),
        );
      else resolve(stdout);
    });
    child.stdin?.end(input);
  });
}

export async function readConfig() {
  requireDevelopmentHost();
  const config = JSON.parse(
    await readFile(path.join(runtime, 'services.json'), 'utf8'),
  );
  requireLocalUrl(config.API_URL, 'Supabase URL');
  requireLocalUrl(config.DB_URL, 'Database URL');
  if (!config.SERVICE_ROLE_KEY || !config.ANON_KEY)
    throw Error(
      'Local Supabase credentials are missing. Run npm run local:up.',
    );
  return config;
}

export function localEnvironment(config) {
  requireDevelopmentHost();
  requireLocalUrl(config.API_URL);
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (
      /^(VITE_|SUPABASE_|VERCEL_|GITHUB_|PUBLISHED_MAP_URL$|ADMIN_USER_ID$|CAMPUS_ID$|SOURCE_|OVERPASS_|TURNRIGHT_LOCAL|GIS_)/.test(
        key,
      )
    )
      delete env[key];
  return {
    ...env,
    NODE_ENV: 'development',
    SUPABASE_URL: config.API_URL,
    SUPABASE_SERVICE_ROLE_KEY: config.SERVICE_ROLE_KEY,
    VITE_SUPABASE_URL: config.API_URL,
    VITE_SUPABASE_ANON_KEY: config.ANON_KEY,
    VITE_LOCAL_DEVELOPMENT: 'true',
    TURNRIGHT_LOCAL_RUNTIME: '1',
    TURNRIGHT_LOCAL_DISPATCH_URL: `${origin}/__local/jobs`,
    TURNRIGHT_LOCAL_DISPATCH_TOKEN: config.dispatchToken,
    REPORT_RATE_SALT: config.reportSalt,
    PUBLISHED_MAP_URL: origin,
    GIS_IMAGE: 'turnright-gis',
    GIS_IMPORT_IMAGE: 'turnright-gis-import',
  };
}

export async function savePrivate(name, value) {
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  await writeFile(
    path.join(runtime, name),
    JSON.stringify(value, null, 2) + '\n',
    { mode: 0o600 },
  );
}
