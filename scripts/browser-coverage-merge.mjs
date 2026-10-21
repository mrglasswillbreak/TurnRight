import { createHash } from 'node:crypto';
import { mergeScriptCovs } from '@bcoe/v8-coverage';

// Merge counts before parsing the same transformed module hundreds of times.
// Query strings may vary between reloads; source bytes must match exactly.
export function collectBrowserEntry(entries, entry) {
  const key =
    new URL(entry.url).pathname +
    '\0' +
    createHash('sha256')
      .update(entry.source || '')
      .digest('hex');
  const previous = entries.get(key);
  const coverage = {
    scriptId: '0',
    url: entry.url,
    functions: entry.functions,
  };
  const merged = mergeScriptCovs(
    previous ? [previous.coverage, coverage] : [coverage],
  );
  entries.set(key, { source: entry.source, coverage: merged });
}
