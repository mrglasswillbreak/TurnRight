import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// A fresh date is mandatory: ordinary test runs must never rewrite evidence.
export function documentationCapturePath(name: string) {
  const date = process.env.TURNRIGHT_DOCS_DATE;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error(
      'Set TURNRIGHT_DOCS_DATE to the new capture date (YYYY-MM-DD).',
    );
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('Invalid capture name.');
  const directory = resolve(
    import.meta.dirname,
    '../../../docs/assets/screenshots',
  );
  const target = resolve(directory, `tour-${name}-${date}.png`);
  if (existsSync(target))
    throw new Error(
      `Capture already exists: ${target}. Inspect it before removing an unsuccessful capture.`,
    );
  mkdirSync(directory, { recursive: true });
  return target;
}
