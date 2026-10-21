import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { convert } from 'ast-v8-to-istanbul';
import { parseAstAsync } from 'vitest/node';
import { root } from './toolchain.mjs';

export async function convertBrowserEntry(entry) {
  const relative = decodeURIComponent(new URL(entry.url).pathname).slice(1);
  if (
    !/^(src|components|lib|hooks)\//.test(relative) ||
    relative.includes('..')
  )
    return {};
  const filename = path.join(root, 'web', relative);
  const url = pathToFileURL(filename).href;
  const encoded = entry.source?.match(
    /sourceMappingURL=data:application\/json[^,]*;base64,([^\s]+)/,
  )?.[1];
  // Recovery tests replace modules with synthetic failures. Unmapped code earns
  // no coverage; the actual file remains in the full unit zero-hit inventory.
  if (!encoded) return {};
  const sourceMap = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  sourceMap.sources = sourceMap.sources.map(
    (source) => new URL(source, url).href,
  );
  return convert({
    code: entry.source,
    ast: await parseAstAsync(entry.source),
    sourceMap,
    coverage: { url, functions: entry.functions },
  });
}
