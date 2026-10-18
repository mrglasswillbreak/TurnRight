import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { command, localEnvironment, origin, readConfig, requireDevelopmentHost, requireLocalUrl, root, runtime, savePrivate, supabaseCli } from './runtime.mjs';

requireDevelopmentHost();
const operation = process.argv[2];
if (!['up', 'down', 'reset', 'test'].includes(operation)) throw Error('Use up, down, reset or test.');
const nodeArgs = ['--import', path.join(root, 'web/node_modules/tsx/dist/loader.mjs')];
const excluded = 'studio,imgproxy,realtime,edge-runtime,logflare,vector,supavisor,mailpit';

async function services() {
  const config = JSON.parse(await command(supabaseCli, ['status', '--output', 'json'], { capture: true }));
  requireLocalUrl(config.API_URL);
  requireLocalUrl(config.DB_URL);
  let previous;
  try { previous = await readConfig(); } catch { /* First start. */ }
  config.dispatchToken = previous?.dispatchToken || randomBytes(32).toString('hex');
  config.reportSalt = previous?.reportSalt || randomBytes(32).toString('hex');
  await savePrivate('services.json', config);
  return config;
}

if (operation === 'down') {
  try {
    const config = await readConfig();
    await fetch(`${origin}/__local/stop`, { method: 'POST', headers: { Authorization: `Bearer ${config.dispatchToken}` } });
  } catch { /* The application may already be stopped. */ }
  await command(supabaseCli, ['stop']);
  console.log('Local services stopped; database and uploads are retained.');
} else if (operation === 'reset') {
  if (!process.argv.includes('--confirm-local-reset'))
    throw Error('This deletes local development work only. Run npm run local:reset -- --confirm-local-reset to reset it.');
  const config = await readConfig();
  requireLocalUrl(config.DB_URL);
  // Never pass --linked or a caller-supplied database URL.
  await command(supabaseCli, ['db', 'reset', '--local', '--no-seed']);
  await command(process.execPath, [...nodeArgs, 'scripts/local/seed.mts', '--reset'], { env: localEnvironment(await services()) });
} else if (operation === 'test') {
  const config = await readConfig();
  await command(process.execPath, [...nodeArgs, 'scripts/local/acceptance.mts'], { env: localEnvironment(config) });
} else {
  if (process.platform === 'win32') throw Error('Run the full local stack inside the documented Linux development container or WSL2. The public npm run dev command also works directly on Windows.');
  await command('docker', ['info'], { capture: true });
  try { await command('docker', ['network', 'inspect', 'turnright-local'], { capture: true }); }
  catch { await command('docker', ['network', 'create', '-o', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', 'turnright-local']); }
  await command(supabaseCli, ['start', '-x', excluded, '--network-id', 'turnright-local'], { capture: true });
  const config = await services();
  const env = localEnvironment(config);
  await command('docker', ['build', '-t', 'turnright-gis', 'scripts/gis']);
  await command('docker', ['build', '-t', 'turnright-gis-import', 'scripts/map_import']);
  await command(process.execPath, [...nodeArgs, 'scripts/local/seed.mts'], { env });
  const accounts = JSON.parse(await readFile(path.join(runtime, 'accounts.json'), 'utf8'));
  env.ADMIN_USER_ID = accounts.find(account => account.role === 'administrator').id;
  console.log(`Local editor: ${origin}/admin. Development account credentials: ${path.join(runtime, 'accounts.json')}`);
  await command(process.execPath, [...nodeArgs, 'scripts/local/server.mts'], { env, timeout: 0 });
}
