import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { repositoryFiles } from './source-files.mjs';
import { root } from './toolchain.mjs';

const inventory = JSON.parse(
  await readFile(path.join(root, 'scripts/configuration.json'), 'utf8'),
);
const references = new Map();
const patterns = [
  /(?:process\.env|import\.meta\.env)\??\.([A-Za-z_][A-Za-z0-9_]*)/g,
  /\b(?:env|environment)\??\.([A-Z][A-Z0-9_]+)/g,
  /(?:process\.env|import\.meta\.env|os\.environ|\benv|\benvironment)\[\s*['"]([A-Z][A-Z0-9_]+)['"]\s*\]/g,
  /os\.(?:getenv|environ\.get)\(\s*['"]([A-Z][A-Z0-9_]+)['"]/g,
  /\b(?:secrets|vars)\.([A-Z][A-Z0-9_]+)/g,
];
for (const file of repositoryFiles()) {
  if (
    !/\.(?:[cm]?[jt]sx?|py|ya?ml)$/.test(file) ||
    /\/(?:tests|vendor|generated|work)\//.test(file)
  )
    continue;
  const source = await readFile(path.join(root, file), 'utf8');
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const name = match[1];
      if (!references.has(name)) references.set(name, new Set());
      references.get(name).add(file);
    }
  }
}
const unknown = [...references.keys()].filter(
  (name) => !Object.hasOwn(inventory.variables, name),
);
if (unknown.length)
  throw Error(`Document new configuration references: ${unknown.join(', ')}`);
const scopes = new Set([
  'public',
  'server',
  'build',
  'worker',
  'local',
  'ci',
  'runtime',
  'tool',
]);
for (const [name, entry] of Object.entries(inventory.variables)) {
  if (
    !scopes.has(entry.scope) ||
    typeof entry.sensitive !== 'boolean' ||
    typeof entry.description !== 'string' ||
    !entry.description.trim()
  )
    throw Error(`Incomplete configuration entry: ${name}`);
  if (name.startsWith('VITE_') && (entry.sensitive || entry.scope !== 'public'))
    throw Error(`Browser configuration cannot contain a secret: ${name}`);
}
const lines = [
  '# Configuration inventory',
  '',
  'Generated from `scripts/configuration.json` by `npm run check:configuration -- --write`.',
  'The check fails when a new environment reference lacks an entry or this document drifts.',
  '',
  'Public development needs no credentials. The full local stack generates its own disposable',
  'credentials. Hosted editing requires the public Supabase pair and server Supabase pair;',
  'worker dispatch and publication additionally require their service configuration.',
  'Worker identifiers and claim tokens are supplied per job, never copied into a global `.env`.',
  '',
  'Use [the setup guide](CONFIGURATION.md) for placement and [.env.example](../.env.example)',
  'for the hosted setup template. Sensitive entries belong in local ignored state or a service',
  'secret store. Public keys and deployment IDs are configuration, not secret credentials.',
  '',
  '| Name | Scope | Sensitive | Purpose |',
  '| --- | --- | --- | --- |',
  ...Object.entries(inventory.variables).map(
    ([name, entry]) =>
      `| \`${name}\` | ${entry.scope} | ${entry.sensitive ? 'Yes' : 'No'} | ${entry.description.replaceAll('|', '\\|')} |`,
  ),
  '',
  'CI-only scanner switches and `TURNRIGHT_COVERAGE` are set by their workflow/test harness.',
  'Vite, Node, npm, GitHub and Vercel supply the entries marked as runtime/provider context.',
  'They are documented for traceability and do not add setup requirements.',
  '',
];
const document = lines.join('\n');
const target = path.join(root, 'docs/ENVIRONMENT.md');
if (process.argv.includes('--write')) await writeFile(target, document);
else if ((await readFile(target, 'utf8')).replaceAll('\r\n', '\n') !== document)
  throw Error(
    'Configuration documentation drifted. Run check:configuration -- --write.',
  );
console.log(
  `Documented ${Object.keys(inventory.variables).length} configuration entries; checked ${references.size} referenced names.`,
);
