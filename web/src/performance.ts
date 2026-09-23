/** Bounded, local-only timings. No filenames, account IDs or photograph details. */
export function measureOperation(
  name: 'upload' | 'processing' | 'signing' | 'private-save' | 'upload-begin',
  start: number,
) {
  const key = `turnright:photo:${name}`;
  if (performance.getEntriesByName(key).length >= 100)
    performance.clearMeasures(key);
  performance.measure(key, { start, end: performance.now() });
}
