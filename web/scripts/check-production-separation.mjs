import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const forbidden = [
  'Sign in locally',
  'Local development accounts use the same session',
  'administrator@turnright.local',
  'editor@turnright.local',
  '.local-runtime/accounts.json',
  'TURNRIGHT_LOCAL_DISPATCH_TOKEN',
  'LocalSignIn',
];
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await inspect(file);
    else if (/\.(?:js|html|json)$/.test(file)) {
      const text = await readFile(file, 'utf8');
      if (forbidden.some((marker) => text.includes(marker)))
        throw Error(
          `Development authentication leaked into the production artifact: ${file}`,
        );
    }
  }
}
await inspect('dist');
console.log(
  'Production artifacts exclude local sign-in, seed identities and dispatcher credentials.',
);
